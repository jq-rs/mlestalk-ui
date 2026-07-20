/**
 * txBroadcastClient.ts
 *
 * Small helper for POST /tx-broadcast. Called by the buy/renew/migrate
 * flows immediately after the buyer's wallet returns a txHash — signals
 * the keeper to extend the app's in-flight slot from the short signing-TTL
 * to the longer landing-TTL, so concurrent buyers on the same app don't
 * think the slot has expired while an honest signed tx is still in the
 * mempool.
 *
 * Fire-and-forget by design: this is a tightening signal, not a
 * correctness dependency. Land-clear in the buy-watcher and the
 * signing-TTL both remain live regardless of whether this call succeeds.
 * Failures are swallowed with an optional log callback so a network blip
 * doesn't surface as a confusing error mid-checkout.
 */
export type NotifyBroadcastRequest = {
    keeperUrl: string;
    appId: string;
    txHash: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    onError?: (err: unknown) => void;
};
export declare function notifyBroadcast(req: NotifyBroadcastRequest): Promise<void>;
//# sourceMappingURL=txBroadcastClient.d.ts.map