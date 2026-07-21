// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * licenseStore.ts
 *
 * Off-chain MerkleMap state for the licensing system.
 *
 * Records are keyed by (zkAppAddress, licenseHash). Each LicensingApp deploys
 * its own on-chain MerkleMap, so a passphrase used on two different apps
 * produces the same `licenseHash` but two distinct records. Lookups that omit
 * `zkAppAddress` would collide across apps — every API here takes it.
 *
 * Used by:
 *   - interact.ts / buyLicense.ts (CLI) — reads/writes directly
 *   - keeperService.ts              — exposes the same logic over HTTP
 */
import fs from 'fs/promises';
import { Bool, Field, MerkleMap, MerkleMapWitness, Poseidon, PublicKey, UInt32, UInt64 } from '../o1js/index.js';
import { GRACE_PERIOD_N, REFUND_WINDOW_N } from './contractInterface.js';
import { PENDING_REAP_SLOTS as _PENDING_REAP_SLOTS } from './licenseRecord.js';
export const PENDING_REAP_SLOTS = _PENDING_REAP_SLOTS;
export function licenseStorePath() {
    return process.env.LICENSE_STORE_PATH ?? 'licenses.json';
}
export async function readRecords() {
    let raw;
    try {
        raw = JSON.parse(await fs.readFile(licenseStorePath(), 'utf8'));
    }
    catch {
        return [];
    }
    if (!Array.isArray(raw))
        return [];
    const records = raw;
    // Records pre-dating composite keying lack `zkAppAddress` and cannot be
    // safely matched against any specific zkApp. Drop them with a warning so
    // bootstrap rebuilds them fresh from on-chain events.
    const filtered = records.filter(r => typeof r.zkAppAddress === 'string' && r.zkAppAddress.length > 0);
    if (filtered.length < records.length) {
        console.warn(`[licenseStore] dropped ${records.length - filtered.length} record(s) missing zkAppAddress — re-bootstrap to recover`);
    }
    return filtered;
}
async function writeRecords(records) {
    await fs.writeFile(licenseStorePath(), JSON.stringify(records, null, 2));
}
// Serialize all read-modify-write operations against licenses.json. Each
// mutating function does (readRecords → mutate → writeRecords); without a lock,
// two concurrent calls can interleave such that the second one's read predates
// the first one's write, and the second one's write then clobbers the first.
// This was visible during archive sync (applyEventsToStore fires many writes
// back-to-back) racing with /confirm/* writes from buyer flows.
let writeChain = Promise.resolve();
function withWriteLock(fn) {
    const result = writeChain.then(fn, fn);
    writeChain = result.then(() => { }, () => { });
    return result;
}
// Records belonging to a specific zkApp. Each zkApp owns an independent
// on-chain MerkleMap, so all map operations must filter first.
function recordsForApp(records, zkAppAddress) {
    return records.filter(r => r.zkAppAddress === zkAppAddress);
}
// Rebuild the license MerkleMap for a single zkApp. Only inserts entries
// with expirySlot > 0.
export function buildMap(records, zkAppAddress) {
    const map = new MerkleMap();
    for (const r of recordsForApp(records, zkAppAddress)) {
        if (r.expirySlot !== 0) {
            map.set(Field(r.licenseHash), Field(r.expirySlot));
        }
    }
    return map;
}
// Rebuild the escrow MerkleMap for a single zkApp:
// licenseHash → escrowCommitment(amount, slot, buyerKey). Only includes
// entries with live escrow (not released, not refunded) and a known buyer.
export function buildEscrowMap(records, zkAppAddress) {
    const map = new MerkleMap();
    for (const r of recordsForApp(records, zkAppAddress)) {
        if (!r.released && !r.refunded && r.purchaseSlot > 0 && r.buyerAddress) {
            const buyerKey = PublicKey.fromBase58(r.buyerAddress);
            const commitment = Poseidon.hash([
                UInt64.from(BigInt(r.purchaseAmount)).value,
                UInt32.from(r.purchaseSlot).value,
                buyerKey.x,
                buyerKey.isOdd.toField(),
            ]);
            map.set(Field(r.licenseHash), commitment);
        }
    }
    return map;
}
// Serialize a MerkleMapWitness to plain JSON (safe to send over HTTP).
export function serializeWitness(witness) {
    return {
        isLefts: witness.isLefts.map((b) => b.toBoolean()),
        siblings: witness.siblings.map((f) => f.toString()),
    };
}
// Reconstruct a MerkleMapWitness from serialized JSON.
export function deserializeWitness(json) {
    return new MerkleMapWitness(json.isLefts.map((b) => Bool(b)), json.siblings.map((s) => Field(s)));
}
// Returns the witness for a licenseHash key in the given zkApp's map.
export async function getWitness(zkAppAddress, licenseHash) {
    const records = await readRecords();
    const map = buildMap(records, zkAppAddress);
    const key = Field(licenseHash);
    const witness = map.getWitness(key);
    return {
        root: map.getRoot().toString(),
        currentValue: map.get(key).toString(),
        witness,
        serialized: serializeWitness(witness),
    };
}
// Look up a single license record by its composite key.
export async function getLicense(zkAppAddress, licenseHash) {
    const records = await readRecords();
    return records.find(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash) ?? null;
}
// Determine the status of a license. A license in the 7-day grace window is
// still considered 'active' so renewal is not urgently forced.
export function licenseStatus(record, currentSlot) {
    if (!record)
        return 'unknown';
    if (record.expirySlot === 0)
        return 'refunded';
    if (record.expirySlot + GRACE_PERIOD_N < currentSlot)
        return 'expired';
    return 'active';
}
// Add or update a license record (upsert by composite key).
export async function upsertLicense(record) {
    if (!record.zkAppAddress) {
        throw new Error('upsertLicense: record.zkAppAddress is required');
    }
    return withWriteLock(async () => {
        const records = await readRecords();
        const idx = records.findIndex(r => r.zkAppAddress === record.zkAppAddress && r.licenseHash === record.licenseHash);
        if (idx >= 0) {
            records[idx] = record;
        }
        else {
            records.push(record);
        }
        await writeRecords(records);
    });
}
// Update the expirySlot for an existing record (used by renew).
// `opts.markRenewed` flips renewedAtLeastOnce so stats can detect first-renewal
// without re-walking events. `opts.renewal` appends to the renewals[] log so
// stats can compute renewal revenue from the store alone.
export async function updateExpiry(zkAppAddress, licenseHash, expirySlot, opts = {}) {
    return withWriteLock(async () => {
        const records = await readRecords();
        const record = records.find(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash);
        if (!record)
            return false;
        record.expirySlot = expirySlot;
        if (opts.markRenewed)
            record.renewedAtLeastOnce = true;
        if (opts.renewal) {
            const renewals = (record.renewals ??= []);
            // Dedup by newExpiry — confirm-time and event-sync may both try to log
            // the same renewal, but each renewal advances expiry by a unique tier
            // amount, so newExpiry is a stable identifier.
            if (!renewals.some(r => r.newExpiry === opts.renewal.newExpiry)) {
                renewals.push(opts.renewal);
            }
        }
        await writeRecords(records);
        return true;
    });
}
// Clear license and escrow data after a confirmed refund. Also flips `refunded`.
export async function recordRefund(zkAppAddress, licenseHash) {
    return withWriteLock(async () => {
        const records = await readRecords();
        const record = records.find(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash);
        if (!record)
            return false;
        record.expirySlot = 0;
        record.purchaseSlot = 0;
        record.purchaseAmount = '0';
        record.refunded = true;
        await writeRecords(records);
        return true;
    });
}
// Mark escrow as released. Preserves purchaseAmount/purchaseSlot so stats can
// compute released revenue. The `released` flag is the truth signal —
// buildEscrowMap and getReleasableRecords filter on it directly.
export async function recordRelease(zkAppAddress, licenseHash, releaseSlot, txHash) {
    return withWriteLock(async () => {
        const records = await readRecords();
        const record = records.find(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash);
        if (!record)
            return false;
        record.released = true;
        if (releaseSlot !== undefined)
            record.releaseSlot = releaseSlot;
        if (txHash !== undefined)
            record.releaseTxHash = txHash;
        await writeRecords(records);
        return true;
    });
}
// Clear the pending flag on a record after a chain event confirms it landed.
export async function confirmRecord(zkAppAddress, licenseHash) {
    return withWriteLock(async () => {
        const records = await readRecords();
        const record = records.find(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash);
        if (!record)
            return false;
        if (!record.pending)
            return false;
        delete record.pending;
        delete record.provedAtSlot;
        await writeRecords(records);
        return true;
    });
}
// Apply a licenseIssued event atomically: confirm any pending /confirm/buy
// write, backfill initialExpirySlot/tier if missing, or create a fresh record.
// Doing the whole read-decide-write inside a single lock acquisition avoids the
// stale-snapshot hazard that would arise if archiveBootstrap called
// getLicense + confirmRecord + upsertLicense as three separate locked steps —
// a concurrent write between them could be clobbered by the upsert's
// pre-confirm snapshot.
export async function applyLicenseIssued(zkAppAddress, licenseHash, fields) {
    return withWriteLock(async () => {
        const records = await readRecords();
        const record = records.find(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash);
        let dirty = false;
        if (record) {
            if (record.pending) {
                delete record.pending;
                delete record.provedAtSlot;
                dirty = true;
            }
            if (record.initialExpirySlot === undefined) {
                record.initialExpirySlot = fields.expirySlot;
                dirty = true;
            }
            if (!record.tier && fields.tier) {
                record.tier = fields.tier;
                dirty = true;
            }
            if (fields.escrowless === true && record.escrowless !== true) {
                record.escrowless = true;
                dirty = true;
            }
        }
        else {
            records.push({
                zkAppAddress,
                licenseHash,
                expirySlot: fields.expirySlot,
                purchaseSlot: fields.purchaseSlot,
                purchaseAmount: fields.purchaseAmount,
                txHash: '',
                createdAt: new Date().toISOString(),
                initialExpirySlot: fields.expirySlot,
                ...(fields.tier ? { tier: fields.tier } : {}),
                ...(fields.escrowless === true ? { escrowless: true } : {}),
            });
            dirty = true;
        }
        if (dirty)
            await writeRecords(records);
    });
}
// Apply a licenseRenewed event atomically: clear any pending /confirm/renew
// write, align expirySlot with the event, and flip renewedAtLeastOnce.
// Symmetric to applyLicenseIssued — the archive-events path is what closes
// out a renew that the bestChain sweep missed (tx landed after the sweep's
// BESTCHAIN_DEPTH window rolled past), and without a pending-clear step here
// the flag on a landed record could be stuck forever.
//
// Does NOT append to renewals[] — that log is populated at /confirm/renew
// time from the intent (which carries amount + txHash); the archive event
// carries only newExpiry, so replaying it must not overwrite the richer
// confirm-time entry.
export async function applyLicenseRenewed(zkAppAddress, licenseHash, fields) {
    return withWriteLock(async () => {
        const records = await readRecords();
        const record = records.find(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash);
        if (!record)
            return false;
        let dirty = false;
        if (record.pending) {
            delete record.pending;
            delete record.provedAtSlot;
            dirty = true;
        }
        if (record.expirySlot !== fields.newExpiry) {
            record.expirySlot = fields.newExpiry;
            dirty = true;
        }
        if (!record.renewedAtLeastOnce) {
            record.renewedAtLeastOnce = true;
            dirty = true;
        }
        if (dirty)
            await writeRecords(records);
        return true;
    });
}
// Delete a record entirely (used to reap stale pending entries the buyer never submitted).
export async function deleteRecord(zkAppAddress, licenseHash) {
    return withWriteLock(async () => {
        const records = await readRecords();
        const idx = records.findIndex(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash);
        if (idx < 0)
            return false;
        records.splice(idx, 1);
        await writeRecords(records);
        return true;
    });
}
// List pending records whose prove slot is older than `currentSlot - maxAgeSlots`.
// Used by the reaper to drop records the buyer never actually signed/submitted.
export async function getStalePendingRecords(currentSlot, maxAgeSlots = PENDING_REAP_SLOTS) {
    const records = await readRecords();
    return records.filter((r) => r.pending && typeof r.provedAtSlot === 'number' && currentSlot - r.provedAtSlot > maxAgeSlots);
}
// Return all records where the refund window has passed and escrow is still live.
// Filters on the released/refunded flags so we don't re-release or release after refund.
export async function getReleasableRecords(currentSlot) {
    const records = await readRecords();
    return records.filter((r) => !r.released &&
        !r.refunded &&
        r.purchaseSlot > 0 &&
        r.zkAppAddress &&
        currentSlot > r.purchaseSlot + REFUND_WINDOW_N);
}
//# sourceMappingURL=licenseStore.js.map