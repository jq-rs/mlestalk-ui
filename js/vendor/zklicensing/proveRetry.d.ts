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
export declare class ProveTimeoutError extends Error {
    readonly waitedMs: number;
    readonly totalBudgetMs: number;
    readonly lastInFlightKind: string;
    readonly name = "ProveTimeoutError";
    constructor(waitedMs: number, totalBudgetMs: number, lastInFlightKind: string);
}
export type WaitingInfo = {
    inFlightKind: string;
    waitedMs: number;
    retryAfterMs: number;
};
export type ProveRetryOptions = {
    fetcher: typeof fetch;
    url: string;
    body: unknown;
    signal?: AbortSignal;
    onWaiting?: (info: WaitingInfo) => void;
    totalBudgetMs?: number;
};
export declare const DEFAULT_PROVE_TOTAL_BUDGET_MS: number;
export declare function postProveWithRetry(opts: ProveRetryOptions): Promise<Response>;
//# sourceMappingURL=proveRetry.d.ts.map