/**
 * ownershipTokenVerify.ts
 *
 * Browser + Node WebCrypto Ed25519 verifier for ownership tokens minted by
 * the keeper's /respond and /refresh endpoints. The vendor app pins the
 * keeper's Ed25519 public key(s) at build time and calls this to decide
 * whether to grant seat access — no network round-trip required.
 *
 * This is the enforcement point for cross-app binding: the caller passes
 * `expected.z` and `expected.g` as its OWN authoritative values (the vendor
 * app's own pinned deployment address and current generation), and the
 * function refuses any token whose signed z/g don't match. A token minted
 * for a different app or an older generation will not verify here even
 * though its signature is valid.
 *
 * Runtime: modern browsers + Node ≥ 20 expose `globalThis.crypto.subtle`
 * with Ed25519 support (Chromium 137+, Safari 17+, Firefox 130+). The
 * verifier fails closed if subtle or Ed25519 support is unavailable —
 * callers must interpret a null return as "do not trust."
 *
 * Canonicalization mirrors src/ownership.ts and src/manifestSign.ts byte-
 * for-byte. Divergence silently breaks verification.
 */
import type { OwnershipTokenPayload } from './ownershipTypes.js';
export type { OwnershipTokenPayload };
export declare function canonicalize(value: unknown): string;
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
export declare function verifyOwnershipTokenClient(token: string, pinnedPublicKeysBase64: readonly string[], expected: {
    z: string;
    g: string;
}, opts?: {
    iatFloor?: number;
}): Promise<OwnershipTokenPayload | null>;
//# sourceMappingURL=ownershipTokenVerify.d.ts.map