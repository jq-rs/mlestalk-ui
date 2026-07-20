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
function anchorKey(zkAppAddress, licenseHash) {
    return `${ANCHOR_KEY_PREFIX}${zkAppAddress}_${licenseHash}`;
}
function activationKey(zkAppAddress, licenseHash) {
    return `${ACTIVATION_KEY_PREFIX}${zkAppAddress}_${licenseHash}`;
}
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
// Renew the activation token when within this window of expiry. Picked so
// that a daily verify call has many chances to refresh before the token dies.
const TOKEN_RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;
async function tryActivate(storage, zkAppAddress, licenseHash, current, bootstrapSecretHash, prover, verifierUrl, fetcher, nowMs) {
    const secretHash = current?.secretHash ?? bootstrapSecretHash;
    if (!secretHash)
        return current;
    // Existing token still fresh — nothing to do.
    if (current?.token && current.expiresAt - nowMs > TOKEN_RENEW_THRESHOLD_MS)
        return current;
    try {
        const base = verifierUrl.replace(/\/+$/, '');
        const challengeResp = await fetcher(`${base}/challenge?licenseHash=${encodeURIComponent(licenseHash)}`);
        if (!challengeResp.ok)
            return current;
        const { nonce } = (await challengeResp.json());
        const proofJson = await prover({ licenseHash, nonce, secretHash });
        const respondResp = await fetcher(`${base}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zkAppAddress, proof: proofJson }),
        });
        if (!respondResp.ok)
            return current;
        const { token, expiresAt } = (await respondResp.json());
        const next = { token, expiresAt, secretHash };
        saveActivation(storage, zkAppAddress, licenseHash, next);
        return next;
    }
    catch {
        return current;
    }
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
    if (storage && options.prover && (activation || options.secretHash)) {
        activation = await tryActivate(storage, proof.zkAppAddress, proof.licenseHash, activation, options.secretHash, options.prover, verifierUrl, fetcher, nowFn());
    }
    const tokenParam = activation?.token
        ? `&token=${encodeURIComponent(activation.token)}`
        : '';
    const url = `${verifierUrl.replace(/\/+$/, '')}` +
        `?licenseHash=${encodeURIComponent(proof.licenseHash)}` +
        `&zkAppAddress=${encodeURIComponent(proof.zkAppAddress)}` +
        tokenParam;
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
// PRO features offline: verify the /respond-minted token against the
// keeper's pinned public key(s) and the app's own pinned (z, g). See
// ownershipTokenVerify.ts for the security-critical requirements around
// how expected.z / expected.g / pinnedPublicKeysBase64 must be sourced.
export { verifyOwnershipTokenClient } from './ownershipTokenVerify.js';
// Baked-in ownership-token pubkeys the SDK release ships with. Vendors
// import and pass this into verifyOwnershipTokenClient for zero-config
// pinning. Rotation happens via SDK patch releases — see ownershipPubkeys.ts.
export { DEFAULT_OWNERSHIP_PUBKEYS } from './ownershipPubkeys.js';
//# sourceMappingURL=index.js.map