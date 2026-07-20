/**
 * refundClient.ts
 *
 * Browser-safe client for the refund flow. Mirrors `buyClient.ts` in shape:
 * the caller drives the wallet step between `proveRefund` and
 * `confirmRefund` so the SDK stays wallet-agnostic.
 *
 * The 14-day refund window is enforced on the keeper side (returns HTTP 409
 * when closed) and cross-checked in the circuit; the SDK doesn't second-guess
 * it locally so a single source of truth stays authoritative.
 */
export type ProveRefundRequest = {
    keeperUrl: string;
    licenseHash: string;
    buyerAddress: string;
    zkAppAddress: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type ProveRefundResponse = {
    provenTxJson: string;
    licenseHash: string;
};
export type ConfirmRefundRequest = {
    keeperUrl: string;
    zkAppAddress: string;
    licenseHash: string;
    txHash: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export declare function proveRefund(req: ProveRefundRequest): Promise<ProveRefundResponse>;
export declare function confirmRefund(req: ConfirmRefundRequest): Promise<{
    ok: true;
}>;
export type RefundStatus = {
    status: 'confirmed' | 'pending' | 'unknown';
    txHash?: string | null;
    elapsedMs?: number;
};
export type PollRefundStatusOptions = {
    keeperUrl: string;
    zkAppAddress: string;
    licenseHash: string;
    fetcher?: typeof fetch;
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onTick?: (status: RefundStatus) => void;
};
export declare function pollRefundStatus(opts: PollRefundStatusOptions): Promise<RefundStatus>;
//# sourceMappingURL=refundClient.d.ts.map