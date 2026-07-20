/**
 * freezeClient.ts
 *
 * Client-side view of the keeper's sales-freeze schedule. A freeze is set
 * ahead of a hardfork so every open escrow window can drain (refund or
 * release) before v1 → v2 migration. Once past the freeze slot the keeper
 * refuses new buys and renewals; refunds and verify remain open.
 *
 * Resolution order for buy/renew clients that want to know the current
 * freeze state:
 *   1. Caller-supplied `freezeAfterSlot` (explicit override — build-time
 *      constant, or pulled from the vendor's own env at boot).
 *   2. `process.env.FREEZE_AFTER_SLOT` when running under Node (server-side
 *      integrators / CLIs).
 *   3. Keeper's own `/health` payload — the authoritative source of truth.
 *
 * A `freezeAfterSlot` of 0 / null / undefined means "no freeze scheduled".
 */
export type KeeperHealth = {
    status: string;
    network: string;
    slot: number;
    salesFrozen: boolean;
    freezeAfterSlot: number | null;
};
export type FreezeState = {
    salesFrozen: boolean;
    freezeAfterSlot: number | null;
    currentSlot: number | null;
};
export type GetKeeperHealthOptions = {
    keeperUrl: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export declare function getKeeperHealth(opts: GetKeeperHealthOptions): Promise<KeeperHealth>;
export type ResolveFreezeStateOptions = {
    keeperUrl: string;
    freezeAfterSlot?: number | null;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export declare function resolveFreezeState(opts: ResolveFreezeStateOptions): Promise<FreezeState>;
//# sourceMappingURL=freezeClient.d.ts.map