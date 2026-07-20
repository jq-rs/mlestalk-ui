/**
 * statsClient.ts
 *
 * Browser-safe HTTP client for the vendor-facing keeper endpoints that back
 * the dashboard: GET /stats, GET /transactions, and GET /apps/vendor/:addr.
 *
 * Types mirror the keeper's response shapes so a dashboard implementation
 * (this repo's zklicensing.com dashboard or a third-party one) doesn't have
 * to re-derive them. New optional fields on the server should be added here
 * as `?:` so older clients still typecheck against a newer keeper.
 */
import type { CountryBreakdown } from './countryStats.js';
import type { FiatRateSnapshot } from './licenseRecord.js';
export type Tier = 'monthly' | 'yearly' | 'fiveYear';
export type AppRecord = {
    appId: string;
    name: string;
    description: string;
    longDescription?: string;
    category: string;
    website: string;
    zkAppAddress: string;
    vendorAddress: string;
    priceMonthlyMina: number;
    priceYearlyMina: number;
    priceFiveYearMina: number;
    txHash: string;
    verificationKeyHash?: string;
    logo?: string;
    iconUrl?: string;
    tags?: string[];
    contactEmail?: string;
    supportEmail?: string;
    country?: string;
    status?: 'pending' | 'active' | 'inactive' | 'rejected';
    rejectionReason?: string;
    createdAt: string;
    approvedAt?: string;
    pendingEdit?: Partial<AppRecord> & {
        editedAt: string;
    };
    statusHistory?: {
        status: string;
        at: string;
        actor: string;
        note?: string;
    }[];
    legalName?: string;
    billingAddress?: {
        line1: string;
        line2?: string;
        city: string;
        postalCode: string;
    };
    invoiceEmail?: string;
    vatId?: string;
    companyRegistrationRegistry?: string;
    companyRegistrationNumber?: string;
    registrationFeeMina?: number;
};
export type VendorStatsResponse = {
    apps: AppRecord[];
    activeLicenses: number;
    totalLicenses: number;
    totalRevenueMina: number;
    pendingRevenueMina?: number;
    refundedRevenueMina?: number;
    renewalRate: number | null;
    monthlyRevenueMina: {
        month: string;
        mina: number;
    }[];
    licensesByTier?: {
        monthly: number;
        yearly: number;
        fiveYear: number;
    };
    deltas: {
        revenuePct: number | null;
    };
    countryBreakdown?: CountryBreakdown;
};
export type Transaction = {
    type: 'purchase' | 'renewal' | 'release' | 'refund';
    appId: string;
    appName: string;
    vendorAddress?: string;
    tier: Tier | null;
    amountMina: number;
    txHash: string;
    date: string;
    buyerCountry?: string;
    fiatSnapshot?: FiatRateSnapshot;
};
export type TransactionsResponse = {
    transactions: Transaction[];
};
export type VendorAppsResponse = {
    apps: AppRecord[];
};
export declare function fetchVendorStats(opts: {
    keeperUrl: string;
    vendorAddress: string;
    adminToken?: string;
    vendorSessionToken?: string;
    tzOffsetMinutes?: number;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
}): Promise<VendorStatsResponse | null>;
export declare function fetchTransactions(opts: {
    keeperUrl: string;
    vendorAddress: string;
    adminToken?: string;
    vendorSessionToken?: string;
    days?: number;
    from?: string;
    to?: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
}): Promise<TransactionsResponse | null>;
export declare function fetchVendorApps(opts: {
    keeperUrl: string;
    vendorAddress: string;
    adminToken?: string;
    vendorSessionToken?: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
}): Promise<VendorAppsResponse | null>;
//# sourceMappingURL=statsClient.d.ts.map