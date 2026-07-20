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
// POST /prove/deploy — keeper generates the throwaway zkApp keypair, assembles
// the deploy+initialize tx, proves it, and signs the zkApp AccountUpdate with
// the throwaway key. The caller forwards `provenTxJson` to the vendor's wallet
// for the fee-payer signature.
//
// At least one of the three prices must be > 0 (enforced by the keeper *and*
// by the circuit's `initialize()`).
export async function proveDeploy(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/prove/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
            senderPublicKey: req.senderPublicKey,
            vendorAddress: req.vendorAddress,
            priceMonthlyMina: req.priceMonthlyMina,
            priceYearlyMina: req.priceYearlyMina,
            priceFiveYearMina: req.priceFiveYearMina,
        }),
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
// Polls GET /deploy/status until it returns a terminal state ('confirmed' or
// 'failed') or the timeout fires. 'unknown' means the keeper hasn't seen the
// tx yet (register step not called or watch not armed).
export async function pollDeployStatus(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const interval = opts.intervalMs ?? 3_000;
    const timeout = opts.timeoutMs ?? 10 * 60 * 1000;
    const deadline = Date.now() + timeout;
    const url = `${baseUrl(opts.keeperUrl)}/deploy/status?zkAppAddress=${encodeURIComponent(opts.zkAppAddress)}`;
    while (true) {
        if (opts.signal?.aborted)
            throw new Error('pollDeployStatus aborted');
        let status = { status: 'unknown' };
        try {
            const resp = await fetcher(url, { signal: opts.signal });
            if (resp.ok)
                status = await resp.json();
        }
        catch { /* transient network — try again on next tick */ }
        opts.onTick?.(status);
        if (status.status === 'confirmed' || status.status === 'failed')
            return status;
        if (Date.now() >= deadline)
            return status;
        await new Promise((r) => setTimeout(r, interval));
    }
}
function adminHeaders(token) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };
}
// POST /admin/redeploy/:appId — one-shot migration for a single app. Rejects
// with a descriptive error if any keeper-side guard fails (409) or the deploy
// itself throws (500). The returned `zkAppAddress` is the *new* v2 address; the
// old one stays on chain but is no longer referenced by keeper records.
export async function redeployApp(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/admin/redeploy/${encodeURIComponent(req.appId)}`, {
        method: 'POST',
        headers: adminHeaders(req.adminToken),
        signal: req.signal,
        body: JSON.stringify(req.force ? { force: true } : {}),
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
// POST /admin/redeploy-all — iterate every registered app and attempt migration.
// Idempotent: apps already migrated surface as ok:false with a clear error, so
// a rerun after a partial failure retries only the remaining ones. Callers
// should inspect `results` for per-app outcomes rather than relying on the
// top-level `ok`, which is always true unless the whole request failed.
export async function redeployAll(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/admin/redeploy-all`, {
        method: 'POST',
        headers: adminHeaders(req.adminToken),
        signal: req.signal,
        body: JSON.stringify(req.force ? { force: true } : {}),
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
// GET /vendor/redeploy/:appId/preflight — read-only guard status. No nonce
// consumed, no signature required. UI decides button state from the returned
// fields; 404 means the app itself is unknown (a distinct failure mode from a
// known app failing individual guards).
export async function fetchVendorRedeployPreflight(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(opts.keeperUrl)}/vendor/redeploy/${encodeURIComponent(opts.appId)}/preflight`, {
        signal: opts.signal,
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
// GET /vendor/redeploy/:appId/challenge — mint a one-shot nonce that the
// vendor's wallet signs. The nonce is bound to the appId and expires in 60s;
// consumed on /prove.
export async function getVendorRedeployChallenge(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(opts.keeperUrl)}/vendor/redeploy/${encodeURIComponent(opts.appId)}/challenge`, {
        signal: opts.signal,
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
// POST /vendor/redeploy/:appId/prove — keeper verifies the nonce + signature
// against the on-chain vendor of the app, runs all redeploy guards, generates
// a throwaway zkApp keypair, builds and proves the deploy+initialize tx, and
// signs the zkApp AU with the throwaway key. Returns the tx JSON for the
// vendor's wallet to add the fee-payer signature and broadcast.
export async function proveVendorRedeploy(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/vendor/redeploy/${encodeURIComponent(req.appId)}/prove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
            nonce: req.nonce,
            signature: req.signature,
            senderPublicKey: req.senderPublicKey,
            ...(req.force ? { force: true } : {}),
        }),
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
// POST /vendor/redeploy/:appId/register — arm the keeper's deploy-watcher on
// the new address. On confirmation the keeper mutates AppRecord to promote
// the new deployment (push old to deploymentHistory[], overwrite live fields,
// clear event-sync cursors). Idempotent to duplicate calls (the watcher
// checks whether one is already armed for the address). Poll GET
// /deploy/status?zkAppAddress=<new> — or use pollDeployStatus — for landing
// progress, same as first-time deploys.
export async function registerVendorRedeploy(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/vendor/redeploy/${encodeURIComponent(req.appId)}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({ redeployId: req.redeployId, txHash: req.txHash }),
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
//# sourceMappingURL=deployClient.js.map