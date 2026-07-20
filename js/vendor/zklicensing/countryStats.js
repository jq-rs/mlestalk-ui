// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
import { zipToState } from './zipToState.js';
export { zipToState } from './zipToState.js';
// LicensingApp charges a 2 % platform fee (200 basis points); the vendor
// receives the remaining 9 800 bps. Keep this in sync with the on-chain
// constant in LicensingApp.
const PLATFORM_FEE_BASIS_POINTS = 200n;
const VENDOR_BPS = 10000n - PLATFORM_FEE_BASIS_POINTS;
// 90 s/slot post-Mesa. Used only for slot→time fallback attribution.
const SLOT_DURATION_MS = 90_000;
// tzOffsetMinutes: signed minutes east of UTC (e.g. +60 for CET, -480 for PST).
// Purchase/renewal timestamps are shifted by this offset before extracting the
// calendar year, so the "tax year" cut-over aligns with the operator's local
// clock instead of hardcoded UTC. Defaults to 0 (UTC) for callers who don't
// pass it — preserves the pre-tz behavior.
export function computeCountryBreakdown(apps, records, currentSlot, nowMs, tzOffsetMinutes = 0) {
    const appByAddress = new Map(apps.map(a => [a.zkAppAddress, a.appId]));
    const byYear = {};
    const yearSet = new Set();
    const tzShiftMs = tzOffsetMinutes * 60_000;
    const ensureYear = (year) => {
        let yb = byYear[year];
        if (!yb) {
            yb = { aggregate: {}, byApp: {} };
            byYear[year] = yb;
            yearSet.add(year);
        }
        return yb;
    };
    const ensureAppBucket = (yb, appId) => {
        let ab = yb.byApp[appId];
        if (!ab) {
            ab = {};
            yb.byApp[appId] = ab;
        }
        return ab;
    };
    const add = (bucket, code, count, revenueNano, state) => {
        let b = bucket[code];
        if (!b) {
            b = { count: 0, revenueMina: 0 };
            bucket[code] = b;
        }
        b.count += count;
        b.revenueMina += Number(revenueNano) / 1e9;
        // State sub-bucket only for US rows whose ZIP resolved to a state.
        // Non-US or unresolvable rows just add to the country total.
        if (code === 'US' && state) {
            const states = b.states ?? (b.states = {});
            let sb = states[state];
            if (!sb) {
                sb = { count: 0, revenueMina: 0 };
                states[state] = sb;
            }
            sb.count += count;
            sb.revenueMina += Number(revenueNano) / 1e9;
        }
    };
    const slotToYear = (slot) => {
        if (currentSlot <= 0)
            return null;
        const ms = nowMs - (currentSlot - slot) * SLOT_DURATION_MS;
        const y = new Date(ms + tzShiftMs).getUTCFullYear();
        return Number.isFinite(y) ? y : null;
    };
    for (const r of records) {
        const appId = appByAddress.get(r.zkAppAddress);
        if (!appId)
            continue;
        const country = r.buyerCountry && /^[A-Z]{2}$/.test(r.buyerCountry) ? r.buyerCountry : '??';
        // Only US rows carry a meaningful ZIP for sales-tax purposes; derive
        // the state jurisdiction here and let `add` roll it up. Non-US ZIPs
        // and unresolvable prefixes fall through to country-total only.
        const state = country === 'US' && r.buyerZip ? zipToState(r.buyerZip) : undefined;
        // Purchase — attribute to the year of confirm-on-chain (createdAt).
        // Fallback: slot-derived time for legacy records that lack createdAt.
        let purchaseYear = null;
        if (r.createdAt) {
            const y = new Date(new Date(r.createdAt).getTime() + tzShiftMs).getUTCFullYear();
            if (Number.isFinite(y))
                purchaseYear = y;
        }
        if (purchaseYear === null && r.purchaseSlot > 0) {
            purchaseYear = slotToYear(r.purchaseSlot);
        }
        if (purchaseYear !== null) {
            const yb = ensureYear(purchaseYear);
            const ab = ensureAppBucket(yb, appId);
            const purchaseCut = (!r.refunded && r.purchaseAmount && r.purchaseAmount !== '0')
                ? (BigInt(r.purchaseAmount) * VENDOR_BPS) / 10000n
                : 0n;
            add(ab, country, 1, purchaseCut, state);
            add(yb.aggregate, country, 1, purchaseCut, state);
        }
        // Renewals — revenue only (no license count), attributed to renewal year.
        for (const rn of r.renewals ?? []) {
            const y = slotToYear(rn.slot);
            if (y === null)
                continue;
            const yb = ensureYear(y);
            const ab = ensureAppBucket(yb, appId);
            const cut = (BigInt(rn.amount) * VENDOR_BPS) / 10000n;
            add(ab, country, 0, cut, state);
            add(yb.aggregate, country, 0, cut, state);
        }
    }
    return {
        years: Array.from(yearSet).sort((a, b) => b - a),
        byYear,
    };
}
//# sourceMappingURL=countryStats.js.map