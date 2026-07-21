// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
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
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, } from 'crypto';
import fs from 'fs/promises';
import { Field } from '../o1js/index.js';
export const OWNERSHIP_CHALLENGE_TTL_MS = 600_000;
// A device that stays active refreshes via a fresh /challenge + /respond;
// a lost/uninstalled device burns its slot for at most this long before
// the server prunes it (see verifyService session store). 7 days gives
// plenty of margin over the recommended 24h client refresh cadence so a
// client whose silent refresh is delayed by intermittent network trouble
// (weekend traveling, spotty carrier) never drops out of PRO mid-session.
//
// This value is a ceiling: verifyService caps every issued token at
// grace-end (`Date.parse(licenseExpiresAt) + GRACE_PERIOD_N * MS_PER_SLOT_N`)
// so a token can never outlive the on-chain license. If the raw TTL below
// would exceed grace-end for a near-expiry license, the shorter one wins.
//
// The bound on a stashed / replayed token comes from the browser-side
// iatFloor ratchet (see verifyOwnershipTokenClient in this package):
// every accepted token ratchets the client's monotonic iatFloor forward,
// and the server stamps a fresh `iat` on every /respond and /refresh, so
// a token pulled off disk from a week ago is rejected as stale by the
// verifier the moment a newer one has been observed. TTL alone is NOT
// the replay defense; the ratchet is.
export const OWNERSHIP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Generate a 128-bit random jti. base64url so it drops into token payloads
// and query strings without escaping.
export function newJti() {
    return randomBytes(16).toString('base64url');
}
export function createChallengeStore(ttlMs = OWNERSHIP_CHALLENGE_TTL_MS) {
    const issued = new Map(); // `${lh}:${nonce}` → expiresAt
    return {
        issue(licenseHash) {
            const nonce = Field.random().toString();
            issued.set(`${licenseHash}:${nonce}`, Date.now() + ttlMs);
            return { nonce, ttl: ttlMs };
        },
        consume(licenseHash, nonce) {
            const key = `${licenseHash}:${nonce}`;
            const expiresAt = issued.get(key);
            if (expiresAt === undefined)
                return 'unknown';
            issued.delete(key);
            if (Date.now() > expiresAt)
                return 'expired';
            return 'ok';
        },
        size: () => issued.size,
    };
}
// --- token signing (Ed25519) -------------------------------------------------
// Canonical JSON: sorted keys, no whitespace, arrays preserved in order.
// Mirror of manifestSign.ts:canonicalize so an operator running both signers
// gets identical byte-level behavior. The transmitted token body is a plain
// JSON.stringify (field order unspecified), but the signature covers the
// canonicalized bytes — verifiers reproduce those bytes from the parsed
// payload, independent of on-the-wire field order.
export function canonicalize(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonicalize).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}
// Load (or bootstrap) the ownership-token Ed25519 signing key.
//
// Disk format matches manifestSign.ts so operators can reason about all
// keeper-side keys the same way: `{ "seed": "<base64 32-byte>" }`. First
// boot on a fresh host generates a fresh keypair, writes it 0600, and
// returns `created: true` so startup can log the fingerprint for the
// vendor to pin. Idempotent on subsequent boots.
export async function loadOrCreateOwnershipKey(keyFile) {
    let created = false;
    try {
        await fs.access(keyFile);
    }
    catch {
        const { privateKey: pk } = generateKeyPairSync('ed25519');
        const jwk = pk.export({ format: 'jwk' });
        const seedBase64 = Buffer.from(jwk.d, 'base64url').toString('base64');
        await fs.writeFile(keyFile, JSON.stringify({ seed: seedBase64 }, null, 2), { mode: 0o600 });
        await fs.chmod(keyFile, 0o600);
        created = true;
    }
    const parsed = JSON.parse(await fs.readFile(keyFile, 'utf8'));
    if (!parsed.seed)
        throw new Error(`ownership key file ${keyFile} missing "seed"`);
    const seed = Buffer.from(parsed.seed, 'base64');
    if (seed.length !== 32)
        throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
    // PKCS8 DER prefix for an Ed25519 private key with a 32-byte seed.
    const pkcs8 = Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        seed,
    ]);
    const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
    const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
    const publicKeyBase64 = Buffer.from(jwk.x, 'base64url').toString('base64');
    return { privateKey, publicKeyBase64, created };
}
// Generate a fresh Ed25519 ownership keypair in memory. Intended for tests
// and for callers that want to run without persisting a key file — production
// use should go through loadOrCreateOwnershipKey so operators can pin the
// pubkey and re-boot without regenerating.
export function newOwnershipKeyPair() {
    const { privateKey } = generateKeyPairSync('ed25519');
    const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
    const publicKeyBase64 = Buffer.from(jwk.x, 'base64url').toString('base64');
    return { privateKey, publicKeyBase64 };
}
// Mint a fresh ownership token for a device session. Always populates `jti`
// so the concurrent-device cap has a distinct id to count against — the
// type marks jti optional for parse-tolerance of pre-jti tokens on read,
// but mint MUST NEVER omit it, otherwise two device sessions with no jti
// would be indistinguishable in the session store and the cap would fail
// open silently. This helper is the single mint entry point; callers must
// not hand-roll a payload with jti omitted.
//
// Optional `n` is a human-readable device name shown by the client's device
// list ("Silent Otter"). Purely cosmetic — the verifier never gates on it.
// Callers that omit it get a token with no `n` field; a browser reading such
// a token displays "This device" as a fallback.
export function mintOwnershipToken(privateKey, base) {
    const jti = newJti();
    // iat comes from Date.now() at the ONE mint entry point so the wire field
    // is the keeper's clock, not the caller's — verifiers ratchet against it
    // as a monotonic floor (see verifyOwnershipTokenClient's iatFloor option).
    const payload = {
        v: 1, z: base.z, g: base.g, l: base.l, e: base.e, iat: Date.now(), jti,
        ...(base.n ? { n: base.n } : {}),
    };
    const token = signOwnershipToken(privateKey, payload);
    return { token, jti, payload };
}
// Sign an ownership token. Wire format:
//   <base64url(JSON.stringify(payload))>.<base64(sig)>
// Signature is over canonicalize(payload) bytes, not the transmitted body
// bytes — verifiers re-canonicalize after JSON.parse so field order on the
// wire is irrelevant.
//
// Prefer `mintOwnershipToken` for issuing new tokens — it guarantees jti is
// set. This lower-level entry point exists for /refresh, which reissues an
// existing payload (preserving its jti or its intentional absence) and for
// tests.
export function signOwnershipToken(privateKey, payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const bytes = Buffer.from(canonicalize(payload), 'utf8');
    const sig = sign(null, bytes, privateKey).toString('base64');
    return `${body}.${sig}`;
}
// Parse a token's payload WITHOUT verifying its signature. Used by callers
// that need to look up expected values (e.g., resolve a registry entry by
// payload.z) BEFORE running the real verify. The returned data is untrusted
// until the caller feeds the same token back into verifyOwnershipToken and
// gets a non-null result.
export function peekOwnershipTokenPayload(token) {
    const dot = token.indexOf('.');
    if (dot < 0)
        return null;
    const body = token.slice(0, dot);
    try {
        return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
// Verify an ownership token against a pinned Ed25519 public key AND an
// expected (zkAppAddress, generation) pair. Returns the payload on success
// or null on any failure (malformed envelope, wrong version, past-expiry,
// cross-instance mismatch, bad signature).
//
// `expected.z` / `expected.g` MUST come from the same authoritative source
// the verifier uses everywhere else — the pinned/signed generation list —
// so a token minted for a different app or an older generation can't slip
// through. The check is mandatory at the API boundary on purpose; there is
// no "skip this" mode.
//
// `pinnedPublicKeysBase64` accepts multiple keys so the operator can rotate
// (mint under key A, verify under [A, B]) or pin a break-glass backup from
// day one. The token verifies if it validates under any pinned key.
//
// This is the Node-side verifier used by the keeper's /verify path. Browsers
// use the async WebCrypto path in ownershipTokenVerify.ts, which the SDK
// exports for vendor apps to run offline against the same pinned public
// keys.
export function verifyOwnershipToken(pinnedPublicKeysBase64, token, expected) {
    const dot = token.indexOf('.');
    if (dot < 0)
        return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
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
    const bytes = Buffer.from(canonicalize(payload), 'utf8');
    const sigBuf = Buffer.from(sig, 'base64');
    for (const pkBase64 of pinnedPublicKeysBase64) {
        try {
            const pubKey = createPublicKey({
                key: Buffer.concat([
                    Buffer.from('302a300506032b6570032100', 'hex'),
                    Buffer.from(pkBase64, 'base64'),
                ]),
                format: 'der',
                type: 'spki',
            });
            if (verify(null, bytes, pubKey, sigBuf))
                return payload;
        }
        catch {
            // Try the next pinned key.
        }
    }
    return null;
}
// --- rate-limit store --------------------------------------------------------
//
// Per-license rolling 24h counter for endpoints that would otherwise be
// abusable. In-memory, restart-drops-counts by design — same semantics as
// createSessionStore. That is intentional: a restart is not a common event,
// and losing the count is fail-open in the caller's favor.
//
// Storage is a sorted-ascending array of timestamps per license. `bump`
// prunes anything older than the 24h window first, then either records the
// new timestamp (state: 'ok') or refuses it (state: 'at-cap') with a
// retry-after computed from the oldest surviving timestamp.
//
// Used by verifyService for /releaseSeat and /resetSessions caps —
// both are legitimate operations the license owner might invoke, but at
// bounded frequency. An attacker who exfiltrated a token could spam
// /releaseSeat to lock a legit owner out; the cap makes that noticeable.
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export function createRateLimitStore(windowMs = RATE_LIMIT_WINDOW_MS) {
    const events = new Map(); // key → sorted-asc timestamps
    return {
        bump(key, cap) {
            const now = Date.now();
            const cutoff = now - windowMs;
            const arr = events.get(key) ?? [];
            // Prune expired from the front — array is sorted-asc so a single scan.
            let firstFresh = 0;
            while (firstFresh < arr.length && arr[firstFresh] <= cutoff)
                firstFresh++;
            const fresh = firstFresh === 0 ? arr : arr.slice(firstFresh);
            if (fresh.length >= cap) {
                events.set(key, fresh);
                const retryAfterMs = fresh[0] + windowMs - now;
                return { state: 'at-cap', retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)), remaining: 0 };
            }
            fresh.push(now);
            events.set(key, fresh);
            return { state: 'ok', retryAfterSec: 0, remaining: cap - fresh.length };
        },
        size() {
            let n = 0;
            for (const arr of events.values())
                n += arr.length;
            return n;
        },
    };
}
export function createSessionStore() {
    // licenseHash → jti → row
    const sessions = new Map();
    const pruneLicense = (licenseHash) => {
        const perLic = sessions.get(licenseHash);
        if (!perLic)
            return undefined;
        const now = Date.now();
        for (const [jti, row] of perLic)
            if (row.exp <= now)
                perLic.delete(jti);
        if (perLic.size === 0) {
            sessions.delete(licenseHash);
            return undefined;
        }
        return perLic;
    };
    return {
        insert(licenseHash, jti, exp, cap, name) {
            const perLic = pruneLicense(licenseHash) ?? new Map();
            if (cap > 0 && perLic.size >= cap && !perLic.has(jti)) {
                return { state: 'at-cap', active: perLic.size };
            }
            const now = Date.now();
            // On a repeat insert for the same jti (e.g. an idempotent /respond
            // retry that landed before the earlier response was persisted client-
            // side), preserve mintedAt so the seat's identity doesn't reset.
            const existing = perLic.get(jti);
            perLic.set(jti, {
                jti,
                name,
                exp,
                mintedAt: existing?.mintedAt ?? now,
                lastRefreshAt: now,
            });
            sessions.set(licenseHash, perLic);
            return { state: 'ok', active: perLic.size };
        },
        refresh(licenseHash, jti, newExp) {
            const perLic = pruneLicense(licenseHash);
            const row = perLic?.get(jti);
            if (!row)
                return false;
            row.exp = newExp;
            row.lastRefreshAt = Date.now();
            return true;
        },
        has(licenseHash, jti) {
            const perLic = pruneLicense(licenseHash);
            return perLic?.has(jti) ?? false;
        },
        list(licenseHash) {
            const perLic = pruneLicense(licenseHash);
            if (!perLic)
                return [];
            return Array.from(perLic.values());
        },
        evictLRR(licenseHash) {
            const perLic = pruneLicense(licenseHash);
            if (!perLic || perLic.size === 0)
                return null;
            let victim = null;
            for (const row of perLic.values()) {
                if (victim === null ||
                    row.lastRefreshAt < victim.lastRefreshAt ||
                    (row.lastRefreshAt === victim.lastRefreshAt && row.mintedAt < victim.mintedAt)) {
                    victim = row;
                }
            }
            if (!victim)
                return null;
            perLic.delete(victim.jti);
            if (perLic.size === 0)
                sessions.delete(licenseHash);
            return { jti: victim.jti, name: victim.name, lastRefreshAt: victim.lastRefreshAt };
        },
        releaseSeat(licenseHash, jti) {
            const perLic = sessions.get(licenseHash);
            if (!perLic)
                return false;
            const had = perLic.delete(jti);
            if (perLic.size === 0)
                sessions.delete(licenseHash);
            return had;
        },
        reset(licenseHash) {
            const perLic = sessions.get(licenseHash);
            if (!perLic)
                return 0;
            const n = perLic.size;
            sessions.delete(licenseHash);
            return n;
        },
        activeCount(licenseHash) {
            return pruneLicense(licenseHash)?.size ?? 0;
        },
        size() {
            let n = 0;
            for (const perLic of sessions.values())
                n += perLic.size;
            return n;
        },
    };
}
//# sourceMappingURL=ownership.js.map