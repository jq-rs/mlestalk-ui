// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
// Canonical JSON: sorted keys, no whitespace, arrays preserved in order.
// Mirror of ownership.ts:canonicalize.
export function canonicalize(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonicalize).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}
function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}
// base64url → bytes. Padding is optional in base64url; add it back if missing.
function base64UrlToBytes(b64u) {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return base64ToBytes(b64 + pad);
}
function utf8Bytes(s) {
    return new TextEncoder().encode(s);
}
// SPKI DER wrapper around a raw 32-byte Ed25519 public key. Mirror of
// manifestVerify.ts:rawEd25519ToSpki and ownership.ts's Node-side wrapper.
const ED25519_SPKI_PREFIX = new Uint8Array([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);
function rawEd25519ToSpki(raw) {
    if (raw.length !== 32)
        throw new Error(`Ed25519 pubkey must be 32 bytes, got ${raw.length}`);
    const out = new Uint8Array(ED25519_SPKI_PREFIX.length + raw.length);
    out.set(ED25519_SPKI_PREFIX, 0);
    out.set(raw, ED25519_SPKI_PREFIX.length);
    return out;
}
/**
 * Verify an ownership token against a pinned Ed25519 public key list AND an
 * expected (zkAppAddress, generation) pair. Returns the payload on success
 * or null on any failure (malformed envelope, wrong version, past-expiry,
 * cross-instance mismatch, bad signature, WebCrypto unavailable).
 *
 * `expected.z` / `expected.g` MUST be the vendor app's OWN authoritative
 * values — the deployment address and generation the app pins at build
 * time or resolves from the keeper's SIGNED generation list, NEVER values
 * read back from the token being verified.
 *
 * `pinnedPublicKeysBase64` MUST be pinned at build time. Do not populate
 * it from an endpoint response; the keeper's /health exposes the current
 * public key as a bootstrap convenience only. A verifier that accepts
 * whatever /health returns can be told to trust a forged signer by a
 * compromised endpoint. Pin two keys from day one for rotation / recovery.
 *
 * `opts.iatFloor` (optional) is a monotonic replay defense against the
 * "roll the device clock back, present a stashed old token" attack that
 * the wall-clock expiry check alone can't catch. Callers persist the
 * greatest `payload.iat` they've ever accepted (across process restarts)
 * and pass it here; the verifier rejects any token whose signed `iat` is
 * below that floor. Tokens without an `iat` (pre-iat mints) are rejected
 * when a floor is supplied — no floor supplied preserves pre-iat
 * verification for callers that don't need the ratchet.
 */
export async function verifyOwnershipTokenClient(token, pinnedPublicKeysBase64, expected, opts) {
    if (!pinnedPublicKeysBase64.length)
        return null;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle)
        return null;
    const dot = token.indexOf('.');
    if (dot < 0)
        return null;
    const bodyB64u = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);
    let payload;
    try {
        payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(bodyB64u)));
    }
    catch {
        return null;
    }
    if (payload.v !== 1)
        return null;
    if (typeof payload.e !== 'number' || Date.now() > payload.e)
        return null;
    if (payload.z !== expected.z || payload.g !== expected.g)
        return null;
    if (typeof opts?.iatFloor === 'number') {
        if (typeof payload.iat !== 'number' || payload.iat < opts.iatFloor)
            return null;
    }
    const messageBytes = utf8Bytes(canonicalize(payload));
    let sigBytes;
    try {
        sigBytes = base64ToBytes(sigB64);
    }
    catch {
        return null;
    }
    for (const pinB64 of pinnedPublicKeysBase64) {
        try {
            const spki = rawEd25519ToSpki(base64ToBytes(pinB64));
            const key = await subtle.importKey('spki', spki, { name: 'Ed25519' }, false, ['verify']);
            const ok = await subtle.verify({ name: 'Ed25519' }, key, sigBytes, messageBytes);
            if (ok)
                return payload;
        }
        catch {
            // One bad pin entry must not mask a valid signature under a different pin.
        }
    }
    return null;
}
//# sourceMappingURL=ownershipTokenVerify.js.map