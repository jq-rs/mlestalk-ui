/**
 * countryStats.ts
 *
 * Buyer-country breakdown of a vendor's revenue, bucketed by UTC calendar year.
 * Structured for tax reporting: one row per (year, appId, countryCode) with
 * license count + the vendor's cut in MINA. Both the keeper (source of
 * truth for /stats) and the dashboard UI import from here so the numbers can
 * never drift between them.
 *
 * Purchases attribute to the year the buyer confirmed on-chain (LicenseRecord
 * `createdAt` ISO timestamp). Legacy records that predate `createdAt` fall
 * back to slot-derived time. Renewals attribute to the renewal year via
 * `renewals[i].slot → time`. Refunded purchases contribute zero revenue but
 * still count the license (a purchase happened even if the money was
 * returned) — remove `count` from refunded rows client-side if you want a
 * strictly net view.
 *
 * Browser-safe: pure computation, no fs, no fetch.
 */
import type { LicenseRecord } from './licenseRecord.js';
export { zipToState } from './zipToState.js';
export type CountryBucket = {
    count: number;
    revenueMina: number;
    states?: Record<string, {
        count: number;
        revenueMina: number;
    }>;
};
export type CountryYearBreakdown = {
    aggregate: Record<string, CountryBucket>;
    byApp: Record<string, Record<string, CountryBucket>>;
};
export type CountryBreakdown = {
    years: number[];
    byYear: Record<number, CountryYearBreakdown>;
};
export declare function computeCountryBreakdown(apps: {
    appId: string;
    zkAppAddress: string;
}[], records: LicenseRecord[], currentSlot: number, nowMs: number, tzOffsetMinutes?: number): CountryBreakdown;
//# sourceMappingURL=countryStats.d.ts.map