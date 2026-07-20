// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
function baseUrl(url) {
    return url.replace(/\/+$/, '');
}
async function readJsonError(resp) {
    try {
        const body = await resp.json();
        if (typeof body.error === 'string')
            return body.error;
    }
    catch { /* body wasn't JSON */ }
    return `HTTP ${resp.status}`;
}
// GET /vendors/:address/legal — fetch the shared legal block for a wallet.
// Returns `{ legal: null }` for wallets with no registered apps.
export async function getVendorLegal(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/vendors/${encodeURIComponent(req.vendorAddress)}/legal`, {
        signal: req.signal,
        headers: { Authorization: `VendorSession ${req.vendorSessionToken}` },
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
// PATCH /vendors/:address/legal — updates the block on EVERY app the vendor
// owns in a single atomic sweep. Bypasses the pendingEdit staging that
// per-app metadata edits go through; legal fields are factual (not
// marketing copy) so admin review doesn't gain anything and staleness
// hurts CRD Art. 6 compliance.
export async function updateVendorLegal(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/vendors/${encodeURIComponent(req.vendorAddress)}/legal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
            signature: req.signature,
            payload: req.payload,
        }),
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
//# sourceMappingURL=vendorAccountClient.js.map