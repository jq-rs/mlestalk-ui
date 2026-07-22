/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * MlesTalk Pro — zkLicensing ownership gate.
 *
 * Single-device (maxConcurrentDevices = 1) by default. The user's passphrase
 * is the license key. The activation flow is a WebCrypto Ed25519 sign-
 * challenge — no o1js compile, no worker, no SharedArrayBuffer, no COOP/COEP.
 * Runs in a plain Cordova WebView, a locked-down enterprise browser, or a
 * headless CLI.
 *
 * Flow:
 *   activate(passphrase)  →  /challenge → sign(nonce) → /respond → { token, expiresAt }
 *   refresh()             →  /refresh   (silent, token-only)
 *   releaseSeat()         →  /releaseSeat (token-only, self)
 *   listSeats()           →  /seats     (Ed25519 sign, needs seed at rest)
 *   releaseOtherSeat(jti) →  /releaseSeat (Ed25519 sign, needs seed at rest)
 *
 * PRO status is "token not expired." The token's own signed `e` field is the
 * authoritative gate — cryptographically verified via
 * verifyOwnershipTokenClient with pinned keeper keys, so localStorage
 * tampering cannot extend it. `licenseExpiresAt` (from /respond and /refresh)
 * carries the on-chain expiry so the UI can render a real date.
 *
 * Refresh cadence mirrors the SDK's two-regime scheme
 * (packages/sdk/src/index.ts): wake once the token has ≤12h left, honor a
 * 60s+jitter cooldown between attempts, and surface refresh failures via
 * `license:change`.detail.refreshFailed so the UI can warn without breaking
 * the seat. Cooldown state lives in its own storage key
 * (`mlestalk_pro_refresh_state`) so it survives past the token's exp — an
 * expired-token client hitting refresh() during cooldown must still no-op.
 *
 * The 32-byte HKDF-derived seed is persisted under `secretSeed` in localStorage
 * so listSeats() and releaseOtherSeat() can rebuild the signing key silently
 * without re-prompting for the passphrase. Same trust posture as the previous
 * `secretHash` field: one-way derivative of the passphrase, useless to an
 * attacker who doesn't already have device access.
 */

import { verifyOwnershipTokenClient } from './vendor/zklicensing/ownershipTokenVerify.js';
import { DEFAULT_OWNERSHIP_PUBKEYS } from './vendor/zklicensing/ownershipPubkeys.js';
import {
  deriveSeed,
  deriveOwnershipKeypair,
  signChallenge,
  encodeBase64,
} from './vendor/zklicensing/ownershipSignature.js';
import {
  createRefreshStateStore,
  runGuardedRefresh,
  createRefreshScheduler,
  DEFAULT_COOLDOWN_MIN_MS,
} from './vendor/zklicensing/refreshScheduler.js';

// ---------------------------------------------------------------------------
// Config — populate before deploy.
// ---------------------------------------------------------------------------

export const LICENSE_CONFIG = {
  verifierUrl:  'https://zklicensing.com/api/verify',
  appId:        'mlestalk-pro',
  // TODO: set after vendor-side deploy of the mlestalk-pro app.
  zkAppAddress: 'B62qqyz4uUjZbyEAehKKyqde4CpXJhCwrVW8S7MkY7MXqYGP1hBd4sz',
  network:      'devnet',   // 'mainnet' | 'testnet' | 'devnet'

  // Generation this build was pinned against. Stays fixed for the lifetime
  // of this app binary — the keeper echoes back whichever generation
  // matches the address pinned above (its stable own-generation), so the
  // verify check always matches without a redeploy of this client.
  generation:   '1',

  // Ed25519 public keys the keeper is authorized to sign ownership tokens
  // with. Delivered via the SDK release itself as DEFAULT_OWNERSHIP_PUBKEYS
  // — rotations arrive on next `bash scripts/sync-vendor.sh`.
  pinnedOwnershipPubKeys: DEFAULT_OWNERSHIP_PUBKEYS,

  // Policy for the null-floor seam in init(). See ratchetIatFloor comments.
  seatPolicy: 'grace',
};

const STORAGE_KEY         = 'mlestalk_pro_license';
// Monotonic issued-at floor. Ratcheted forward to `max(stored, payload.iat)`
// on every successful ownership-token verify. Blocks the "clear localStorage,
// roll clock back, present stashed old token" replay a wall-clock expiry
// check alone can't catch.
const IAT_FLOOR_KEY       = 'mlestalk_pro_iat_floor';
// State of the background refresh loop, persisted independently of the
// license record so it survives past the token's exp. Mirrors the SDK's
// RefreshState (packages/sdk/src/index.ts): { nextAllowedAt, failed }.
// Purpose: (a) throttle /refresh across invocations so visibilitychange +
// multi-tab flapping don't hammer the keeper during an outage; (b) surface
// refreshFailed to the UI even after the token has died.
const REFRESH_STATE_KEY   = 'mlestalk_pro_refresh_state';

// Two-regime TTL: token exp = min(24h, licenseExp) during the on-chain
// refund window; = grace-end after. Refresh when the token has ≤12h left —
// gives a daily-verify buyer many chances to renew before the seat dies,
// and sits dormant in the post-refund regime where exp is often years out.
const TOKEN_EXP_RENEW_MS  = 12 * 60 * 60 * 1000;
// Cap on any scheduled setTimeout. A post-refund token whose exp is years
// out yields a naive delay above 2^31 ms — browsers clamp that to fire
// immediately, causing a refresh storm. Waking every 12h in that regime
// re-checks state cheaply (isPro() is local + cryptographic).
const MAX_REFRESH_DELAY_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Seed <-> keypair — inlined PKCS8 wrap so listSeats() / releaseOtherSeat()
// can rebuild the CryptoKey from the persisted seed without asking the user
// to re-enter the passphrase.
// ---------------------------------------------------------------------------

const PKCS8_ED25519_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  0x04, 0x22, 0x04, 0x20,
]);

function bytesToBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function base64UrlToBytes(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return base64ToBytes(b64 + pad);
}

async function keypairFromSeed(seed) {
  if (seed.length !== 32) throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
  pkcs8.set(PKCS8_ED25519_PREFIX, 0);
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  if (!jwk.x) throw new Error('Ed25519 JWK export did not include the public key (x)');
  const publicKeyRaw = base64UrlToBytes(jwk.x);
  return { privateKey, publicKeyRaw, publicKeyBase64: bytesToBase64(publicKeyRaw) };
}

// Poseidon(Encoding.bytesToFields(pubkey)) — matches the keeper's local
// derivation used in /respond and /seats/releaseSeat to bind the pubkey to
// the on-chain licenseHash. Loaded lazily so the app cold-starts without
// pulling o1js; the import only happens the first time we activate or
// verify a passphrase locally.
let licenseHashFromPubkeyCached = null;
async function computeLicenseHash(publicKeyRaw) {
  if (!licenseHashFromPubkeyCached) {
    const mod = await import('./vendor/zklicensing/ownershipLicenseHash.js');
    licenseHashFromPubkeyCached = mod.licenseHashFromPubkey;
  }
  return licenseHashFromPubkeyCached(publicKeyRaw);
}

// ---------------------------------------------------------------------------
// Persistent state (localStorage). Raw passphrase is never stored.
// ---------------------------------------------------------------------------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  // Also clear the refresh-state record. It's meaningless once the license
  // record is gone (there's nothing to refresh) and leaving a stale failed=true
  // flag around would falsely signal "refresh failing" on the next activation.
  try { localStorage.removeItem(REFRESH_STATE_KEY); } catch {}
  // Deliberately do NOT clear the iat floor — clearing it would let an
  // attacker reset the ratchet by triggering a logout, then roll back the
  // clock and present a stashed old token. The floor only ever grows.
  verifiedPayload = null;
}

// Shared refresh-state store, backed by the SDK's createRefreshStateStore
// primitive. Same storage shape ({ nextAllowedAt, failed }) as the SDK's
// own tryActivate loop — namespaced to mlestalk since we run a different
// endpoint (/refresh vs /challenge+/respond) but the same throttle policy.
const refreshStore = createRefreshStateStore(localStorage, REFRESH_STATE_KEY);

function isRefreshFailed() {
  return refreshStore.load()?.failed === true;
}

function readIatFloor() {
  try {
    const raw = localStorage.getItem(IAT_FLOOR_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch { return 0; }
}

function ratchetIatFloor(iat) {
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return;
  const current = readIatFloor();
  if (iat > current) {
    try { localStorage.setItem(IAT_FLOOR_KEY, String(iat)); } catch {}
  }
}

// In-memory cache of the last cryptographically-verified ownership-token
// payload. `stateIsFresh` refuses to trust anything else — reading
// `state.expiresAt` naked was the old advisory-only check that a determined
// buyer could edit in localStorage.
let verifiedPayload = null;

async function verifyToken(token) {
  if (!token) return null;
  const pins = LICENSE_CONFIG.pinnedOwnershipPubKeys || [];
  if (!pins.length) {
    console.warn('MlesTalk PRO: pinnedOwnershipPubKeys is empty — refusing to trust any ownership token. Check DEFAULT_OWNERSHIP_PUBKEYS in the vendored SDK; the platform never publishes an SDK release with an empty default.');
    return null;
  }
  try {
    const payload = await verifyOwnershipTokenClient(token, pins, {
      z: LICENSE_CONFIG.zkAppAddress,
      g: LICENSE_CONFIG.generation,
    }, { iatFloor: readIatFloor() });
    if (payload && typeof payload.iat === 'number') ratchetIatFloor(payload.iat);
    return payload;
  } catch { return null; }
}

function stateIsFresh(state) {
  if (!state?.token || !state?.expiresAt) return false;
  if (Date.now() >= state.expiresAt) return false;
  return verifiedPayload !== null;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

function baseUrl() { return LICENSE_CONFIG.verifierUrl.replace(/\/+$/, ''); }

async function fetchJson(url, init) {
  const resp = await fetch(url, init);
  const text = await resp.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!resp.ok) {
    const err = new Error(body?.error || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.body   = body;
    throw err;
  }
  return body;
}

// Retry-with-backoff for endpoints whose failure mode is transient upstream
// unavailability. /respond requires a live Mina node on the server side
// (per-call on-chain license-membership check); momentary node outages
// return 502 and shouldn't derail activation.
async function fetchJsonWithBackoff(url, init, opts = {}) {
  const delays  = opts.delaysMs || [5000, 15000, 60000];
  const onRetry = opts.onRetry  || (() => {});
  for (let i = 0; i <= delays.length; i++) {
    try { return await fetchJson(url, init); }
    catch (err) {
      const retryable = err.status === 502 || err.status === 503 || err.status === 504;
      if (!retryable || i === delays.length) throw err;
      const delayMs = delays[i];
      onRetry({ attempt: i + 1, of: delays.length, delayMs, error: err });
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function getChallenge(licenseHash) {
  return fetchJson(`${baseUrl()}/challenge?licenseHash=${encodeURIComponent(licenseHash)}`);
}

let networkCheckPromise = null;
function checkNetwork() {
  if (!networkCheckPromise) {
    networkCheckPromise = (async () => {
      const expected = String(LICENSE_CONFIG.network ?? '').toLowerCase();
      if (!expected) return;
      const body = await fetchJson(`${baseUrl()}/health`);
      const serverId  = String(body?.networkId ?? '').toLowerCase();
      const serverUrl = String(body?.network   ?? '').toLowerCase();
      const match = serverId ? serverId === expected : serverUrl.includes(expected);
      if (!match) {
        throw new Error(
          `License server is on the wrong Mina network. This build expects ` +
          `"${expected}", server reports "${body?.networkId || body?.network || 'unknown'}".`
        );
      }
    })().catch(err => { networkCheckPromise = null; throw err; });
  }
  return networkCheckPromise;
}

// Build the ownership envelope shared by /respond, /seats, and /releaseSeat
// kick-other. Signature covers (licenseHash, nonce, zkAppAddress) so a
// captured envelope can't be replayed against a different app or nonce.
async function buildEnvelope(keypair, licenseHash, nonce) {
  const signature = await signChallenge(keypair.privateKey, {
    licenseHash,
    nonce,
    zkAppAddress: LICENSE_CONFIG.zkAppAddress,
  });
  return {
    zkAppAddress: LICENSE_CONFIG.zkAppAddress,
    licenseHash,
    pubKey:       keypair.publicKeyBase64,
    nonce,
    signature:    encodeBase64(signature),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function noopEmit() {}

async function respondAndPersist(keypair, seed, licenseHash, emit) {
  emit({ stage: 'respond-challenge', message: 'Requesting activation challenge…' });
  const { nonce } = await getChallenge(licenseHash);

  emit({ stage: 'respond-signing', message: 'Signing activation challenge…' });
  const envelope = await buildEnvelope(keypair, licenseHash, nonce);

  emit({ stage: 'respond-submitting', message: 'Registering on license server…' });
  const respondBody = await fetchJsonWithBackoff(`${baseUrl()}/respond`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(envelope),
  }, {
    onRetry: ({ attempt, of, delayMs }) => emit({
      stage: 'respond-retry',
      message: `License server upstream unavailable — retrying in ${Math.round(delayMs / 1000)} s (${attempt}/${of})…`,
    }),
  });

  const payload = await verifyToken(respondBody.token);
  if (!payload) {
    throw new Error(
      'License server returned a token that failed signature verification. ' +
      'This build may be pinned to the wrong keeper keys, on the wrong ' +
      'generation, or the server is misconfigured. PRO not activated.'
    );
  }
  verifiedPayload = payload;

  const state = {
    secretSeed:       bytesToBase64(seed),
    licenseHash,
    pubKey:           keypair.publicKeyBase64,
    token:            respondBody.token,
    expiresAt:        respondBody.expiresAt,
    licenseExpiresAt: respondBody.licenseExpiresAt ?? null,
    jti:              respondBody.jti,
    name:             respondBody.name ?? payload.n ?? null,
  };
  saveState(state);
  // Fresh activation clears any stale failed=true left over from a previous
  // session. Cooldown is anchored to 'now' so a subsequent verifyLicense
  // burst can't immediately re-fire /refresh.
  refreshStore.save({ nextAllowedAt: Date.now() + DEFAULT_COOLDOWN_MIN_MS, failed: false });
  scheduleNextRefresh();
  emitChange();

  emit({ stage: 'done', message: 'PRO activated.' });
  return {
    valid: true,
    expiresAt: state.expiresAt,
    name: state.name,
    evicted: respondBody.evicted ?? null,
  };
}

async function activate(passphrase, opts = {}) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('License key must be at least 8 characters.');
  }
  const emit = opts.onProgress || noopEmit;

  emit({ stage: 'network-check', message: `Confirming license server is on ${LICENSE_CONFIG.network}…` });
  await checkNetwork();

  emit({ stage: 'deriving', message: 'Deriving activation key from passphrase…' });
  const seed = await deriveSeed(passphrase);
  const keypair = await keypairFromSeed(seed);
  const licenseHash = await computeLicenseHash(keypair.publicKeyRaw);

  return respondAndPersist(keypair, seed, licenseHash, emit);
}

// Sentinel used to distinguish "failed signature/pin verification" (a hard
// failure — clear state, no cooldown) from transient network / 5xx errors.
// Thrown from inside the refreshFn and caught by runGuardedRefresh's
// isHardFailure predicate.
class HardRefreshError extends Error {
  constructor(reason) { super(reason); this.name = 'HardRefreshError'; }
}

async function refresh() {
  const state = loadState();
  if (!state?.token) { cancelRefresh(); emitChange(); return { valid: false }; }

  let refreshedTokenPayload = null;   // captured from inside the closure
  let refreshedBody         = null;

  try {
    const outcome = await runGuardedRefresh(async () => {
      const body = await fetchJson(`${baseUrl()}/refresh`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ token: state.token }),
      });
      const payload = await verifyToken(body.token);
      if (!payload) {
        try {
          console.warn('[mlestalk-pro] refresh token failed signature/pin verification — clearing PRO state. Check pinnedOwnershipPubKeys against the keeper and confirm zkAppAddress + generation match the vendor config.');
        } catch { /* console unavailable */ }
        throw new HardRefreshError('Refreshed token failed signature verification.');
      }
      refreshedTokenPayload = payload;
      refreshedBody = body;
      return body;
    }, {
      store: refreshStore,
      isHardFailure: (err) =>
        err instanceof HardRefreshError ||
        err?.status === 401,   // seat lost / token revoked — clear, no cooldown
    });

    if (outcome.status === 'skipped') {
      // Caller-driven refresh() during cooldown. Reschedule so the next
      // wake happens at nextAllowedAt, not later.
      scheduleNextRefresh();
      return {
        valid: !!verifiedPayload,
        cooldownUntil: outcome.nextAllowedAt,
        refreshFailed: outcome.failed,
      };
    }

    if (outcome.status === 'success') {
      verifiedPayload = refreshedTokenPayload;
      const next = {
        ...state,
        token:            refreshedBody.token,
        expiresAt:        refreshedBody.expiresAt,
        licenseExpiresAt: refreshedBody.licenseExpiresAt ?? state.licenseExpiresAt ?? null,
        name:             refreshedBody.name ?? refreshedTokenPayload.n ?? state.name ?? null,
      };
      saveState(next);
      scheduleNextRefresh();
      emitChange();
      return { valid: true, expiresAt: next.expiresAt };
    }

    // Transient failure — token retained, failed=true persisted by
    // runGuardedRefresh. Reschedule so we retry when cooldown elapses.
    scheduleNextRefresh();
    emitChange();
    return {
      valid: !!verifiedPayload,
      reason: outcome.error?.message ?? 'refresh failed',
      refreshFailed: true,
    };
  } catch (err) {
    // Hard failure: seat lost, token revoked, or refreshed token failed
    // signature verification. Not transient — clear everything so the
    // user re-activates cleanly on next attempt.
    clearState();
    cancelRefresh();
    emitChange();
    return { valid: false, reason: err.message };
  }
}

function emitChange() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('license:change', {
        detail: { isPro: isPro(), refreshFailed: isRefreshFailed() },
      }));
    }
  } catch { /* CustomEvent unavailable — swallow */ }
}

async function releaseSeat(opts = {}) {
  const emit  = opts.onProgress || noopEmit;
  const state = loadState();
  if (!state?.token) { clearState(); emit({ stage: 'done', message: 'Nothing to release.' }); return; }
  emit({ stage: 'releasing', message: 'Releasing seat on license server…' });
  try {
    await fetchJson(`${baseUrl()}/releaseSeat`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ token: state.token }),
    });
  } catch { /* idempotent — swallow */ }
  clearState();
  cancelRefresh();
  emitChange();
  emit({ stage: 'done', message: 'Seat released.' });
}

function isPro() {
  return stateIsFresh(loadState());
}

function getExpiresAt() {
  return loadState()?.expiresAt ?? null;
}

// On-chain license expiry (ISO string). Distinct from getExpiresAt(), which
// returns the rolling session-token TTL.
function getLicenseExpiresAt() {
  return loadState()?.licenseExpiresAt ?? null;
}

function getSeatName() {
  return loadState()?.name ?? verifiedPayload?.n ?? null;
}

// When the background scheduler is next scheduled to fire /refresh for this
// device. Mirrors createRefreshScheduler's own delay math: fires when BOTH
// the cooldown has elapsed AND the token is inside the 12h renew window,
// then clamped to the 12h max scheduled-delay. Returns null when there's
// no active session to refresh.
function getNextRefreshAt() {
  const state = loadState();
  if (!state?.token) return null;
  const cooldownAt = refreshStore.load()?.nextAllowedAt ?? 0;
  const renewAt = state.expiresAt - TOKEN_EXP_RENEW_MS;
  const nextAt = Math.max(cooldownAt, renewAt, Date.now());
  return Math.min(nextAt, Date.now() + MAX_REFRESH_DELAY_MS);
}

// Rebuild the signing keypair from the persisted seed. Used by the elevated
// endpoints (/seats, /releaseSeat kick-other) which need a fresh Ed25519
// signature per call. Throws if there's no persisted seed — happens if the
// device was activated by an older build (pre-Ed25519) whose state schema
// stored `secretHash` instead. Callers should treat that as "re-activate
// required."
async function loadKeypair() {
  const state = loadState();
  if (!state?.secretSeed) {
    throw new Error('No activation seed on this device — re-activate PRO to enable device management.');
  }
  const seed = base64ToBytes(state.secretSeed);
  return keypairFromSeed(seed);
}

// Fetch the full list of live seats on this license. Proof-required — the
// server needs a fresh Ed25519 signature to prove ownership. Returns
// { seats: [{ jti, name, mintedAt, lastRefreshAt, exp, self? }], deviceLimit }.
async function listSeats(opts = {}) {
  const state = loadState();
  if (!state?.licenseHash) {
    throw new Error('No local license. Activate before listing seats.');
  }
  const emit = opts.onProgress || noopEmit;

  emit({ stage: 'network-check', message: `Confirming license server is on ${LICENSE_CONFIG.network}…` });
  await checkNetwork();

  emit({ stage: 'seats-signing', message: 'Signing listing challenge…' });
  const keypair = await loadKeypair();
  const { nonce } = await getChallenge(state.licenseHash);
  const envelope = await buildEnvelope(keypair, state.licenseHash, nonce);

  emit({ stage: 'seats-fetching', message: 'Fetching seat list…' });
  const body = await fetchJson(`${baseUrl()}/seats`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ ...envelope, currentJti: state.jti || undefined }),
  });

  emit({ stage: 'done', message: `${body?.seats?.length ?? 0} seat(s) live.` });
  return body;
}

// Kick a *different* seat off this license by jti. Proof-required so a
// leaked token alone can't evict the buyer's own primary device.
async function releaseOtherSeat(targetJti, opts = {}) {
  if (!targetJti || typeof targetJti !== 'string') {
    throw new Error('releaseOtherSeat requires a targetJti string.');
  }
  const state = loadState();
  if (!state?.licenseHash) {
    throw new Error('No local license. Activate before releasing other seats.');
  }
  if (targetJti === state.jti) {
    throw new Error('Use releaseSeat() to release this device — releaseOtherSeat is for other devices only.');
  }
  const emit = opts.onProgress || noopEmit;

  emit({ stage: 'network-check', message: `Confirming license server is on ${LICENSE_CONFIG.network}…` });
  await checkNetwork();

  emit({ stage: 'release-signing', message: 'Signing release challenge…' });
  const keypair = await loadKeypair();
  const { nonce } = await getChallenge(state.licenseHash);
  const envelope = await buildEnvelope(keypair, state.licenseHash, nonce);

  emit({ stage: 'release-submitting', message: 'Releasing seat on license server…' });
  await fetchJson(`${baseUrl()}/releaseSeat`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ ...envelope, targetJti }),
  });

  emit({ stage: 'done', message: 'Seat released.' });
}

// ---------------------------------------------------------------------------
// Background refresh — silent, no user prompt. Threshold-driven via the
// SDK's createRefreshScheduler: fires when the token has ≤12h left, or
// when a prior-attempt cooldown elapses, whichever is later. Replaces the
// old fixed 24h interval, which raced with the token's own exp during the
// refund window and was wasteful in the post-refund regime.
// ---------------------------------------------------------------------------

const scheduler = createRefreshScheduler({
  store: refreshStore,
  maxDelayMs: MAX_REFRESH_DELAY_MS,
  computeRenewDelay: () => {
    const state = loadState();
    if (!state?.token) return Infinity;   // nothing to refresh
    return Math.max(0, state.expiresAt - Date.now() - TOKEN_EXP_RENEW_MS);
  },
  // refresh() calls scheduleNextRefresh() at each terminal path except
  // the hard-failure branches, which call cancelRefresh() explicitly.
  onTick: () => { void refresh(); },
});

function scheduleNextRefresh() {
  if (!loadState()?.token) { scheduler.cancel(); return; }
  scheduler.reschedule();
}

function cancelRefresh() { scheduler.cancel(); }

// Re-refresh whenever the app returns to the foreground.
function installForegroundResync() {
  if (typeof document === 'undefined') return;
  const onWake = () => { if (loadState()?.token) void refresh(); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onWake();
  });
  document.addEventListener('resume', onWake, false);   // Cordova
  if (typeof window !== 'undefined') window.addEventListener('focus', onWake);
}
let foregroundResyncInstalled = false;

async function init() {
  if (!foregroundResyncInstalled) {
    installForegroundResync();
    foregroundResyncInstalled = true;
  }
  const state = loadState();
  if (!state?.token) return;

  // Null-floor seam. iatFloor == 0 means (a) genuine first run, (b) storage
  // cleared, or (c) attacker deliberately cleared it. Indistinguishable
  // locally — force a keeper round-trip so an actually-expired token 401s
  // and a live token gets reissued with a fresh iat.
  if (readIatFloor() === 0) {
    const outcome = await refresh();
    if (outcome?.valid) {
      scheduleNextRefresh();
      return;
    }
    const stillHave = loadState()?.token;
    if (!stillHave) {
      emitChange();
      return;
    }
    if ((LICENSE_CONFIG.seatPolicy || 'grace') !== 'grace') {
      emitChange();
      return;
    }
    const payload = await verifyToken(stillHave);
    if (!payload) {
      clearState();
      emitChange();
      return;
    }
    verifiedPayload = payload;
    emitChange();
    scheduleNextRefresh();
    return;
  }

  // Non-null-floor path: verify locally first for a fast UI update, then
  // refresh in the background to surface revoked seats.
  const payload = await verifyToken(state.token);
  if (!payload) {
    clearState();
    emitChange();
    return;
  }
  verifiedPayload = payload;
  emitChange();

  await refresh();
  if (isPro()) scheduleNextRefresh();
}

// ---------------------------------------------------------------------------
// Expose to the rest of the app (which is not module-based).
// ---------------------------------------------------------------------------

const License = {
  init,
  activate,
  refresh,
  releaseSeat,
  releaseOtherSeat,
  listSeats,
  isPro,
  getExpiresAt,
  getLicenseExpiresAt,
  getSeatName,
  getNextRefreshAt,
  config: LICENSE_CONFIG,
};

if (typeof window !== 'undefined') {
  window.License = License;
  window.dispatchEvent(new CustomEvent('license:ready'));
}

export default License;
