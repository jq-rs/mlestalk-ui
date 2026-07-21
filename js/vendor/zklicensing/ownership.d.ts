/**
 * ownership.ts
 *
 * Ownership-token helpers and a small in-memory nonce store for the
 * challenge-response /verify flow.
 *
 * Replay-resistance: the client's Ed25519 sign-challenge (see
 * ownershipSignature.ts) binds (licenseHash, nonce, zkAppAddress). The
 * keeper hands out a nonce, the client signs it, the keeper consumes the
 * nonce on the way through. Tokens are Ed25519-signed
 * envelopes over (v, z=zkAppAddress, g=generation, l=licenseHash, e=expMs,
 * jti?). The signature is asymmetric, so anyone can verify a token (vendors
 * ship a pinned public key and check locally, offline), but only the verify
 * service can mint one. This closes the "vendor-side seat state is a
 * client-writable number in localStorage" hole from earlier: the token's
 * own `e` field is the authoritative expiry, verified against the pinned
 * key, and no localStorage tampering can extend it.
 *
 * Cross-instance binding: `z` (zkApp deployment address) and `g` (generation
 * counter) are checked by the verifier against what it independently expects
 * for the app it's running as. Without these bound *and checked*, a token
 * minted for a $1 test app would validate as a seat for the pro app. The
 * verifier MUST get the expected z/g from the same authoritative source it
 * uses everywhere else — the pinned/signed generation list — not from any
 * file the client can rewrite. `verifyOwnershipToken` takes them as required
 * arguments to force this at the API boundary.
 *
 * Payload versioning: `v: 1` lets us change the wire format later with a
 * documented verifier-overlap window. A verifier seeing `v !== 1` must
 * refuse the token — the type is closed on purpose.
 *
 * Public-not-secret: `l` is the public `licenseHash` (already visible
 * post-purchase), never a private key or anything derived from the buyer's
 * passphrase. The "buyer's secret never leaves the client" invariant holds.
 *
 * Time unit: `e` is milliseconds since epoch (matches `Date.now()`),
 * NOT Mina slots. The vendor's `stateIsFresh` compares `Date.now() < e`.
 *
 * Key separation: the ownership-token signing key is separate from the
 * platform manifest key. A leaked seat signer can mint seats; it must NOT
 * be able to forge generation lists. Never reuse PLATFORM_MANIFEST_KEY_FILE
 * here.
 *
 * Session tracking: the optional `jti` field lets the caller run a
 * revocation / concurrency layer on top of the stateless signature — the
 * token is still validated cryptographically, but the caller can also
 * check that the jti is present in a per-license active-session set.
 *
 * Wire format: `<base64url(JSON.stringify(payload))>.<base64(signature)>`.
 * Signature is over `canonicalize(payload)` bytes so verifiers reproduce
 * the same input regardless of field order in the transmitted JSON (mirror
 * of the manifestVerify.ts / manifestSign.ts canonicalization pattern).
 */
import { type KeyObject } from 'crypto';
export declare const OWNERSHIP_CHALLENGE_TTL_MS = 600000;
export declare const OWNERSHIP_TOKEN_TTL_MS: number;
export type { OwnershipTokenPayload } from './ownershipTypes.js';
import type { OwnershipTokenPayload } from './ownershipTypes.js';
export declare function newJti(): string;
export type ChallengeStore = {
    issue(licenseHash: string): {
        nonce: string;
        ttl: number;
    };
    consume(licenseHash: string, nonce: string): 'ok' | 'unknown' | 'expired';
    size(): number;
};
export declare function createChallengeStore(ttlMs?: number): ChallengeStore;
export declare function canonicalize(value: unknown): string;
export declare function loadOrCreateOwnershipKey(keyFile: string): Promise<{
    privateKey: KeyObject;
    publicKeyBase64: string;
    created: boolean;
}>;
export declare function newOwnershipKeyPair(): {
    privateKey: KeyObject;
    publicKeyBase64: string;
};
export declare function mintOwnershipToken(privateKey: KeyObject, base: {
    z: string;
    g: string;
    l: string;
    e: number;
    n?: string;
}): {
    token: string;
    jti: string;
    payload: OwnershipTokenPayload;
};
export declare function signOwnershipToken(privateKey: KeyObject, payload: OwnershipTokenPayload): string;
export declare function peekOwnershipTokenPayload(token: string): OwnershipTokenPayload | null;
export declare function verifyOwnershipToken(pinnedPublicKeysBase64: readonly string[], token: string, expected: {
    z: string;
    g: string;
}): OwnershipTokenPayload | null;
export type SessionRow = {
    jti: string;
    name: string;
    exp: number;
    mintedAt: number;
    lastRefreshAt: number;
};
export type SessionStore = {
    insert(licenseHash: string, jti: string, exp: number, cap: number, name: string): {
        state: 'ok' | 'at-cap';
        active: number;
    };
    refresh(licenseHash: string, jti: string, newExp: number): boolean;
    has(licenseHash: string, jti: string): boolean;
    list(licenseHash: string): SessionRow[];
    evictLRR(licenseHash: string): {
        jti: string;
        name: string;
        lastRefreshAt: number;
    } | null;
    releaseSeat(licenseHash: string, jti: string): boolean;
    reset(licenseHash: string): number;
    activeCount(licenseHash: string): number;
    size(): number;
};
export type RateLimitStore = {
    bump(key: string, cap: number): {
        state: 'ok' | 'at-cap';
        retryAfterSec: number;
        remaining: number;
    };
    size(): number;
};
export declare function createRateLimitStore(windowMs?: number): RateLimitStore;
export declare function createSessionStore(): SessionStore;
//# sourceMappingURL=ownership.d.ts.map