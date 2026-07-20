export declare const SYNC_CHUNK_SLOTS = 10000;
export declare const MAX_LOOKBACK_SLOTS = 525600;
export type Tier = 'monthly' | 'yearly' | 'fiveYear';
export type NormalizedEvent = {
    kind: 'licenseIssued';
    slot: number;
    licenseHash: string;
    amount: bigint;
    issuedSlot: number;
    expirySlot: number;
} | {
    kind: 'licenseIssuedNoEscrow';
    slot: number;
    licenseHash: string;
    amount: bigint;
    issuedSlot: number;
    expirySlot: number;
} | {
    kind: 'licenseRenewed';
    slot: number;
    licenseHash: string;
    newExpiry: number;
} | {
    kind: 'licenseMigrated';
    slot: number;
    licenseHash: string;
    expirySlot: number;
    ancestorGen: number;
} | {
    kind: 'refundIssued';
    slot: number;
    licenseHash: string;
} | {
    kind: 'fundsReleased';
    slot: number;
    licenseHash: string;
} | {
    kind: 'priceUpdated';
    slot: number;
    priceMonthly: bigint;
    priceYearly: bigint;
    priceFiveYear: bigint;
};
export declare function tierFromExpiryDelta(slots: number): Tier | null;
export type FetchRange = {
    from?: number;
    to?: number;
};
export type BootstrapResult = {
    maxSeenSlot: number;
    events: NormalizedEvent[];
};
export declare function bootstrapFromArchive(zkAppAddress: string, range?: FetchRange): Promise<BootstrapResult>;
export declare function applyEventsToStore(zkAppAddress: string, events: NormalizedEvent[]): Promise<{
    count: number;
    warnings: string[];
}>;
export declare function discoverAppCreatedSlot(zkAppAddress: string, nowSlot: number, lookbackSlots?: number): Promise<number | null>;
export declare function lazyBootstrap(zkAppAddress: string): Promise<void>;
//# sourceMappingURL=archiveBootstrap.d.ts.map