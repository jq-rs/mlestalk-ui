/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * MlesTalk Pro — zkLicensing ownership gate.
 *
 * Single-device (maxConcurrentDevices = 1). The user's passphrase (a UUID
 * suggested by the marketplace, or any string they chose) is the license
 * key. From it we derive:
 *   - secretHash  — private, stays on this device
 *   - licenseHash — public identifier, sent to the verifier
 *
 * Flow:
 *   activate(passphrase)  →  /verify/challenge → LicenseProof → /verify/respond → { token, expiresAt }
 *   refresh()             →  /verify/refresh   (silent, no wallet, no proof)
 *   releaseSeat()         →  /verify/releaseSeat
 *
 * PRO status is "token not expired." No slot-based anchor logic — that would
 * require the full ProofFile (expirySlot, purchaseSlot). The token TTL (7d,
 * clamped by the keeper to on-chain grace-end) carries the gate; we refresh
 * silently every 24h while the app is open, so a delayed refresh has 6 days
 * of slack before the token actually expires.
 *
 * The verifier's /respond and /refresh replies also carry `licenseExpiresAt`
 * — the ISO date of the license's actual on-chain expiry. We persist it and
 * expose it via getLicenseExpiresAt() so the UI can show a real expiry date
 * and fire renewal nudges as the on-chain expiry approaches. Reading
 * getExpiresAt() (session-token TTL) for that purpose would only ever show a
 * rolling ~7-day date, since /refresh bumps the TTL every 24h.
 */

// ---------------------------------------------------------------------------
// Config — populate before deploy.
// ---------------------------------------------------------------------------
import { verifyOwnershipTokenClient } from './vendor/zklicensing/ownershipTokenVerify.js';
import { DEFAULT_OWNERSHIP_PUBKEYS } from './vendor/zklicensing/ownershipPubkeys.js';

export const LICENSE_CONFIG = {
  verifierUrl:  'https://zklicensing.com/api/verify',
  appId:        'mlestalk-pro',
  // TODO: set after vendor-side deploy of the mlestalk-pro app.
  zkAppAddress: 'B62qjsYuLJ9ZeEfFMrLp6gn5ZFH5v18WZkfn3ozURKfhtcJSB2cvYXJ',
  network:      'devnet',   // 'mainnet' | 'testnet' | 'devnet'

  // Current mlestalk-pro app generation. Bump only on a redeploy that
  // invalidates prior tokens. Verifier refuses any token whose signed g
  // does not match this exact string.
  generation:   '1',

  // Ed25519 public keys the keeper is authorized to sign ownership tokens
  // with. Delivered via the SDK release itself as DEFAULT_OWNERSHIP_PUBKEYS
  // — rotations arrive on next `npm install` of zklicensing + `bash
  // scripts/sync-vendor.sh`, no per-app code change needed. To pin a custom
  // list (out-of-band verification, frozen trust set), replace this with a
  // literal string array — the verifier honours whichever list you pass.
  pinnedOwnershipPubKeys: DEFAULT_OWNERSHIP_PUBKEYS,

  // Policy for the null-floor seam in init(): what to do when the persisted
  // iat floor is 0 (genuine first run, cleared storage, or attacker wipe) AND
  // the keeper can't be reached to bootstrap a fresh floor. Two positions:
  //   'grace'  (default): local-verify the stored token bounded by its signed
  //            `e` and PROceed. Cost: cleared-storage + rewound-clock + stashed
  //            token replay can slip through for at most the token's remaining
  //            TTL (bounded to 7d by the keeper, further clamped to grace-end).
  //            Benefit: honest users whose storage got wiped mid-flight-with-
  //            no-signal aren't locked out.
  //   'strict': refuse local acceptance. isPro() stays false until a live
  //            keeper round-trip establishes a floor. Cost: honest user with
  //            cleared storage sees a non-PRO UI until network returns.
  // Once the floor is non-zero (any prior successful verify persisted it),
  // this knob has no effect — the floor itself gates all subsequent verifies.
  // Vendors with high-value seats and low tolerance for the residual replay
  // window should set 'strict'; consumer apps default to 'grace'.
  seatPolicy: 'grace',

  // Cordova mobile flow: opens this hosted page in InAppBrowser. The page
  // runs the proof (needs COOP/COEP + SharedArrayBuffer, which the hosted
  // origin already provides) and navigates to callbackUrlPrefix + query
  // string on completion. The app intercepts that navigation, extracts
  // { token, expiresAt, jti }, and closes the browser.
  hostedUpgradeUrl:   'https://zklicensing.com/apps/mlestalk-pro/upgrade.html',
  callbackUrlPrefix:  'https://zklicensing.com/apps/mlestalk-pro/upgrade-callback',
};

const STORAGE_KEY        = 'mlestalk_pro_license';
// Monotonic issued-at floor. Ratcheted forward to `max(stored, payload.iat)`
// on every successful ownership-token verify (activate / refresh / boot).
// The SDK verifier is passed this value as `opts.iatFloor` and refuses any
// token whose signed `iat` is below it — that closes the "clear localStorage,
// roll the device clock back, present a stashed old token" replay path that
// a wall-clock expiry check alone can't catch. The floor is server-signed
// (`iat` is inside the Ed25519-covered payload), so a client with no live
// network cannot fake it forward.
//
// Residual weakness (documented, not closed): a device that clears its OWN
// localStorage AND rolls the clock back AND presents an old token where the
// server signed a stale iat still requires that stale iat to be ≥ any floor
// the device has ever seen. If the device has never verified anything more
// recent than the stashed token, there is no floor to lose to — a totally
// fresh device with a stashed old token verifies. This is the ceiling of a
// pure-JS offline check; the license itself still expires on-chain and a
// device that ever comes online sees the truth.
const IAT_FLOOR_KEY      = 'mlestalk_pro_iat_floor';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;   // 24 h — 6 days of slack against the 7d TTL

// ---------------------------------------------------------------------------
// Environment probe — o1js's WASM prover needs SharedArrayBuffer, which is
// only available in a cross-origin-isolated context (COOP: same-origin +
// COEP: require-corp). If either is missing, activation cannot run; refresh
// / releaseSeat still work (they only need fetch), and cached PRO state
// remains valid until the next re-activate.
// ---------------------------------------------------------------------------
function detectSupport() {
  if (typeof globalThis.SharedArrayBuffer !== 'function') {
    return { supported: false, reason: 'SharedArrayBuffer is unavailable in this browser.' };
  }
  if (typeof globalThis.crossOriginIsolated !== 'undefined' && globalThis.crossOriginIsolated !== true) {
    return {
      supported: false,
      reason: 'This page is not cross-origin isolated. The host must serve ' +
              'Cross-Origin-Opener-Policy: same-origin and ' +
              'Cross-Origin-Embedder-Policy: require-corp for PRO activation to work.',
    };
  }
  return { supported: true, reason: null };
}

const support = detectSupport();
function isSupported() { return support.supported; }
function supportReason() { return support.reason; }

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
  // Deliberately do NOT clear the iat floor here — clearing it would let an
  // attacker reset the ratchet by triggering a logout, then roll back the
  // clock and present a stashed old token. The floor only ever grows; the
  // worst case for a legitimate user is that a re-activate under a fresh
  // license after the previous floor has ratcheted forward requires the
  // server to have moved iat forward (which happens naturally, since iat
  // is Date.now() at mint time server-side).
  verifiedPayload = null;
}

// Read the persisted iat floor. 0 on first ever verify — no gate applied.
function readIatFloor() {
  try {
    const raw = localStorage.getItem(IAT_FLOOR_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch { return 0; }
}

// Ratchet the persisted iat floor forward to max(existing, iat). Called after
// every successful verify — the effect is that any subsequent token whose
// signed iat is below the highest iat we've ever accepted is refused, even
// if wall-clock is rolled back.
function ratchetIatFloor(iat) {
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return;
  const current = readIatFloor();
  if (iat > current) {
    try { localStorage.setItem(IAT_FLOOR_KEY, String(iat)); } catch {}
  }
}

// In-memory cache of the last cryptographically-verified ownership-token
// payload. Populated by init()/activate()/refresh() after
// verifyOwnershipTokenClient succeeds. `stateIsFresh` refuses to trust
// anything else — reading `state.expiresAt` naked was the old advisory-only
// check that a determined buyer could edit in localStorage.
//
// Reset on clearState() / releaseSeat() / any refresh where the server
// returns a token that fails signature verification. If the page is reloaded
// with a tampered localStorage, init() re-verifies from scratch and clears
// state on mismatch — the attacker gets one page-load's worth of gate lift
// only if they also produce a valid signature, which requires the keeper's
// private key.
let verifiedPayload = null;

// Verify a token against the pinned keys + expected (z, g) + iat floor.
// Returns the signed payload on success, null on any failure. Fails closed
// if no pins are configured — a build that ships an empty
// pinnedOwnershipPubKeys is a bug we want to surface loudly, not paper over.
//
// The SDK verifier does the wall-clock expiry check AND the iat-floor
// check. Passing the persisted floor here is what blocks the "roll clock
// back and present a stashed old-iat token" replay. On success, we ratchet
// the floor to the payload's iat so the ceiling only ever rises.
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
    if (!payload) return null;
    ratchetIatFloor(payload.iat);
    return payload;
  } catch { return null; }
}

// Freshness = signed-and-verified payload + Date.now() below its signed exp.
// The iat-floor gate is applied at verify-time (verifyToken), not here, so a
// plain Date.now() is safe: no unverified state reaches this check, and the
// exp we compare against is the one the SDK verifier already refused to
// accept below the floor. A rewound clock can still make an already-verified
// token look "not expired yet," but the same rewind can no longer smuggle in
// a stashed older token — verifyToken refuses it above.
function stateIsFresh(state, nowMs = Date.now()) {
  if (!state || !state.token) return false;
  if (!verifiedPayload || verifiedPayload.z !== LICENSE_CONFIG.zkAppAddress) return false;
  return nowMs < verifiedPayload.e;
}

// ---------------------------------------------------------------------------
// o1js worker — the compile (~10–20 s) and prove (~few s) steps run in a
// dedicated module worker so the main thread keeps ticking timers and
// repainting the DOM. The worker is created lazily on first use and reused
// for the rest of the session (compile is memoized inside it).
// ---------------------------------------------------------------------------
let workerRef = null;
let msgSeq    = 0;
const pending = new Map();

function getWorker() {
  if (!workerRef) {
    workerRef = new Worker(new URL('./license.worker.js', import.meta.url), { type: 'module' });
    workerRef.addEventListener('message', ({ data }) => {
      const p = pending.get(data?.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data.result);
      else        p.reject(new Error(data.error || 'Worker error.'));
    });
    workerRef.addEventListener('error', (err) => {
      // Worker died — fail everything in-flight and rebuild on next call.
      for (const [, p] of pending) p.reject(new Error(err?.message || 'Worker crashed.'));
      pending.clear();
      try { workerRef.terminate(); } catch {}
      workerRef = null;
    });
  }
  return workerRef;
}

function callWorker(op, args) {
  return new Promise((resolve, reject) => {
    const id = ++msgSeq;
    pending.set(id, { resolve, reject });
    try { getWorker().postMessage({ id, op, args }); }
    catch (err) { pending.delete(id); reject(err); }
  });
}

function ensureCompiled() { return callWorker('compile'); }

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
// unavailability. /respond now requires a live Mina node on the server side
// (the verify service does an on-chain license-membership check per call);
// a momentary node outage returns 502 and shouldn't derail activation.
// Delays are fixed (5 s → 15 s → 60 s) and only apply to 502/503/504.
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

// Assert the verify server is on the same Mina network this build targets.
// /health returns { networkId, network } — we compare against `networkId`
// exactly ("devnet" / "mainnet"), which is stable across provider rotations.
// The `network` URL is kept for the error message only.
//
// Older keepers (pre-networkId) return only `network`; we fall back to the
// legacy URL-substring match so a client build doesn't break on the day the
// keeper rolls out. Remove the fallback after the keeper redeploy has
// stabilized.
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

function buildOwnershipProof(secretHash, licenseHash, nonce) {
  return callWorker('prove', { secretHash, licenseHash, nonce });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Progress emitter. Each phase fires ONE event at start with
//   { stage, message }
// The UI runs a live clock and locks the previous phase's elapsed time
// when the next event arrives. A final { stage: 'done' } closes the last
// phase; on error, the current phase is left "in flight" and the UI stamps
// it with the error message.
function noopEmit() {}

// One challenge/response/store cycle. Emits progress at each network / proving
// hop so the UI can show what's happening (compile is slow, prove is slow).
async function respondAndPersist(secretHash, licenseHash, emit) {
  emit({ stage: 'respond-challenge', message: 'Requesting activation challenge…' });
  const { nonce } = await getChallenge(licenseHash);

  emit({ stage: 'respond-proving', message: 'Building ownership proof…' });
  const proof = await buildOwnershipProof(secretHash, licenseHash, nonce);

  emit({ stage: 'respond-submitting', message: 'Registering on license server…' });
  const respondBody = await fetchJsonWithBackoff(`${baseUrl()}/respond`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ zkAppAddress: LICENSE_CONFIG.zkAppAddress, proof }),
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
    secretHash,
    licenseHash,
    token:            respondBody.token,
    expiresAt:        respondBody.expiresAt,
    licenseExpiresAt: respondBody.licenseExpiresAt ?? null,
    jti:              respondBody.jti,
  };
  saveState(state);
  scheduleRefresh();
  emitChange();

  emit({ stage: 'done', message: 'PRO activated.' });
  return { valid: true, expiresAt: state.expiresAt };
}

async function activate(passphrase, opts = {}) {
  if (!support.supported) throw new Error(support.reason);
  if (!passphrase || passphrase.length < 8) {
    throw new Error('License key must be at least 8 characters.');
  }
  const emit = opts.onProgress || noopEmit;

  emit({ stage: 'network-check', message: `Confirming license server is on ${LICENSE_CONFIG.network}…` });
  await checkNetwork();

  emit({ stage: 'loading', message: 'Loading zero-knowledge engine…' });
  const { secretHash, licenseHash } = await callWorker('derive', { passphrase });

  emit({ stage: 'compiling', message: 'Compiling proof circuit (one-time, ~10–20s)…' });
  await ensureCompiled();

  return respondAndPersist(secretHash, licenseHash, emit);
}

async function refresh() {
  const state = loadState();
  if (!state?.token) { cancelRefresh(); emitChange(); return { valid: false }; }

  try {
    const body = await fetchJson(`${baseUrl()}/refresh`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ token: state.token }),
    });
    const payload = await verifyToken(body.token);
    if (!payload) {
      // Fail closed: a token we can't verify is worse than no token — the
      // former can convince a naive local check that PRO is active.
      clearState();
      cancelRefresh();
      emitChange();
      return { valid: false, reason: 'Refreshed token failed signature verification.' };
    }
    verifiedPayload = payload;
    const next = {
      ...state,
      token:            body.token,
      expiresAt:        body.expiresAt,
      // /refresh returns null on transient RPC failure or a no-longer-valid
      // license — in either case, keep the previously cached value rather
      // than blanking the UI.
      licenseExpiresAt: body.licenseExpiresAt ?? state.licenseExpiresAt ?? null,
    };
    saveState(next);
    emitChange();
    return { valid: true, expiresAt: next.expiresAt };
  } catch (err) {
    if (err.status === 401) {
      // Seat released or token invalidated — drop local state and stop
      // pinging the server with a token that will never be accepted again.
      clearState();
      cancelRefresh();
      emitChange();
    }
    return { valid: false, reason: err.message };
  }
}

function emitChange() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('license:change', { detail: { isPro: isPro() } }));
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

// Cordova path: pop out to a hosted upgrade page that provides COOP/COEP
// (which the app itself can't from file://). The popup runs the proof and
// navigates to callbackUrlPrefix?token=…&expiresAt=…&jti=… on success, or
// callbackUrlPrefix?error=… on failure/cancel. We intercept via the
// InAppBrowser `loadstart` event before the WebView actually loads the URL.
async function activateViaBrowser(opts = {}) {
  const url    = LICENSE_CONFIG.hostedUpgradeUrl;
  const prefix = LICENSE_CONFIG.callbackUrlPrefix;
  if (!url || !prefix) throw new Error('hostedUpgradeUrl / callbackUrlPrefix not configured.');

  const iab = globalThis.cordova?.InAppBrowser
           ?? (typeof window !== 'undefined' ? window.cordova?.InAppBrowser : null);
  if (!iab) throw new Error('cordova-plugin-inappbrowser is not installed.');

  const emit = opts.onProgress || noopEmit;
  emit({ stage: 'browser-open', message: 'Opening upgrade window…' });

  return new Promise((resolve, reject) => {
    const ref = iab.open(url, '_blank', 'location=no,hidden=no,clearcache=yes,clearsessioncache=yes');
    let settled = false;
    const finish = (fn) => { if (settled) return; settled = true; try { ref.close(); } catch {} fn(); };

    ref.addEventListener('loadstart', (ev) => {
      const target = String(ev?.url || '');
      if (!target.startsWith(prefix)) return;
      let params;
      try { params = new URL(target).searchParams; }
      catch { return finish(() => reject(new Error('Malformed callback URL.'))); }

      const err = params.get('error');
      if (err) return finish(() => reject(new Error(err)));

      const token            = params.get('token');
      const expiresAt        = Number(params.get('expiresAt'));
      const licenseExpiresAt = params.get('licenseExpiresAt') || null;
      const jti              = params.get('jti') || null;
      if (!token || !Number.isFinite(expiresAt)) {
        return finish(() => reject(new Error('Callback missing token or expiresAt.')));
      }

      finish(async () => {
        const payload = await verifyToken(token);
        if (!payload) {
          reject(new Error(
            'License server returned a token that failed signature verification. ' +
            'PRO not activated.'
          ));
          return;
        }
        verifiedPayload = payload;
        saveState({ token, expiresAt, licenseExpiresAt, jti });
        scheduleRefresh();
        emitChange();
        emit({ stage: 'done', message: 'PRO activated.' });
        resolve({ valid: true, expiresAt });
      });
    });

    ref.addEventListener('exit', () => {
      if (!settled) { settled = true; reject(new Error('Upgrade window closed before activation completed.')); }
    });
  });
}

function isPro() {
  return stateIsFresh(loadState());
}

function getExpiresAt() {
  return loadState()?.expiresAt ?? null;
}

// On-chain license expiry (ISO string) as reported by the verifier at the
// last /respond or /refresh. Distinct from getExpiresAt(), which returns the
// rolling session-token TTL. Null when the verifier hasn't yet returned a
// value (very old cached state, or a transient failure at /respond time).
function getLicenseExpiresAt() {
  return loadState()?.licenseExpiresAt ?? null;
}

// ---------------------------------------------------------------------------
// Background refresh — silent, no user prompt.
// ---------------------------------------------------------------------------
let refreshTimer = null;

function scheduleRefresh() {
  cancelRefresh();
  refreshTimer = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
}

function cancelRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// Re-refresh whenever the app returns to the foreground. Covers:
//   - browser tabs that were backgrounded for hours
//   - Cordova apps resuming from OS suspend (document 'resume' event)
//   - closed-then-reopened tabs (init handles that path separately)
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
  if (!support.supported) {
    console.warn('MlesTalk PRO: activation disabled —', support.reason);
    // Cached PRO state stays valid until token expiry — refresh still works
    // without SharedArrayBuffer since it only needs fetch.
  }
  if (!foregroundResyncInstalled) {
    installForegroundResync();
    foregroundResyncInstalled = true;
  }
  const state = loadState();
  if (!state?.token) return;

  // Null-floor seam. iatFloor == 0 means one of: (a) genuine first run, (b)
  // storage cleared (browser wipe, incognito, new device), (c) attacker
  // deliberately cleared it to erase the ratchet. From here, (a)/(b)/(c)
  // are indistinguishable — so the safe move is to make the keeper decide.
  // A stashed old-iat token replayed against a rewound clock would pass
  // local checks (no floor to gate iat), so before trusting a stored token
  // in this state, force a /refresh round-trip: the keeper's honest clock
  // 401s an actually-expired token; a live token gets reissued with a
  // fresh iat, ratcheting the floor for the rest of the session. If the
  // network is unreachable the offline branch is where seatPolicy applies.
  if (readIatFloor() === 0) {
    const outcome = await refresh();
    if (outcome?.valid) {
      scheduleRefresh();
      return;
    }
    // refresh() clears state itself on 401 (revoked / expired at keeper).
    // Detect that vs. a transient failure by whether state still exists.
    const stillHave = loadState()?.token;
    if (!stillHave) {
      emitChange();
      return;
    }
    // Transient failure (network down, 5xx). Policy decides.
    if ((LICENSE_CONFIG.seatPolicy || 'grace') !== 'grace') {
      // strict: refuse local acceptance. Falls to isPro() === false until a
      // future refresh succeeds and establishes a floor.
      emitChange();
      return;
    }
    // grace: local-verify the stored token with floor=0. Accepts any token
    // whose signature and signed `e` are still good — bounded by the token's
    // TTL (keeper caps at 7d, further clamped to grace-end). Ratchets the
    // floor on success so subsequent
    // verifies gain the normal replay defense as soon as we get one honest
    // verify through. The scheduleRefresh loop keeps probing the keeper.
    const payload = await verifyToken(stillHave);
    if (!payload) {
      clearState();
      emitChange();
      return;
    }
    verifiedPayload = payload;
    emitChange();
    scheduleRefresh();
    return;
  }

  // Non-null-floor path: the floor is already ratcheted from a prior successful
  // verify, so local acceptance is bounded by that floor and by the token's
  // signed `e`. Verify locally first for a fast UI update, then refresh in
  // the background to surface revoked seats.
  const payload = await verifyToken(state.token);
  if (!payload) {
    clearState();
    emitChange();
    return;
  }
  verifiedPayload = payload;
  emitChange();

  await refresh();
  if (isPro()) scheduleRefresh();
}

// ---------------------------------------------------------------------------
// Expose to the rest of the app (which is not module-based).
// ---------------------------------------------------------------------------
function isBrowserFlowAvailable() {
  const iab = globalThis.cordova?.InAppBrowser
           ?? (typeof window !== 'undefined' ? window.cordova?.InAppBrowser : null);
  return !!(iab && LICENSE_CONFIG.hostedUpgradeUrl && LICENSE_CONFIG.callbackUrlPrefix);
}

const License = {
  init,
  activate,
  activateViaBrowser,
  isBrowserFlowAvailable,
  refresh,
  releaseSeat,
  isPro,
  getExpiresAt,
  getLicenseExpiresAt,
  isSupported,
  supportReason,
  config: LICENSE_CONFIG,
};

if (typeof window !== 'undefined') {
  window.License = License;
  window.dispatchEvent(new CustomEvent('license:ready'));
}

export default License;
