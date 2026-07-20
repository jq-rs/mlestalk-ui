export type BuyIdentity = {
    secretHash: string;
    licenseHash: string;
};
export declare function deriveBuyIdentity(passphrase: string): BuyIdentity;
export type ProveBuyRequest = {
    keeperUrl: string;
    licenseHash: string;
    buyerAddress: string;
    zkAppAddress: string;
    duration: 0 | 1 | 2;
    buyerCountry: string;
    buyerZip?: string;
    refundWaiverAccepted?: boolean;
    freezeAfterSlot?: number | null;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type ProveBuyResponse = {
    provenTxJson: string;
    expirySlot: number;
    licenseHash: string;
    verificationKeyHash: string;
    purchaseSlot: number;
    purchaseAmount: string;
    duration: number;
    durationLabel: string;
    generation: number;
    appKey: string;
};
export type ConfirmBuyRequest = {
    keeperUrl: string;
    zkAppAddress: string;
    licenseHash: string;
    txHash: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type BuyStatus = {
    status: 'unknown' | 'pending' | 'confirmed' | 'failed';
    txHash?: string;
    landedAtBlockHeight?: number;
    landedAtSlot?: number;
    elapsedMs?: number;
};
export declare function proveBuy(req: ProveBuyRequest): Promise<ProveBuyResponse>;
export declare function confirmBuy(req: ConfirmBuyRequest): Promise<{
    ok: true;
}>;
export type PollBuyStatusOptions = {
    keeperUrl: string;
    licenseHash: string;
    fetcher?: typeof fetch;
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onTick?: (status: BuyStatus) => void;
};
export declare function pollBuyStatus(opts: PollBuyStatusOptions): Promise<BuyStatus>;
//# sourceMappingURL=buyClient.d.ts.map