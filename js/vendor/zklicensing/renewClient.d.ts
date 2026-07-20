export type ProveRenewRequest = {
    keeperUrl: string;
    licenseHash: string;
    buyerAddress: string;
    zkAppAddress: string;
    duration: 0 | 1 | 2;
    waiverAccepted: boolean;
    freezeAfterSlot?: number | null;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type ProveRenewResponse = {
    provenTxJson: string;
    newExpirySlot: number;
    licenseHash: string;
    renewAmount: string;
    generation: number;
    appKey: string;
};
export type ConfirmRenewRequest = {
    keeperUrl: string;
    zkAppAddress: string;
    licenseHash: string;
    txHash: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export declare function proveRenew(req: ProveRenewRequest): Promise<ProveRenewResponse>;
export declare function confirmRenew(req: ConfirmRenewRequest): Promise<{
    ok: true;
}>;
export type RenewStatus = {
    status: 'confirmed' | 'pending' | 'unknown';
    expirySlot?: number;
    txHash?: string | null;
    elapsedMs?: number;
};
export type PollRenewStatusOptions = {
    keeperUrl: string;
    zkAppAddress: string;
    licenseHash: string;
    newExpirySlot: number;
    fetcher?: typeof fetch;
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onTick?: (status: RenewStatus) => void;
};
export declare function pollRenewStatus(opts: PollRenewStatusOptions): Promise<RenewStatus>;
//# sourceMappingURL=renewClient.d.ts.map