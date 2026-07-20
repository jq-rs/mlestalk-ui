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
export declare class ProveQueueBusyError extends Error {
    readonly status = 409;
    readonly retryAfterMs: number;
    readonly queueDepth: number;
    constructor(message: string, retryAfterMs: number, queueDepth: number);
}
export type ProveQueueBusyBody = {
    error: 'proving queue busy';
    retryAfterMs: number;
    queueDepth?: number;
};
export type ParsedErrorBody = {
    status: number;
    body: Record<string, unknown>;
    message: string;
};
export declare function readErrorBody(resp: Response): Promise<ParsedErrorBody>;
export declare function tryQueueBusyFromBody(parsed: ParsedErrorBody): ProveQueueBusyError | null;
//# sourceMappingURL=proveErrors.d.ts.map