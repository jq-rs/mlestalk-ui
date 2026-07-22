export interface RefreshStateStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem?(key: string): void;
}
export interface RefreshState {
    nextAllowedAt: number;
    failed: boolean;
}
export interface RefreshStateStore {
    load(): RefreshState | null;
    save(state: RefreshState): void;
    clear(): void;
}
export declare function createRefreshStateStore(storage: RefreshStateStorage, key: string): RefreshStateStore;
export type RefreshOutcome<T> = {
    status: 'success';
    value: T;
    cooldownUntil: number;
} | {
    status: 'failure';
    error: unknown;
    cooldownUntil: number;
} | {
    status: 'skipped';
    reason: 'cooldown';
    nextAllowedAt: number;
    failed: boolean;
};
export interface GuardedRefreshOpts {
    store: RefreshStateStore;
    now?: () => number;
    cooldownMinMs?: number;
    cooldownJitterMs?: number;
    jitterSampler?: () => number;
    isHardFailure?: (err: unknown) => boolean;
}
export declare const DEFAULT_COOLDOWN_MIN_MS: number;
export declare const DEFAULT_COOLDOWN_JITTER_MS: number;
export declare function runGuardedRefresh<T>(refreshFn: () => Promise<T>, opts: GuardedRefreshOpts): Promise<RefreshOutcome<T>>;
export interface RefreshSchedulerOpts {
    store: RefreshStateStore;
    now?: () => number;
    maxDelayMs?: number;
    computeRenewDelay: () => number;
    onTick: () => void | Promise<void>;
    setTimeoutFn?: (fn: () => void, ms: number) => unknown;
    clearTimeoutFn?: (handle: unknown) => void;
}
export declare const DEFAULT_MAX_REFRESH_DELAY_MS: number;
export interface RefreshScheduler {
    reschedule(): void;
    cancel(): void;
}
export declare function createRefreshScheduler(opts: RefreshSchedulerOpts): RefreshScheduler;
//# sourceMappingURL=refreshScheduler.d.ts.map