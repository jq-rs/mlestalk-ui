// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * ownershipSignature.ts
 *
 * Ed25519 sign-challenge primitive used by the /respond activation flow.
 * Replaces the previous LicenseProof ZkProgram: same "prove knowledge of
 * the passphrase" semantics, no zk circuit, immune to o1js hard-fork
 * churn. Deterministic HKDF-SHA256 derivation of a seed from the
 * passphrase — buyer can re-derive the same keypair anywhere from just
 * the passphrase.
 *
 * Deliberately o1js-free. Vendor apps that only need to activate on
 * device (derive keypair + sign challenge) can bundle this module
 * without pulling o1js into their client build. The Field-side
 * derivation `licenseHash = Poseidon(pubKey)` lives in
 * ownershipLicenseHash.ts, imported only by the buy/verify surfaces
 * that already need o1js for other reasons.
 *
 * Runtime: WebCrypto Ed25519. Chromium 137+, Safari 17+, Firefox 130+,
 * Node ≥ 20. Same requirement as ownershipTokenVerify.ts (README §"JTI
 * -capped licenses"). The module throws at derive/sign time if
 * `globalThis.crypto.subtle` or Ed25519 support is unavailable —
 * callers cannot silently fall back to a weaker path.
 */
const HKDF_INFO = new TextEncoder().encode('zkLicensing/v1/ownership');
const HKDF_SALT = new Uint8Array(0);
// PKCS8 wrapper for a raw 32-byte Ed25519 seed. WebCrypto's
// `importKey('pkcs8', ...)` is the only cross-platform way to import a
// deterministic Ed25519 private key from seed material; raw/JWK-`d`-only
// imports aren't uniformly supported. The trailing 32 bytes are the seed.
const PKCS8_ED25519_PREFIX = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
]);
// SPKI wrapper for a raw 32-byte Ed25519 public key. Mirror of
// ownershipTokenVerify.ts:ED25519_SPKI_PREFIX.
const SPKI_ED25519_PREFIX = new Uint8Array([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);
function utf8Bytes(s) {
    return new TextEncoder().encode(s);
}
function bytesToBase64(bytes) {
    let s = '';
    for (const b of bytes)
        s += String.fromCharCode(b);
    return btoa(s);
}
function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}
function base64UrlToBytes(b64u) {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return base64ToBytes(b64 + pad);
}
function subtle() {
    const s = globalThis.crypto?.subtle;
    if (!s) {
        throw new Error('WebCrypto unavailable — ownershipSignature requires Node ≥ 20 or a modern browser (Chromium 137+, Safari 17+, Firefox 130+).');
    }
    return s;
}
function seedToPkcs8(seed) {
    if (seed.length !== 32) {
        throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
    }
    const out = new Uint8Array(PKCS8_ED25519_PREFIX.length + seed.length);
    out.set(PKCS8_ED25519_PREFIX, 0);
    out.set(seed, PKCS8_ED25519_PREFIX.length);
    return out;
}
function rawPubkeyToSpki(raw) {
    if (raw.length !== 32) {
        throw new Error(`Ed25519 pubkey must be 32 bytes, got ${raw.length}`);
    }
    const out = new Uint8Array(SPKI_ED25519_PREFIX.length + raw.length);
    out.set(SPKI_ED25519_PREFIX, 0);
    out.set(raw, SPKI_ED25519_PREFIX.length);
    return out;
}
/**
 * HKDF-SHA256 with empty salt and a fixed domain-separation info string.
 * Deterministic: same passphrase → same 32-byte seed. Consumers should
 * not depend on the specific derivation beyond determinism — the info
 * string is versioned (`v1`) so we can rotate the KDF later without
 * silent collision with old outputs.
 */
export async function deriveSeed(passphrase) {
    const baseKey = await subtle().importKey('raw', utf8Bytes(passphrase), 'HKDF', false, ['deriveBits']);
    const bits = await subtle().deriveBits({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: HKDF_SALT,
        info: HKDF_INFO,
    }, baseKey, 256);
    return new Uint8Array(bits);
}
/**
 * Derive an Ed25519 keypair deterministically from a passphrase.
 *
 * Extractable=true on the private key so we can pull the public key out
 * via JWK export (WebCrypto's Ed25519 doesn't expose the pubkey from a
 * private-only PKCS8 import any other way). Not a security regression:
 * the seed is deterministically re-derivable from the passphrase, so
 * "the private key is extractable" is dominated by "the passphrase IS
 * the secret." Callers should keep the returned CryptoKey scoped to the
 * activation call and let it be GC'd rather than persisting it.
 */
export async function deriveOwnershipKeypair(passphrase) {
    const seed = await deriveSeed(passphrase);
    const pkcs8 = seedToPkcs8(seed);
    const privateKey = await subtle().importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
    const jwk = (await subtle().exportKey('jwk', privateKey));
    if (!jwk.x) {
        throw new Error('Ed25519 JWK export did not include the public key (x)');
    }
    const publicKeyRaw = base64UrlToBytes(jwk.x);
    const publicKeyBase64 = bytesToBase64(publicKeyRaw);
    return { privateKey, publicKeyRaw, publicKeyBase64 };
}
/**
 * Canonical byte serialization of the challenge message. NUL separator
 * gives an unambiguous boundary between fields — none of the fields'
 * current encodings (Field decimals, base58 addresses) can legitimately
 * contain NUL. The full serialized form is what both signer and
 * verifier hash into the Ed25519 signature.
 */
export function serializeChallenge(msg) {
    return utf8Bytes(`${msg.licenseHash}\0${msg.nonce}\0${msg.zkAppAddress}`);
}
export async function signChallenge(privateKey, msg) {
    const sig = await subtle().sign({ name: 'Ed25519' }, privateKey, serializeChallenge(msg));
    return new Uint8Array(sig);
}
/**
 * Verify an Ed25519 signature over a challenge message. Returns false
 * (never throws) for any failure — malformed pubkey, malformed
 * signature, wrong length, actual signature mismatch. Callers get a
 * single go/no-go decision without having to distinguish "invalid" from
 * "unparseable."
 */
export async function verifyChallenge(publicKeyRaw, msg, signature) {
    try {
        const spki = rawPubkeyToSpki(publicKeyRaw);
        const key = await subtle().importKey('spki', spki, { name: 'Ed25519' }, false, ['verify']);
        return await subtle().verify({ name: 'Ed25519' }, key, signature, serializeChallenge(msg));
    }
    catch {
        return false;
    }
}
export function encodeBase64(bytes) {
    return bytesToBase64(bytes);
}
export function decodeBase64(b64) {
    return base64ToBytes(b64);
}
//# sourceMappingURL=ownershipSignature.js.map