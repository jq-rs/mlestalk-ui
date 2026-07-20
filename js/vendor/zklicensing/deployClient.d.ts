/**
 * deployClient.ts
 *
 * Browser-safe client for the deploy flow. Mirrors the buy / renew / refund
 * client shape: `proveDeploy` posts to the keeper's `/prove/deploy` endpoint
 * and returns the atomic deploy+initialize tx already signed with the
 * throwaway zkApp key. The vendor's wallet then adds the fee-payer signature
 * and broadcasts.
 *
 * The atomic bundling is what makes single-shot initialization safe:
 * `provenTxJson` holds both `zkApp.deploy()` and `zkApp.initialize()`
 * AccountUpdates in the same transaction, and the keeper generates a
 * throwaway zkApp keypair per request that is discarded before the tx is
 * returned — so the target address is not observable to an attacker until
 * the initialize AU inside is already signed and locked to `(vendor,
 * prices)`. Combined with the in-circuit `vendor.requireEquals(empty())`
 * precondition on `initialize()`, this yields a one-shot init per account.
 *
 * Also exports admin-side `redeployApp` / `redeployAll` for the platform
 * operator to trigger post-hardfork v1→v2 migrations via the keeper's
 * `/admin/redeploy*` endpoints (bearer-token auth).
 */
export type ProveDeployRequest = {
    keeperUrl: string;
    senderPublicKey: string;
    vendorAddress: string;
    priceMonthlyMina: number;
    priceYearlyMina: number;
    priceFiveYearMina: number;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type ProveDeployResponse = {
    provenTxJson: string;
    verificationKeyHash: string;
    zkAppAddress: string;
};
export type DeployStatus = {
    status: 'unknown' | 'pending' | 'confirmed' | 'failed';
    landedAtSlot?: number;
    elapsedMs?: number;
};
export declare function proveDeploy(req: ProveDeployRequest): Promise<ProveDeployResponse>;
export type PollDeployStatusOptions = {
    keeperUrl: string;
    zkAppAddress: string;
    fetcher?: typeof fetch;
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onTick?: (status: DeployStatus) => void;
};
export declare function pollDeployStatus(opts: PollDeployStatusOptions): Promise<DeployStatus>;
export type RedeployAppRequest = {
    keeperUrl: string;
    appId: string;
    adminToken: string;
    force?: boolean;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type RedeployAppResponse = {
    ok: true;
    zkAppAddress: string;
    txHash: string;
    verificationKeyHash: string;
    onChainVersion: number;
    forcedEscrowNonEmpty?: true;
};
export type RedeployAllRequest = {
    keeperUrl: string;
    adminToken: string;
    force?: boolean;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type RedeployAllResponse = {
    ok: true;
    count: number;
    succeeded: number;
    results: Array<{
        appId: string;
        ok: true;
        zkAppAddress: string;
        txHash: string;
        verificationKeyHash: string;
        onChainVersion: number;
        forcedEscrowNonEmpty?: true;
    } | {
        appId: string;
        ok: false;
        error: string;
    }>;
};
export declare function redeployApp(req: RedeployAppRequest): Promise<RedeployAppResponse>;
export declare function redeployAll(req: RedeployAllRequest): Promise<RedeployAllResponse>;
export type VendorRedeployPreflight = {
    ok: boolean;
    freezeSlotConfigured: boolean;
    appExists: boolean;
    status?: 'active' | 'inactive' | 'pending';
    refundWindow: {
        closed: boolean;
        opensAtSlot: number;
        currentSlot: number;
    };
    onChainAccount: {
        exists: boolean;
    };
    escrow: {
        empty: boolean;
    };
    version: {
        current: number;
        supported: boolean;
        supportedList: readonly number[];
    };
    reasons: string[];
};
export declare function fetchVendorRedeployPreflight(opts: {
    keeperUrl: string;
    appId: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
}): Promise<VendorRedeployPreflight>;
export type VendorRedeployChallenge = {
    nonce: string;
    expiresAt: number;
};
export declare function getVendorRedeployChallenge(opts: {
    keeperUrl: string;
    appId: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
}): Promise<VendorRedeployChallenge>;
export type ProveVendorRedeployRequest = {
    keeperUrl: string;
    appId: string;
    nonce: string;
    signature: {
        field: string;
        scalar: string;
    };
    senderPublicKey: string;
    force?: boolean;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type ProveVendorRedeployResponse = {
    provenTxJson: string;
    zkAppAddress: string;
    verificationKeyHash: string;
    redeployId: string;
    forcedEscrowNonEmpty?: true;
};
export declare function proveVendorRedeploy(req: ProveVendorRedeployRequest): Promise<ProveVendorRedeployResponse>;
export type RegisterVendorRedeployRequest = {
    keeperUrl: string;
    appId: string;
    redeployId: string;
    txHash: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export declare function registerVendorRedeploy(req: RegisterVendorRedeployRequest): Promise<{
    ok: true;
}>;
//# sourceMappingURL=deployClient.d.ts.map