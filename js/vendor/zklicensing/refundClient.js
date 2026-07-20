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
// POST /prove/refund — keeper compiles + proves the refund tx.
// The keeper 409s when the 14-day window has closed; that error surfaces
// through the thrown `Error` message.
export async function proveRefund(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/prove/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
            licenseHash: req.licenseHash,
            buyerAddress: req.buyerAddress,
            zkAppAddress: req.zkAppAddress,
        }),
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return await resp.json();
}
// POST /confirm/refund — promotes the in-memory refund intent to a
// pending (refunded: true) LicenseRecord. Best-effort: if the caller
// swallows the failure, eventSyncLoop will still pick up the on-chain
// refund event.
export async function confirmRefund(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/confirm/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
            zkAppAddress: req.zkAppAddress,
            licenseHash: req.licenseHash,
            txHash: req.txHash,
        }),
    });
    if (!resp.ok)
        throw new Error(await readJsonError(resp));
    return { ok: true };
}
// Polls GET /license/:zkAppAddress/:licenseHash until the refund has landed
// on-chain (record.status === 'refunded') or the timeout fires. Mirrors
// pollBuyStatus / pollRenewStatus.
export async function pollRefundStatus(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const interval = opts.intervalMs ?? 10_000;
    const timeout = opts.timeoutMs ?? 20 * 60 * 1000;
    const startedAt = Date.now();
    const deadline = startedAt + timeout;
    const url = `${baseUrl(opts.keeperUrl)}/license/${encodeURIComponent(opts.zkAppAddress)}/${encodeURIComponent(opts.licenseHash)}`;
    while (true) {
        if (opts.signal?.aborted)
            throw new Error('pollRefundStatus aborted');
        let status = { status: 'unknown', elapsedMs: Date.now() - startedAt };
        try {
            const resp = await fetcher(url, { signal: opts.signal });
            if (resp.ok) {
                const body = await resp.json();
                if (!body.found) {
                    status = { status: 'unknown', elapsedMs: Date.now() - startedAt };
                }
                else if (body.status === 'refunded') {
                    status = { status: 'confirmed', txHash: body.txHash ?? null, elapsedMs: Date.now() - startedAt };
                }
                else {
                    status = { status: 'pending', txHash: body.txHash ?? null, elapsedMs: Date.now() - startedAt };
                }
            }
        }
        catch { /* transient network — try again on next tick */ }
        opts.onTick?.(status);
        if (status.status === 'confirmed')
            return status;
        if (Date.now() >= deadline)
            return status;
        await new Promise((r) => setTimeout(r, interval));
    }
}
//# sourceMappingURL=refundClient.js.map