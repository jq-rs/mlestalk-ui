// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * archiveBootstrap.ts
 *
 * Two layers:
 *   - bootstrapFromArchive() fetches zkApp events and returns them normalized.
 *     No writes. Caller decides what to do with the events.
 *   - applyEventsToStore() writes the events to licenseStore.
 *
 * Events handled (write side):
 *   licenseIssued          → applyLicenseIssued
 *   licenseIssuedNoEscrow  → applyLicenseIssued (escrowless: true)
 *   licenseRenewed         → updateExpiry
 *   licenseMigrated        → applyLicenseIssued (escrowless: true, migrated: true)
 *   refundIssued           → recordRefund
 *   fundsReleased          → recordRelease
 *   priceUpdated           → ignored (price-history tracking lives in the private
 *                             zklicensing-app keeper alongside vendor-stats)
 *
 * Uses LicensingAppEventsContract (from contractInterface) for fetchEvents —
 * this lets the public verify service read events without depending on the
 * private LicensingApp circuit source.
 */
import { PublicKey, UInt32 } from '../o1js/index.js';
import { LicensingAppEventsContract, MONTHLY_SLOTS_N, ONE_YEAR_SLOTS_N, FIVE_YEAR_SLOTS_N, } from './contractInterface.js';
import { applyLicenseIssued, applyLicenseRenewed, recordRefund, recordRelease, } from './licenseStore.js';
export const SYNC_CHUNK_SLOTS = 10_000;
export const MAX_LOOKBACK_SLOTS = 525_600;
// Back-derive the duration tier from (expirySlot - purchaseSlot). Tolerance
// of ±2 slots matches the SLOT_TOLERANCE used in the circuit.
export function tierFromExpiryDelta(slots) {
    const within = (target) => Math.abs(slots - target) <= 2;
    if (within(MONTHLY_SLOTS_N))
        return 'monthly';
    if (within(ONE_YEAR_SLOTS_N))
        return 'yearly';
    if (within(FIVE_YEAR_SLOTS_N))
        return 'fiveYear';
    return null;
}
export async function bootstrapFromArchive(zkAppAddress, range = {}) {
    const pubKey = PublicKey.fromBase58(zkAppAddress);
    const zkApp = new LicensingAppEventsContract(pubKey);
    const start = range.from !== undefined ? UInt32.from(range.from) : undefined;
    const end = range.to !== undefined ? UInt32.from(range.to) : undefined;
    const allEvents = await zkApp.fetchEvents(start, end);
    const canonical = [...allEvents]
        .filter(e => e.chainStatus === 'canonical')
        .sort((a, b) => Number(a.globalSlot.toString()) - Number(b.globalSlot.toString()));
    const events = [];
    for (const ev of canonical) {
        const slot = Number(ev.globalSlot.toString());
        switch (ev.type) {
            case 'priceUpdated': {
                const data = ev.event.data;
                events.push({
                    kind: 'priceUpdated',
                    slot,
                    priceMonthly: BigInt(data.priceMonthly.toString()),
                    priceYearly: BigInt(data.priceYearly.toString()),
                    priceFiveYear: BigInt(data.priceFiveYear.toString()),
                });
                break;
            }
            case 'licenseIssued': {
                const data = ev.event.data;
                events.push({
                    kind: 'licenseIssued',
                    slot,
                    licenseHash: data.licenseHash.toString(),
                    amount: BigInt(data.amount.toString()),
                    issuedSlot: Number(data.slot.toString()),
                    expirySlot: Number(data.expirySlot.toString()),
                });
                break;
            }
            case 'licenseIssuedNoEscrow': {
                const data = ev.event.data;
                events.push({
                    kind: 'licenseIssuedNoEscrow',
                    slot,
                    licenseHash: data.licenseHash.toString(),
                    amount: BigInt(data.amount.toString()),
                    issuedSlot: Number(data.slot.toString()),
                    expirySlot: Number(data.expirySlot.toString()),
                });
                break;
            }
            case 'licenseRenewed': {
                const data = ev.event.data;
                events.push({
                    kind: 'licenseRenewed',
                    slot,
                    licenseHash: data.licenseHash.toString(),
                    newExpiry: Number(data.newExpiry.toString()),
                });
                break;
            }
            case 'licenseMigrated': {
                const data = ev.event.data;
                events.push({
                    kind: 'licenseMigrated',
                    slot,
                    licenseHash: data.licenseHash.toString(),
                    expirySlot: Number(data.expirySlot.toString()),
                    ancestorGen: Number(data.ancestorGen.toString()),
                });
                break;
            }
            case 'refundIssued':
                events.push({ kind: 'refundIssued', slot, licenseHash: ev.event.data.toString() });
                break;
            case 'fundsReleased':
                events.push({ kind: 'fundsReleased', slot, licenseHash: ev.event.data.toString() });
                break;
        }
    }
    const maxSeenSlot = canonical.length === 0
        ? -1
        : Number(canonical[canonical.length - 1].globalSlot.toString());
    return { maxSeenSlot, events };
}
export async function applyEventsToStore(zkAppAddress, events) {
    const warnings = [];
    let count = 0;
    for (const ev of events) {
        switch (ev.kind) {
            case 'priceUpdated':
                break;
            case 'licenseIssued': {
                const tier = tierFromExpiryDelta(ev.expirySlot - ev.issuedSlot) ?? undefined;
                await applyLicenseIssued(zkAppAddress, ev.licenseHash, {
                    expirySlot: ev.expirySlot,
                    purchaseSlot: ev.issuedSlot,
                    purchaseAmount: ev.amount.toString(),
                    ...(tier ? { tier } : {}),
                });
                count++;
                break;
            }
            case 'licenseIssuedNoEscrow': {
                const tier = tierFromExpiryDelta(ev.expirySlot - ev.issuedSlot) ?? undefined;
                await applyLicenseIssued(zkAppAddress, ev.licenseHash, {
                    expirySlot: ev.expirySlot,
                    purchaseSlot: ev.issuedSlot,
                    purchaseAmount: ev.amount.toString(),
                    escrowless: true,
                    ...(tier ? { tier } : {}),
                });
                count++;
                break;
            }
            case 'licenseRenewed': {
                const ok = await applyLicenseRenewed(zkAppAddress, ev.licenseHash, { newExpiry: ev.newExpiry });
                if (!ok)
                    warnings.push(`renew for unknown license ${ev.licenseHash.slice(0, 16)}…`);
                break;
            }
            case 'licenseMigrated': {
                await applyLicenseIssued(zkAppAddress, ev.licenseHash, {
                    expirySlot: ev.expirySlot,
                    purchaseSlot: 0,
                    purchaseAmount: '0',
                    escrowless: true,
                });
                count++;
                break;
            }
            case 'refundIssued': {
                const ok = await recordRefund(zkAppAddress, ev.licenseHash);
                if (!ok)
                    warnings.push(`refund for unknown license ${ev.licenseHash.slice(0, 16)}…`);
                break;
            }
            case 'fundsReleased': {
                const ok = await recordRelease(zkAppAddress, ev.licenseHash, ev.slot);
                if (!ok)
                    warnings.push(`release for unknown license ${ev.licenseHash.slice(0, 16)}…`);
                break;
            }
        }
    }
    return { count, warnings };
}
export async function discoverAppCreatedSlot(zkAppAddress, nowSlot, lookbackSlots = MAX_LOOKBACK_SLOTS) {
    const pubKey = PublicKey.fromBase58(zkAppAddress);
    const zkApp = new LicensingAppEventsContract(pubKey);
    const floor = Math.max(1, nowSlot - lookbackSlots);
    let to = nowSlot;
    while (to >= floor) {
        const from = Math.max(floor, to - SYNC_CHUNK_SLOTS + 1);
        const events = await zkApp.fetchEvents(UInt32.from(from), UInt32.from(to));
        const created = events
            .filter(e => e.chainStatus === 'canonical' && e.type === 'appCreated')
            .sort((a, b) => Number(a.globalSlot.toString()) - Number(b.globalSlot.toString()));
        if (created.length > 0) {
            return Number(created[0].globalSlot.toString());
        }
        if (from <= floor)
            break;
        to = from - 1;
    }
    return null;
}
const inFlightBootstraps = new Map();
export async function lazyBootstrap(zkAppAddress) {
    const existing = inFlightBootstraps.get(zkAppAddress);
    if (existing)
        return existing;
    const short = zkAppAddress.slice(0, 12) + '…';
    const p = (async () => {
        try {
            const { events } = await bootstrapFromArchive(zkAppAddress);
            const { count, warnings } = await applyEventsToStore(zkAppAddress, events);
            for (const w of warnings)
                console.warn(`[lazy-bootstrap] ${short}: ${w}`);
            if (count > 0) {
                console.log(`[lazy-bootstrap] ${short}: replayed ${count} record(s)`);
            }
        }
        catch (e) {
            console.warn(`[lazy-bootstrap] ${short}: ${e?.message ?? e}`);
        }
        finally {
            inFlightBootstraps.delete(zkAppAddress);
        }
    })();
    inFlightBootstraps.set(zkAppAddress, p);
    return p;
}
//# sourceMappingURL=archiveBootstrap.js.map