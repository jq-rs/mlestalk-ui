// Shared refresh-loop primitives.
//
// Two building blocks used by both the SDK's own tryActivate (called from
// verifyLicense on the app's schedule) and by app-side bespoke session
// loops (e.g. mlestalk-ui's silent /refresh):
//
//   runGuardedRefresh    — cooldown-gate + jitter + { nextAllowedAt, failed }
//                          persistence around an arbitrary refresh closure.
//   createRefreshScheduler — timer that fires when BOTH the cooldown and a
//                          caller-computed renew-delay have elapsed.
//
// Cooldown state lives in its own storage key so it survives past the
// underlying token's exp: an expired-token client that hits refresh under
// an active cooldown must still no-op instead of stampeding the keeper
// (which, for the SDK's tryActivate, would also re-invoke the signer and
// potentially prompt the user for a passphrase).
// Binds a Storage + key into a store. The key namespace is the caller's
// choice — the SDK uses `zklic_refresh_${zkAppAddress}_${licenseHash}`,
// bespoke app loops use whatever they like (e.g. `mlestalk_pro_refresh_state`).
export function createRefreshStateStore(storage, key) {
    return {
        load() {
            try {
                const raw = storage.getItem(key);
                if (!raw)
                    return null;
                const rec = JSON.parse(raw);
                if (typeof rec.nextAllowedAt !== 'number' || typeof rec.failed !== 'boolean')
                    return null;
                return rec;
            }
            catch {
                return null;
            }
        },
        save(state) {
            try {
                storage.setItem(key, JSON.stringify(state));
            }
            catch { /* quota / read-only */ }
        },
        clear() {
            try {
                storage.removeItem?.(key);
            }
            catch { /* removeItem not implemented / read-only */ }
        },
    };
}
export const DEFAULT_COOLDOWN_MIN_MS = 60 * 1000;
export const DEFAULT_COOLDOWN_JITTER_MS = 60 * 1000;
export async function runGuardedRefresh(refreshFn, opts) {
    const nowMs = (opts.now ?? Date.now)();
    const prior = opts.store.load();
    if (prior && nowMs < prior.nextAllowedAt) {
        return {
            status: 'skipped',
            reason: 'cooldown',
            nextAllowedAt: prior.nextAllowedAt,
            failed: prior.failed,
        };
    }
    const cooldownMinMs = opts.cooldownMinMs ?? DEFAULT_COOLDOWN_MIN_MS;
    const cooldownJitterMs = opts.cooldownJitterMs ?? DEFAULT_COOLDOWN_JITTER_MS;
    const sampler = opts.jitterSampler ?? Math.random;
    const cooldownUntil = nowMs + cooldownMinMs + Math.floor(sampler() * cooldownJitterMs);
    try {
        const value = await refreshFn();
        opts.store.save({ nextAllowedAt: cooldownUntil, failed: false });
        return { status: 'success', value, cooldownUntil };
    }
    catch (error) {
        if (opts.isHardFailure?.(error))
            throw error;
        opts.store.save({ nextAllowedAt: cooldownUntil, failed: true });
        return { status: 'failure', error, cooldownUntil };
    }
}
export const DEFAULT_MAX_REFRESH_DELAY_MS = 12 * 60 * 60 * 1000;
export function createRefreshScheduler(opts) {
    const setTimeoutFn = opts.setTimeoutFn
        ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimeoutFn = opts.clearTimeoutFn
        ?? ((h) => clearTimeout(h));
    const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_REFRESH_DELAY_MS;
    const nowFn = () => (opts.now ?? Date.now)();
    let handle = null;
    function cancel() {
        if (handle !== null) {
            clearTimeoutFn(handle);
            handle = null;
        }
    }
    function reschedule() {
        cancel();
        const nowMs = nowFn();
        const prior = opts.store.load();
        const cooldownDelay = prior ? Math.max(0, prior.nextAllowedAt - nowMs) : 0;
        const renewDelay = Math.max(0, opts.computeRenewDelay());
        const delay = Math.min(maxDelayMs, Math.max(cooldownDelay, renewDelay));
        handle = setTimeoutFn(() => { handle = null; void opts.onTick(); }, delay);
    }
    return { reschedule, cancel };
}
//# sourceMappingURL=refreshScheduler.js.map