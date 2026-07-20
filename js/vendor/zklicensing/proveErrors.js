// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * proveErrors.ts
 *
 * Shared typed error for the "proving queue busy" 409 surface returned by
 * /prove/buy, /prove/buy-no-escrow, /prove/renew, and /prove/migrate. The
 * keeper serializes all four endpoints on a per-app in-flight slot: while a
 * proof is out with a buyer waiting to be signed (or a signed tx is waiting
 * to land), further requests against the same app get an immediate 409 with
 * a `retryAfterMs` hint. Callers should catch this and wait+retry rather
 * than surfacing the failure — the wallet popup never opens for a proof
 * with no live chance of landing.
 *
 * `queueDepth` is 1 in v1 (single slot per app); the field exists so that a
 * future Tier-1 optimistic-chaining pass can widen it without breaking
 * clients written today.
 */
export class ProveQueueBusyError extends Error {
    status = 409;
    retryAfterMs;
    queueDepth;
    constructor(message, retryAfterMs, queueDepth) {
        super(message);
        this.name = 'ProveQueueBusyError';
        this.retryAfterMs = retryAfterMs;
        this.queueDepth = queueDepth;
    }
}
export async function readErrorBody(resp) {
    let body = {};
    try {
        body = await resp.json();
    }
    catch { /* body wasn't JSON */ }
    const message = typeof body.error === 'string' ? body.error : `HTTP ${resp.status}`;
    return { status: resp.status, body, message };
}
// Returns a ProveQueueBusyError if the parsed body matches the queue-busy
// shape; otherwise null. Cheap to call — no I/O.
export function tryQueueBusyFromBody(parsed) {
    if (parsed.status !== 409)
        return null;
    const { body } = parsed;
    if (body.error !== 'proving queue busy' || typeof body.retryAfterMs !== 'number')
        return null;
    return new ProveQueueBusyError(body.error, body.retryAfterMs, typeof body.queueDepth === 'number' ? body.queueDepth : 1);
}
//# sourceMappingURL=proveErrors.js.map