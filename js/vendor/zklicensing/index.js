// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * verifyLicense — client SDK.
 *
 * Calls the keeper's GET /verify until the on-chain refund window for the
 * license has closed; from that point on returns from a local anchor and
 * never touches the network again. The refund-window decision is server-
 * side: the keeper returns `refundWindowClosed: boolean` on its /verify
 * response, computed from its own record of `purchaseSlot + REFUND_WINDOW_N`
 * against the on-chain `currentSlot`. The SDK gates anchor writes on that
 * boolean and never trusts a `purchaseSlot` supplied by the local proof
 * file, so a user who forges their proof metadata cannot force the offline
 * branch prematurely.
 *
 * Anchor purity: every field persisted in the Anchor derives from the
 * keeper's /verify response — `anchoredSlot`, `expirySlot`, `ownership`.
 * The only client-supplied input to the offline branch is
 * `proof.expirySlot`, used solely as the loadAnchor binding key. A
 * tampered proof file therefore never gets a wrong answer; it gets no
 * offline branch at all and falls through to the keeper on every call.
 */
import { REFUND_WINDOW_N, GRACE_PERIOD_N, MS_PER_SLOT_N, SLOTS_PER_DAY_N, } from './contractInterface.js';
import { createRefreshStateStore as _createRefreshStateStore, runGuardedRefresh as _runGuardedRefresh, } from './refreshScheduler.js';
const MS_PER_SLOT = MS_PER_SLOT_N;
const SLOTS_PER_DAY = SLOTS_PER_DAY_N;
// Anchor and activation records are keyed by (zkAppAddress, licenseHash).
// zkAppAddress is generation-scoped by construction: each hardfork migration
// deploys the LicensingApp at a fresh address (see keeper's finalizeRedeploy
// and AppRecord.deploymentHistory[]), so keying on it implicitly captures
// generation. An anchor written pre-migration is orphaned by the new
// address on next verify and re-created cleanly — no cross-generation
// carry-over. Pre-existing anchors from an older SDK release (keyed by
// licenseHash alone) become dead-weight in storage but are never read;
// buyers accumulate KB, not incorrect verdicts.
const ANCHOR_KEY_PREFIX = 'zklic_anchor_';
const ACTIVATION_KEY_PREFIX = 'zklic_activation_';
// Separate storage record for tryActivate's cooldown + failure state. Keyed
// per-license (like activation), but written independently so it survives
// the token's lifecycle: an activation record disappears from loadActivation
// past its exp, but the refresh state persists so we can still throttle
// signer invocations and surface refreshFailed after the token has died.
const REFRESH_STATE_KEY_PREFIX = 'zklic_refresh_';
function anchorKey(zkAppAddress, licenseHash) {
    return `${ANCHOR_KEY_PREFIX}${zkAppAddress}_${licenseHash}`;
}
function activationKey(zkAppAddress, licenseHash) {
    return `${ACTIVATION_KEY_PREFIX}${zkAppAddress}_${licenseHash}`;
}
function refreshStateKey(zkAppAddress, licenseHash) {
    return `${REFRESH_STATE_KEY_PREFIX}${zkAppAddress}_${licenseHash}`;
}
// RefreshState primitives live in ./refreshScheduler.ts — shared with
// bespoke app-side refresh loops (e.g. mlestalk-ui's silent /refresh).
// Re-exported here so vendors can import the whole surface from the barrel.
export { createRefreshStateStore, runGuardedRefresh, createRefreshScheduler, DEFAULT_COOLDOWN_MIN_MS, DEFAULT_COOLDOWN_JITTER_MS, DEFAULT_MAX_REFRESH_DELAY_MS, } from './refreshScheduler.js';
export function loadActivation(storage, zkAppAddress, licenseHash, nowMs = Date.now()) {
    try {
        const raw = storage.getItem(activationKey(zkAppAddress, licenseHash));
        if (!raw)
            return null;
        const rec = JSON.parse(raw);
        if (nowMs > rec.expiresAt)
            return null;
        return rec;
    }
    catch {
        return null;
    }
}
export function saveActivation(storage, zkAppAddress, licenseHash, rec) {
    try {
        storage.setItem(activationKey(zkAppAddress, licenseHash), JSON.stringify(rec));
    }
    catch {
        /* quota / read-only — non-fatal */
    }
}
function defaultStorage() {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        return globalThis.localStorage;
    }
    return null;
}
function loadAnchor(storage, zkAppAddress, licenseHash, expirySlot) {
    try {
        const raw = storage.getItem(anchorKey(zkAppAddress, licenseHash));
        if (!raw)
            return null;
        const a = JSON.parse(raw);
        // `a.expirySlot` is the KEEPER's value captured at anchor time; the
        // `expirySlot` argument is the LOCAL proof file's value. Match ⇒ local
        // file agrees with chain truth as of anchoring ⇒ offline is safe.
        // Mismatch has two honest meanings:
        //   - renewal: chain moved, local file updated ⇒ re-anchor via chain check
        //   - forgery: local file edited ⇒ every call falls through to the keeper,
        //     which reports truth. The forger gets no offline branch at all.
        if (a.expirySlot !== expirySlot)
            return null;
        return a;
    }
    catch {
        return null;
    }
}
function saveAnchor(storage, zkAppAddress, licenseHash, anchor) {
    try {
        storage.setItem(anchorKey(zkAppAddress, licenseHash), JSON.stringify(anchor));
    }
    catch {
        // Storage may be full or read-only; the offline path simply won't activate.
    }
}
function computeRemainingDays(expirySlot, currentSlot) {
    if (expirySlot === 0)
        return 0;
    return Math.floor((expirySlot - currentSlot) / SLOTS_PER_DAY);
}
// Renew when the token has ≤12 h of TTL left. Half the refund-window TTL
// so a fresh 24 h token gets a real 12 h skip window, and the last 12 h
// gives a daily-verify client many chances to renew before it dies. In the
// post-refund regime the token exp is clamped to grace-end (potentially
// years out), so this threshold sits dormant until near grace-end — which
// is the correct behavior: no refunds are possible past the window, and
// verifyLicense() itself re-reads chain state on every call, so mid-life
// renewals/expiries are picked up without a token refresh.
const TOKEN_EXP_RENEW_MS = 12 * 60 * 60 * 1000;
// Minimum gap between tryActivate attempts. A vendor calling verifyLicense
// on every user action would otherwise hammer /respond during a keeper
// outage — this caps the retry cadence at ~1/min per client, regardless
// of caller frequency. Exponential backoff was considered and rejected:
// it delays user-facing recovery once the keeper comes back, which matters
// more here than shaving further off an already-modest request volume.
const REFRESH_COOLDOWN_MIN_MS = 60 * 1000;
// Jitter width added on top of the cooldown, sampled per attempt. Prevents
// a thundering herd when many clients cross the 12 h threshold in lockstep
// (e.g., all installed on the same rollout day) and try to refresh the
// instant the keeper recovers from an outage. 60 s cooldown + up to 60 s
// jitter → effective 60–120 s per-client spread.
const REFRESH_COOLDOWN_JITTER_MS = 60 * 1000;
// Test seam for jitter. Real code goes through Math.random; unit tests
// override this to make cooldown timing deterministic.
let sampleJitter = () => Math.random();
export function __setJitterSampler(fn) {
    sampleJitter = fn;
}
function shouldRefresh(current, nowMs) {
    if (!current?.token)
        return true;
    return current.expiresAt - nowMs <= TOKEN_EXP_RENEW_MS;
}
async function tryActivate(storage, zkAppAddress, licenseHash, current, signer, verifierUrl, fetcher, nowMs) {
    if (!shouldRefresh(current, nowMs))
        return current;
    const store = _createRefreshStateStore(storage, refreshStateKey(zkAppAddress, licenseHash));
    const outcome = await _runGuardedRefresh(async () => {
        const base = verifierUrl.replace(/\/+$/, '');
        const challengeResp = await fetcher(`${base}/challenge?licenseHash=${encodeURIComponent(licenseHash)}`);
        if (!challengeResp.ok)
            throw new Error(`challenge HTTP ${challengeResp.status}`);
        const { nonce } = (await challengeResp.json());
        const { pubKey, signature } = await signer({ licenseHash, nonce, zkAppAddress });
        const respondResp = await fetcher(`${base}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zkAppAddress, licenseHash, pubKey, nonce, signature }),
        });
        if (!respondResp.ok)
            throw new Error(`respond HTTP ${respondResp.status}`);
        const { token, expiresAt } = (await respondResp.json());
        const next = { token, expiresAt };
        saveActivation(storage, zkAppAddress, licenseHash, next);
        return next;
    }, {
        store,
        now: () => nowMs,
        cooldownMinMs: REFRESH_COOLDOWN_MIN_MS,
        cooldownJitterMs: REFRESH_COOLDOWN_JITTER_MS,
        jitterSampler: sampleJitter,
    });
    return outcome.status === 'success' ? outcome.value : current;
}
function offlineCheck(anchor, nowMs) {
    const elapsedSlots = Math.max(0, Math.floor((nowMs - anchor.anchoredAtMs) / MS_PER_SLOT));
    const estCurrentSlot = anchor.anchoredSlot + elapsedSlots;
    const expired = estCurrentSlot > anchor.expirySlot + GRACE_PERIOD_N;
    const inGracePeriod = !expired && estCurrentSlot > anchor.expirySlot;
    const expiresAt = new Date(nowMs + (anchor.expirySlot - estCurrentSlot) * MS_PER_SLOT).toISOString();
    return {
        valid: !expired,
        expirySlot: anchor.expirySlot,
        expiresAt,
        currentSlot: estCurrentSlot,
        inGracePeriod,
        remainingDays: computeRemainingDays(anchor.expirySlot, estCurrentSlot),
        reason: expired
            ? 'License has expired'
            : inGracePeriod
                ? 'License is in grace period — renew to avoid interruption'
                : null,
        source: 'offline',
        ownership: anchor.ownership,
    };
}
export async function verifyLicense(proof, options = {}) {
    const storage = options.storage === null ? null : options.storage ?? defaultStorage();
    const fetcher = options.fetcher ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    const nowFn = options.now ?? (() => Date.now());
    const verifierUrl = options.verifierUrl ?? proof.verifierUrl;
    if (storage) {
        const anchor = loadAnchor(storage, proof.zkAppAddress, proof.licenseHash, proof.expirySlot);
        if (anchor)
            return offlineCheck(anchor, nowFn());
    }
    if (!verifierUrl || !fetcher) {
        return {
            valid: false,
            expirySlot: proof.expirySlot,
            expiresAt: null,
            currentSlot: 0,
            inGracePeriod: false,
            remainingDays: 0,
            reason: 'No verifier URL or fetcher available; cannot verify',
            source: 'chain',
            ownership: 'unverified',
        };
    }
    let activation = storage
        ? loadActivation(storage, proof.zkAppAddress, proof.licenseHash, nowFn())
        : null;
    if (storage && options.signer) {
        activation = await tryActivate(storage, proof.zkAppAddress, proof.licenseHash, activation, options.signer, verifierUrl, fetcher, nowFn());
    }
    const tokenParam = activation?.token
        ? `&token=${encodeURIComponent(activation.token)}`
        : '';
    const url = `${verifierUrl.replace(/\/+$/, '')}` +
        `?licenseHash=${encodeURIComponent(proof.licenseHash)}` +
        `&zkAppAddress=${encodeURIComponent(proof.zkAppAddress)}` +
        tokenParam;
    const refreshState = storage
        ? _createRefreshStateStore(storage, refreshStateKey(proof.zkAppAddress, proof.licenseHash)).load()
        : null;
    const refreshFailedFlag = refreshState?.failed === true ? { activationRefreshFailed: true } : {};
    let data;
    try {
        const resp = await fetcher(url);
        if (!resp.ok) {
            return {
                valid: false,
                expirySlot: proof.expirySlot,
                expiresAt: null,
                currentSlot: 0,
                inGracePeriod: false,
                remainingDays: 0,
                reason: `Verification request failed (HTTP ${resp.status})`,
                source: 'chain',
                ownership: 'unverified',
                ...refreshFailedFlag,
            };
        }
        data = await resp.json();
    }
    catch (err) {
        return {
            valid: false,
            expirySlot: proof.expirySlot,
            expiresAt: null,
            currentSlot: 0,
            inGracePeriod: false,
            remainingDays: 0,
            reason: err?.message ?? 'Verification request errored',
            source: 'chain',
            ownership: 'unverified',
            ...refreshFailedFlag,
        };
    }
    // Keeper's authoritative expiry, or null if the response omits it. Only
    // the null-safe form may be written into the anchor; the chain-result
    // display value below falls back to the local proof file for user-facing
    // fields, which is safe (display only).
    const respExpirySlotStrict = typeof data.expirySlot === 'number' ? data.expirySlot : null;
    const respExpirySlot = respExpirySlotStrict ?? proof.expirySlot;
    const respCurrentSlot = typeof data.currentSlot === 'number' ? data.currentSlot : 0;
    const result = {
        valid: !!data.valid,
        expirySlot: respExpirySlot,
        expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null,
        currentSlot: respCurrentSlot,
        inGracePeriod: !!data.inGracePeriod,
        remainingDays: typeof data.remainingDays === 'number'
            ? data.remainingDays
            : computeRemainingDays(respExpirySlot, respCurrentSlot),
        reason: data.reason ?? null,
        source: 'chain',
        ownership: data.ownership === 'verified' ? 'verified' : 'unverified',
        ...refreshFailedFlag,
    };
    // Anchor gate uses the keeper's own refund-window decision. The keeper
    // knows the true purchaseSlot (stored in its LicenseRecord) and the true
    // currentSlot; the SDK never trusts a purchaseSlot or expirySlot supplied
    // by the local proof file, since that file is client-writable and could
    // be forged. If the keeper omits `expirySlot`, we fail-closed on the
    // offline path — no anchor written, subsequent calls stay online.
    if (storage &&
        result.valid &&
        data.refundWindowClosed === true &&
        typeof data.currentSlot === 'number' &&
        respExpirySlotStrict !== null) {
        saveAnchor(storage, proof.zkAppAddress, proof.licenseHash, {
            anchoredSlot: data.currentSlot,
            anchoredAtMs: nowFn(),
            expirySlot: respExpirySlotStrict,
            ownership: result.ownership,
        });
    }
    return result;
}
// Re-exported so tests and downstream tooling can reference the same values
// the SDK uses internally without re-deriving them.
export { REFUND_WINDOW_N, GRACE_PERIOD_N, MS_PER_SLOT };
// Browser-side ownership-token verifier. Vendor apps import this to gate
// licensed features offline: verify the /respond-minted token against the
// keeper's pinned public key(s) and the app's own pinned (z, g). See
// ownershipTokenVerify.ts for the security-critical requirements around
// how expected.z / expected.g / pinnedPublicKeysBase64 must be sourced.
export { verifyOwnershipTokenClient } from './ownershipTokenVerify.js';
// Baked-in ownership-token pubkeys the SDK release ships with. Vendors
// import and pass this into verifyOwnershipTokenClient for zero-config
// pinning. Rotation happens via SDK patch releases — see ownershipPubkeys.ts.
export { DEFAULT_OWNERSHIP_PUBKEYS } from './ownershipPubkeys.js';
//# sourceMappingURL=index.js.map