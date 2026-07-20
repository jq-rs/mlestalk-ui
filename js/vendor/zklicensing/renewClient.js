// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * renewClient.ts
 *
 * Browser-safe client for the renew flow. Mirrors `buyClient.ts` in shape:
 * the caller drives the wallet step between `proveRenew` and `confirmRenew`
 * so the SDK stays wallet-agnostic.
 *
 * Unlike buy, renew carries a legally load-bearing `waiverAccepted` flag —
 * EU/UK CRD Article 16(m) extinguishes the 14-day right of withdrawal only
 * on the buyer's express affirmative act (consent to immediate delivery +
 * acknowledgment of loss of withdrawal). We refuse the /prove/renew call
 * when the flag is false to keep third-party integrators from silently
 * shipping a UI that omits the waiver gate.
 *
 * Also refused pre-network when the keeper's sales-freeze schedule has
 * fired (salesFrozen === true) — the keeper would 423 the request anyway,
 * so surfacing the specific message client-side avoids a wasted round-trip.
 */
import { resolveFreezeState } from './freezeClient.js';
import { readErrorBody, tryQueueBusyFromBody } from './proveErrors.js';
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
// POST /prove/renew — keeper compiles + proves the renew tx.
// Rejects locally when `waiverAccepted` is false; a network call in that
// state would be wasted work and would give the caller no signal that the
// legal precondition was missing. Also rejects when the keeper's freeze
// has fired — same reasoning.
export async function proveRenew(req) {
    if (req.waiverAccepted !== true) {
        throw new Error('waiverAccepted must be true — Article 16(m) waiver required to renew');
    }
    const fetcher = req.fetcher ?? fetch;
    const freeze = await resolveFreezeState({
        keeperUrl: req.keeperUrl,
        freezeAfterSlot: req.freezeAfterSlot,
        fetcher,
        signal: req.signal,
    });
    if (freeze.salesFrozen) {
        throw new Error('Sales frozen — new renewals refused ahead of scheduled hardfork migration');
    }
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/prove/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
            licenseHash: req.licenseHash,
            buyerAddress: req.buyerAddress,
            zkAppAddress: req.zkAppAddress,
            duration: req.duration,
        }),
    });
    if (!resp.ok) {
        const parsed = await readErrorBody(resp);
        const queueBusy = tryQueueBusyFromBody(parsed);
        if (queueBusy)
            throw queueBusy;
        throw new Error(parsed.message);
    }
    return await resp.json();
}
// POST /confirm/renew — promotes the in-memory renew intent to a pending
// LicenseRecord. Call this only after the wallet returns a txHash.
export async function confirmRenew(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/confirm/renew`, {
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
// Polls GET /license/:zkAppAddress/:licenseHash until the renew has landed
// on-chain (pending flipped and new expiry recorded) or the timeout fires.
// Mirrors pollBuyStatus, except the terminal condition is Mina-side rather
// than keeper-side buy-watch — renew has no dedicated watch map.
export async function pollRenewStatus(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const interval = opts.intervalMs ?? 10_000;
    const timeout = opts.timeoutMs ?? 20 * 60 * 1000;
    const startedAt = Date.now();
    const deadline = startedAt + timeout;
    const url = `${baseUrl(opts.keeperUrl)}/license/${encodeURIComponent(opts.zkAppAddress)}/${encodeURIComponent(opts.licenseHash)}`;
    while (true) {
        if (opts.signal?.aborted)
            throw new Error('pollRenewStatus aborted');
        let status = { status: 'unknown', elapsedMs: Date.now() - startedAt };
        try {
            const resp = await fetcher(url, { signal: opts.signal });
            if (resp.ok) {
                const body = await resp.json();
                if (!body.found) {
                    status = { status: 'unknown', elapsedMs: Date.now() - startedAt };
                }
                else if (body.pending === false && (body.expirySlot ?? 0) >= opts.newExpirySlot) {
                    status = {
                        status: 'confirmed',
                        expirySlot: body.expirySlot,
                        txHash: body.txHash ?? null,
                        elapsedMs: Date.now() - startedAt,
                    };
                }
                else {
                    status = {
                        status: 'pending',
                        expirySlot: body.expirySlot,
                        txHash: body.txHash ?? null,
                        elapsedMs: Date.now() - startedAt,
                    };
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
//# sourceMappingURL=renewClient.js.map