// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * manifestVerify.ts
 *
 * Browser + Node Ed25519 signature verification for platform-signed manifests
 * (currently: the generation-list served at GET /apps/:appId, next: the
 * sales-freeze manifest). The keeper signs with the platform manifest key
 * loaded via PLATFORM_MANIFEST_KEY_FILE; the SDK pins the public key against
 * a caller-supplied allow-list and verifies before trusting anything.
 *
 * Runtime: browsers and Node ≥ 20 expose `globalThis.crypto.subtle`. The
 * SDK's `engines.node` is `>=20` for this reason — Node 18 child workers
 * (spawned by `node --test`) do not populate `globalThis.crypto`.
 *
 * Canonicalization must match `src/manifestSign.ts` byte-for-byte:
 *   - sorted object keys
 *   - no whitespace
 *   - arrays preserved in order
 * Any divergence silently breaks verification, so keep the algorithm dead
 * simple and mirrored.
 */
// Canonical JSON: sorted keys, no whitespace, arrays preserved in order.
// Mirror of src/manifestSign.ts:canonicalize. Divergence here silently
// breaks verification.
export function canonicalize(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonicalize).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}
function base64ToBytes(b64) {
    // atob is present in every modern JS runtime we target (browser + Node ≥ 16).
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}
function utf8Bytes(s) {
    return new TextEncoder().encode(s);
}
// SPKI DER wrapper around a raw 32-byte Ed25519 public key.
// Same prefix used by src/manifestSign.ts:verifyPayload — WebCrypto needs
// SPKI to import; the wire format is raw base64 for space.
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
 * Verify a base64 Ed25519 signature over a canonicalized payload against
 * one of the pinned base64 public keys. Returns true iff at least one
 * pinned key verifies. Fails closed on any error (unknown key format,
 * WebCrypto rejection, missing subtle) — callers must interpret `false`
 * as "do not trust."
 */
export async function verifyManifestSignature(payload, signatureBase64, pinnedPublicKeysBase64) {
    if (!pinnedPublicKeysBase64.length)
        return false;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle)
        return false;
    const messageBytes = utf8Bytes(canonicalize(payload));
    let signatureBytes;
    try {
        signatureBytes = base64ToBytes(signatureBase64);
    }
    catch {
        return false;
    }
    for (const pinB64 of pinnedPublicKeysBase64) {
        try {
            const spki = rawEd25519ToSpki(base64ToBytes(pinB64));
            const key = await subtle.importKey('spki', spki, { name: 'Ed25519' }, false, ['verify']);
            const ok = await subtle.verify({ name: 'Ed25519' }, key, signatureBytes, messageBytes);
            if (ok)
                return true;
        }
        catch {
            // Try the next pin — one bad entry in the pin list must not mask
            // a valid signature under a different pin.
        }
    }
    return false;
}
//# sourceMappingURL=manifestVerify.js.map