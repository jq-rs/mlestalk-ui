// Copyright (c) 2025-2026 zkLicensing project developers
// All rights reserved.
/**
 * proveRetry.ts
 *
 * Shared 409-retry helper for the /prove/{buy,buy-no-escrow,renew,refund}
 * endpoints. The keeper serialises proofs per-zkAppAddress and 409s any
 * caller that arrives while another prove is in flight, returning
 * `{ retryAfterMs, inFlightKind }` in the body. This helper transparently
 * respects that hint and retries until the keeper accepts the call or a
 * caller-supplied budget is exhausted.
 *
 * The default budget is 20 minutes — long enough to survive several
 * back-to-back racing buyers (the keeper's in-flight marker TTL is only
 * ~5 minutes) but short enough that a truly stuck app fails a caller
 * rather than staring at a spinner indefinitely.
 */
// Thrown from postProveWithRetry when the total-wait budget is exhausted
// without the keeper accepting the prove call. Callers can catch this
// distinctly to render "try again later" copy rather than the generic
// per-endpoint error message.
export class ProveTimeoutError extends Error {
    waitedMs;
    totalBudgetMs;
    lastInFlightKind;
    name = 'ProveTimeoutError';
    constructor(waitedMs, totalBudgetMs, lastInFlightKind) {
        super(`Prove timeout after ${waitedMs}ms (budget ${totalBudgetMs}ms) — another ${lastInFlightKind} is still in progress on this app`);
        this.waitedMs = waitedMs;
        this.totalBudgetMs = totalBudgetMs;
        this.lastInFlightKind = lastInFlightKind;
    }
}
export const DEFAULT_PROVE_TOTAL_BUDGET_MS = 20 * 60 * 1000;
// Sleep for `ms`, or reject if `signal` fires. Kept small and self-contained
// so the retry loop stays readable.
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted)
            return reject(new Error('prove aborted'));
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new Error('prove aborted'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
// POST `body` as JSON to `url`. On 409 with `{ retryAfterMs, inFlightKind }`
// in the body, sleep and retry up to `totalBudgetMs`. Returns the first
// non-in-flight-409 response (including other 409s and non-ok responses)
// so callers keep their existing per-endpoint error mapping intact.
export async function postProveWithRetry(opts) {
    const budget = opts.totalBudgetMs ?? DEFAULT_PROVE_TOTAL_BUDGET_MS;
    const startedAt = Date.now();
    while (true) {
        if (opts.signal?.aborted)
            throw new Error('prove aborted');
        const resp = await opts.fetcher(opts.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: opts.signal,
            body: JSON.stringify(opts.body),
        });
        if (resp.status !== 409)
            return resp;
        let body = null;
        try {
            body = await resp.clone().json();
        }
        catch { /* not JSON */ }
        if (body == null || typeof body.retryAfterMs !== 'number' || typeof body.inFlightKind !== 'string') {
            return resp;
        }
        const waitedMs = Date.now() - startedAt;
        if (waitedMs >= budget) {
            throw new ProveTimeoutError(waitedMs, budget, body.inFlightKind);
        }
        opts.onWaiting?.({ inFlightKind: body.inFlightKind, waitedMs, retryAfterMs: body.retryAfterMs });
        // Cap the sleep at the remaining budget so we never do a doomed wait
        // followed by an immediate ProveTimeoutError check on next iteration.
        const remaining = budget - waitedMs;
        await sleep(Math.min(body.retryAfterMs, remaining), opts.signal);
    }
}
//# sourceMappingURL=proveRetry.js.map