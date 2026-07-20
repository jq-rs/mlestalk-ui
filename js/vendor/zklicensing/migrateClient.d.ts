export interface ProveMigrateRequest {
    keeperUrl: string;
    licenseHash: string;
    appId: string;
    buyerAddress: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
}
export interface ProveMigrateResponse {
    provenTxJson: string;
    ancestorGen: number;
    expirySlot: number;
    licenseHash: string;
    zkAppAddress: string;
    appKey: string;
}
/**
 * Terminal migrate failures (404 refunded/unknown, 409 already migrated).
 * The queue-busy 409 is surfaced separately as ProveQueueBusyError so
 * callers can share one retry helper across buy/renew/migrate.
 */
export declare class ProveMigrateError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
export declare function proveMigrate(req: ProveMigrateRequest): Promise<ProveMigrateResponse>;
//# sourceMappingURL=migrateClient.d.ts.map