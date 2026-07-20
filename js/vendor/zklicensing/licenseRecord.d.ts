/**
 * licenseRecord.ts
 *
 * The `LicenseRecord` shape and related pure types/constants. Split out from
 * licenseStore.ts (which pulls in Node `fs`) so browser-side modules — the
 * buy client, the stats client, the country-stats computation — can consume
 * the same type without dragging in filesystem code. licenseStore.ts
 * re-exports these to keep existing Node imports working.
 */
export type FiatRateSnapshot = {
    minaEurRate: number;
    minaUsdRate: number;
    minaGbpRate: number;
    recordedAt: string;
};
export type LicenseRecord = {
    zkAppAddress: string;
    licenseHash: string;
    expirySlot: number;
    purchaseSlot: number;
    purchaseAmount: string;
    txHash: string;
    createdAt: string;
    buyerAddress?: string;
    buyerCountry?: string;
    buyerZip?: string;
    pending?: boolean;
    provedAtSlot?: number;
    initialExpirySlot?: number;
    tier?: 'monthly' | 'yearly' | 'fiveYear';
    renewedAtLeastOnce?: boolean;
    refunded?: boolean;
    released?: boolean;
    releaseSlot?: number;
    releaseTxHash?: string;
    renewals?: Array<{
        slot: number;
        amount: string;
        newExpiry: number;
        txHash?: string;
        fiatSnapshot?: FiatRateSnapshot;
    }>;
    fiatSnapshot?: FiatRateSnapshot;
    refundWaiverAcceptedAt?: string;
    escrowless?: boolean;
};
export declare const PENDING_REAP_SLOTS = 60;
export type LicenseStatus = 'active' | 'refunded' | 'expired' | 'unknown';
//# sourceMappingURL=licenseRecord.d.ts.map