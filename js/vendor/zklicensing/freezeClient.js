// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
function baseUrl(url) {
    return url.replace(/\/+$/, '');
}
function envFreezeSlot() {
    // Runs both in Node (process.env) and browser (no `process`). The typeof
    // guard keeps bundlers from choking on the reference.
    if (typeof process === 'undefined' || !process.env)
        return null;
    const raw = process.env.FREEZE_AFTER_SLOT;
    if (!raw)
        return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}
// GET /health — raw payload. Callers that only need the freeze state
// should use resolveFreezeState() instead; this is exposed for UIs that
// surface slot / network info alongside freeze.
export async function getKeeperHealth(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(opts.keeperUrl)}/health`, { signal: opts.signal });
    if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
}
// Resolves the effective freeze state for the caller. When the source is
// the caller override or process.env, the current slot is not known
// client-side, so salesFrozen is filled from /health only — the override
// path returns { freezeAfterSlot: N, salesFrozen: false, currentSlot: null }
// and lets the keeper reject the actual prove call if the freeze has fired.
export async function resolveFreezeState(opts) {
    if (typeof opts.freezeAfterSlot === 'number' && opts.freezeAfterSlot > 0) {
        return { salesFrozen: false, freezeAfterSlot: opts.freezeAfterSlot, currentSlot: null };
    }
    const envSlot = envFreezeSlot();
    if (envSlot !== null) {
        return { salesFrozen: false, freezeAfterSlot: envSlot, currentSlot: null };
    }
    try {
        const health = await getKeeperHealth({
            keeperUrl: opts.keeperUrl,
            fetcher: opts.fetcher,
            signal: opts.signal,
        });
        return {
            salesFrozen: health.salesFrozen === true,
            freezeAfterSlot: typeof health.freezeAfterSlot === 'number' ? health.freezeAfterSlot : null,
            currentSlot: typeof health.slot === 'number' ? health.slot : null,
        };
    }
    catch {
        // /health unreachable — treat as no freeze so we don't block buys on a
        // transient network hiccup. The keeper's own guard is still the last
        // line of defense.
        return { salesFrozen: false, freezeAfterSlot: null, currentSlot: null };
    }
}
//# sourceMappingURL=freezeClient.js.map