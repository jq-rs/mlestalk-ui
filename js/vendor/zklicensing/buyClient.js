// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * buyClient.ts
 *
 * Browser-safe client for the buy flow. Exposes the three keeper roundtrips
 * (derive identity → prove → confirm) as small, individually testable
 * functions plus a `pollBuyStatus` helper. Deliberately does NOT talk to a
 * wallet — the caller drives the wallet step between `proveBuy` and
 * `confirmBuy`, so the SDK stays wallet-agnostic and can be reused by CLI
 * tools, alternate UIs, and third-party integrators.
 *
 * Peer dep: o1js (for Poseidon + Encoding). Consumers of ./buy must have
 * o1js in their dependency graph.
 */
import { Encoding, Poseidon } from '../o1js/index.js';
import { resolveFreezeState } from './freezeClient.js';
import { REFUND_WINDOW_N, TOLERANCE_WINDOW_N } from './contractInterface.js';
import { readErrorBody, tryQueueBusyFromBody } from './proveErrors.js';
// Derive the two hashes the buy flow keys off. Deterministic in the
// passphrase — same passphrase always maps to the same licenseHash on a
// given zkApp, so a buyer's passphrase choice locks in their license
// identity from day one. Only `licenseHash` is sent to the keeper (see
// proveBuy); `secretHash` stays on the buyer's device and is used only by
// the client-side LicenseOwnershipProgram challenge/response.
export function deriveBuyIdentity(passphrase) {
    const secretHash = Poseidon.hash(Encoding.stringToFields(passphrase));
    const licenseHash = Poseidon.hash([secretHash]);
    return { secretHash: secretHash.toString(), licenseHash: licenseHash.toString() };
}
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
// POST /prove/buy — keeper compiles + proves the buy tx.
// The buyer's wallet then signs the returned provenTxJson.
//
// Pre-network guards:
//   - salesFrozen === true → refuse immediately (keeper would 423 anyway).
//   - freezeAfterSlot announced AND this buy's 14-day refund window would
//     extend past the freeze slot AND refundWaiverAccepted !== true →
//     refuse (buyer must explicitly accept that the scheduled hardfork
//     can truncate their refund window). Buys whose full window ends
//     before the freeze proceed without a waiver.
//
// Endpoint routing:
//   - refundWaiverAccepted === true → POST /prove/buy-no-escrow. The no-escrow
//     circuit method pays vendor+platform directly (98/2 split, no escrow
//     tree write). This is chosen either voluntarily by the buyer (opting out
//     of the 14-day statutory right of withdrawal in exchange for immediate
//     delivery) or forced by a freeze overlap.
//   - refundWaiverAccepted !== true → POST /prove/buy (standard escrow path
//     with a 14-day refund window).
export async function proveBuy(req) {
    const fetcher = req.fetcher ?? fetch;
    const freeze = await resolveFreezeState({
        keeperUrl: req.keeperUrl,
        freezeAfterSlot: req.freezeAfterSlot,
        fetcher,
        signal: req.signal,
    });
    if (freeze.salesFrozen) {
        throw new Error('Sales frozen — new buys refused ahead of scheduled hardfork migration');
    }
    let windowOverlapsFreeze = false;
    if (freeze.freezeAfterSlot !== null) {
        // Waiver required when the refund window would overlap the freeze, or
        // when the current slot is unknown client-side (safe default). The
        // +TOLERANCE_WINDOW_N margin accounts for slot-precondition slop
        // between prove and inclusion: the real inclusion slot can be up to
        // TOLERANCE_WINDOW_N slots past `currentSlot`, so we include that in
        // the overlap comparison rather than let a late inclusion silently
        // push the refund deadline past the freeze without a waiver.
        windowOverlapsFreeze =
            freeze.currentSlot === null ||
                freeze.currentSlot + REFUND_WINDOW_N + TOLERANCE_WINDOW_N > freeze.freezeAfterSlot;
        if (windowOverlapsFreeze && req.refundWaiverAccepted !== true) {
            throw new Error(`refundWaiverAccepted must be true — the scheduled hardfork at slot ${freeze.freezeAfterSlot} can truncate the 14-day refund window`);
        }
    }
    const useNoEscrow = req.refundWaiverAccepted === true;
    const endpoint = useNoEscrow ? '/prove/buy-no-escrow' : '/prove/buy';
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
            licenseHash: req.licenseHash,
            buyerAddress: req.buyerAddress,
            zkAppAddress: req.zkAppAddress,
            duration: req.duration,
            buyerCountry: req.buyerCountry,
            ...(req.buyerZip ? { buyerZip: req.buyerZip } : {}),
            ...(req.refundWaiverAccepted === true ? { refundWaiverAccepted: true } : {}),
        }),
    });
    if (!resp.ok) {
        // Distinct guidance for the no-escrow path: a 404 here means the
        // vendor's zkApp was deployed before the no-escrow method existed. Fix
        // is a redeploy through the hardfork-migration flow (§12.13); until
        // then the escrowless (waiver) path is unavailable on this vendor.
        if (useNoEscrow && resp.status === 404) {
            throw new Error('Keeper does not offer /prove/buy-no-escrow — this vendor\'s zkApp does not support the escrowless (waiver) path; vendor must redeploy via the hardfork-migration flow');
        }
        const parsed = await readErrorBody(resp);
        const queueBusy = tryQueueBusyFromBody(parsed);
        if (queueBusy)
            throw queueBusy;
        throw new Error(parsed.message);
    }
    return await resp.json();
}
// POST /confirm/buy — promotes the in-memory intent staged by /prove/buy
// into a persisted (pending: true) LicenseRecord. Call this only after the
// wallet has actually returned a txHash — a cancelled or dropped signature
// leaves the intent to expire on its own.
export async function confirmBuy(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/confirm/buy`, {
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
// Polls GET /buy/status until it returns a terminal state ('confirmed' or
// 'failed') or the timeout fires. Terminal state is resolved via the
// returned status; 'unknown' just means the keeper hasn't seen the tx yet.
export async function pollBuyStatus(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const interval = opts.intervalMs ?? 3_000;
    const timeout = opts.timeoutMs ?? 10 * 60 * 1000;
    const deadline = Date.now() + timeout;
    const url = `${baseUrl(opts.keeperUrl)}/buy/status?licenseHash=${encodeURIComponent(opts.licenseHash)}`;
    while (true) {
        if (opts.signal?.aborted)
            throw new Error('pollBuyStatus aborted');
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
//# sourceMappingURL=buyClient.js.map