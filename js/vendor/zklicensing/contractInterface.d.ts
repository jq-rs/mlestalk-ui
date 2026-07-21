// Hand-written declarations for contractInterface.ts.
// tsc can't emit these automatically because the inferred return types of
// Struct() and SmartContract reference internal o1js paths outside this
// package's rootDir, triggering TS2742. Callers get full typing on the
// methods they actually invoke by importing the corresponding o1js types
// directly (Field, PublicKey, etc.) in their own code.

import type { Field, UInt64 } from 'o1js';

export const LicenseIssuedEvent: any;
export type LicenseIssuedEvent = any;

export const ExpiryUpdateEvent: any;
export type ExpiryUpdateEvent = any;

export const PriceUpdatedEvent: any;
export type PriceUpdatedEvent = any;

export const AppCreatedEvent: any;
export type AppCreatedEvent = any;

export const LicenseMigratedEvent: any;
export type LicenseMigratedEvent = any;

export function unpackPrices(packed: Field): { priceMonthly: UInt64; priceYearly: UInt64; priceFiveYear: UInt64 };

export const MONTHLY_SLOTS_N: number;
export const ONE_YEAR_SLOTS_N: number;
export const FIVE_YEAR_SLOTS_N: number;
export const REFUND_WINDOW_N: number;
export const GRACE_PERIOD_N: number;
export const MS_PER_SLOT_N: number;
export const SLOTS_PER_DAY_N: number;
export const TOLERANCE_WINDOW_N: number;

export const EMPTY: Field;
export const EMPTY_ROOT: Field;

export const DURATION_LABELS: readonly ['1 Month', '1 Year', '5 Years'];
export type DurationLabel = '1 Month' | '1 Year' | '5 Years';
export const DURATION_INDEX: { readonly '1 Month': 0; readonly '1 Year': 1; readonly '5 Years': 2 };

export function durationSlotsFromLabel(label?: string | null): number | null;
export function durationIndexFromLabel(label?: string | null): number | null;
export function durationLabelFromIndex(idx: number): DurationLabel | null;

export const LicensingAppEventsContract: any;

export const SUPPORTED_LICENSING_APP_VERSIONS: readonly number[];
export function fetchLicensingAppVersion(zkAppAddress: string): Promise<number | null>;

export const CANONICAL_VK_HASHES: Readonly<Record<number, string>>;
export const CURRENT_GENERATION: number;
export const CANONICAL_VK_HASH: string;
