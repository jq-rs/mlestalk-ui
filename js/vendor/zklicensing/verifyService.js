#!/usr/bin/env node
// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * verifyService.ts
 *
 * Lightweight, standalone license verification service.
 *
 * Exposes the same state endpoints as the keeper but contains NO ZK prover —
 * no circuit compilation, no o1js native backend. Starts in ~2 seconds and
 * runs on any small VPS or container.
 *
 * No write endpoints — chain events are the source of truth. License state
 * is rebuilt from the archive node in three ways:
 *   - auto-bootstrap on startup when licenses.json is empty,
 *   - lazy bootstrap inside GET / when the computed Merkle root
 *     disagrees with the on-chain root for the requested app (the canonical
 *     "we're stale" signal). One replay + one retry is enough — root is
 *     consensus. This catches licenses issued, renewed, or refunded after
 *     boot on the very next verify call, with zero work done when no one is
 *     asking. Concurrent verifies for the same app share one in-flight
 *     bootstrap so a popular license under load does not stampede the
 *     archive node.
 *   - POST /bootstrap (admin) for ad-hoc reasons: a newly registered zkApp
 *     (verify won't trigger a sync for an app no client knows about yet), a
 *     corrupted licenses.json, or repopulating the offline /license/...
 *     debug endpoint without first hitting /verify.
 *
 * Deployment modes
 * ----------------
 * 1. Same-machine as the keeper
 *    - Run from the keeper's working directory so apps.json and licenses.json
 *      are shared transparently. Optionally set LICENSE_STORE_PATH to point at
 *      a shared file.
 *
 * 2. Separate machine (replica)
 *    - Copy the keeper's apps.json into the verifyService working directory.
 *      apps.json tells the service which zkApp addresses to replay events for.
 *    - Start the service. On boot it auto-bootstraps every app in apps.json
 *      from the archive node. MINA_ARCHIVE_URL defaults to the Minascan public
 *      archive matching MINA_NETWORK_ID:
 *        mainnet → https://api.minascan.io/archive/mainnet/v1/graphql
 *        else    → https://api.minascan.io/archive/devnet/v1/graphql
 *      Override by setting MINA_ARCHIVE_URL in the environment.
 *    - To register a NEW app on the replica afterwards:
 *        a) Re-copy apps.json from the keeper (it owns the registry), then
 *        b) POST /bootstrap with the new zkAppAddress to ingest its events.
 *    - Re-copying apps.json on a cron (or pulling it via GET /apps from the
 *      keeper) is the recommended way to keep the registry in sync.
 *
 * Usage:
 *   node build/src/verifyService.js
 *
 * Configuration is read from environment variables (see README §Configuration).
 * Required: MINA_GRAPHQL_URL, PLATFORM_ADDRESS.
 * Optional: MINA_NETWORK_ID (default testnet), MINA_ARCHIVE_URL (defaults by
 * network), VERIFY_PORT (default 8081), VERIFY_ADMIN_TOKEN.
 *
 * Endpoints:
 *   GET  /health
 *   GET  /?licenseHash=...&zkAppAddress=...        ← primary endpoint for apps
 *   GET  /challenge?licenseHash=...                 ← ownership nonce
 *   POST /respond                                   ← ownership proof + token
 *   POST /refresh                                   ← extend token TTL (no re-prove)
 *   POST /releaseSeat                                ← release this device's seat
 *   POST /resetSessions                            ← drop all sessions (re-prove)
 *   GET  /root?zkApp=...
 *   GET  /witness/:zkAppAddress/:licenseHash
 *   GET  /license/:zkAppAddress/:licenseHash
 *   GET  /apps
 *   POST /bootstrap                                 ← replay events from archive
 */
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import express from 'express';
import { Field, Mina, fetchLastBlock, fetchAccount, PublicKey, setBackend, } from '../o1js/index.js';
import { buildMap, getLicense, licenseStatus, readRecords, serializeWitness, } from './licenseStore.js';
import { findAppByAnyAddress } from './appsLookup.js';
import { verifyLicenseWithAncestors } from './verifyWithAncestors.js';
import { bootstrapFromArchive, applyEventsToStore } from './archiveBootstrap.js';
import { verifyChallenge, decodeBase64 } from './ownershipSignature.js';
import { licenseHashFromPubkey } from './ownershipLicenseHash.js';
import { CANONICAL_VK_HASHES, SUPPORTED_LICENSING_APP_VERSIONS, fetchLicensingAppVersion, GRACE_PERIOD_N, MS_PER_SLOT_N, } from './contractInterface.js';
import { createChallengeStore, createSessionStore, createRateLimitStore, mintOwnershipToken, signOwnershipToken, verifyOwnershipToken, peekOwnershipTokenPayload, loadOrCreateOwnershipKey, OWNERSHIP_TOKEN_TTL_MS, } from './ownership.js';
import { randomSeatName } from './seatName.js';
setBackend('native');
// Keeper on-disk state directory. Historically held the LicenseProof VK
// cache; today it only holds the ownership Ed25519 keypair. Path kept
// identical to preserve existing operator installs.
const KEEPER_STATE_DIR = join(homedir(), '.cache', 'zklic-verifier');
mkdirSync(KEEPER_STATE_DIR, { recursive: true });
// ------------------------------------------------------------
// CONFIG (env vars) & NETWORK
// ------------------------------------------------------------
function requireEnv(name, hint) {
    const v = process.env[name];
    if (!v) {
        console.error(`❌ ${name} env var is required. ${hint}`);
        process.exit(1);
    }
    return v;
}
const MINA_NETWORK_ID = process.env.MINA_NETWORK_ID ?? 'devnet';
const MINA_GRAPHQL_URL = requireEnv('MINA_GRAPHQL_URL', 'e.g. https://api.minascan.io/node/devnet/v1/graphql');
const PORT = parseInt(process.env.VERIFY_PORT ?? '8081', 10);
function defaultArchiveUrl(networkId) {
    switch (networkId) {
        case 'mainnet':
            return 'https://api.minascan.io/archive/mainnet/v1/graphql';
        case 'devnet':
            return 'https://api.minascan.io/archive/devnet/v1/graphql';
        default:
            return null;
    }
}
const archiveUrl = process.env.MINA_ARCHIVE_URL ?? defaultArchiveUrl(MINA_NETWORK_ID);
if (!archiveUrl) {
    console.error(`❌ No archive URL for MINA_NETWORK_ID="${MINA_NETWORK_ID}" and no built-in default for this network.\n` +
        `   Set MINA_ARCHIVE_URL to the archive node GraphQL endpoint.`);
    process.exit(1);
}
console.log(`🔗 Mina node:    ${MINA_GRAPHQL_URL}`);
console.log(`📚 Archive node: ${archiveUrl}${process.env.MINA_ARCHIVE_URL ? ' (from MINA_ARCHIVE_URL)' : ' (default — set MINA_ARCHIVE_URL to override)'}`);
Mina.setActiveInstance(Mina.Network({
    networkId: MINA_NETWORK_ID,
    mina: MINA_GRAPHQL_URL,
    archive: archiveUrl,
}));
async function verifyOwnershipSignature(zkAppAddress, body) {
    const { licenseHash, pubKey, nonce, signature } = body;
    if (typeof licenseHash !== 'string' || licenseHash.length === 0 ||
        typeof pubKey !== 'string' || pubKey.length === 0 ||
        typeof nonce !== 'string' || nonce.length === 0 ||
        typeof signature !== 'string' || signature.length === 0) {
        return { ok: false, status: 400, error: 'Missing or invalid licenseHash / pubKey / nonce / signature' };
    }
    let pubKeyRaw;
    let sigRaw;
    try {
        pubKeyRaw = decodeBase64(pubKey);
        sigRaw = decodeBase64(signature);
    }
    catch {
        return { ok: false, status: 400, error: 'pubKey / signature must be base64' };
    }
    if (pubKeyRaw.length !== 32) {
        return { ok: false, status: 400, error: 'pubKey must decode to 32 bytes (Ed25519 raw)' };
    }
    if (sigRaw.length !== 64) {
        return { ok: false, status: 400, error: 'signature must decode to 64 bytes (Ed25519 raw)' };
    }
    // Field-side binding — proves the pubkey hashes to the same licenseHash
    // the buyer committed to at /prove/buy. Runs BEFORE the signature check
    // because a mismatched pubkey means the signature would be worthless
    // even if valid: it wouldn't be over the correct license.
    let derived;
    try {
        derived = licenseHashFromPubkey(pubKeyRaw);
    }
    catch (err) {
        return { ok: false, status: 400, error: `licenseHash derivation failed: ${err?.message || String(err)}` };
    }
    if (derived !== licenseHash) {
        return { ok: false, status: 403, error: 'pubKey does not bind to licenseHash — wrong passphrase or wrong license' };
    }
    const sigValid = await verifyChallenge(pubKeyRaw, { licenseHash, nonce, zkAppAddress }, sigRaw);
    if (!sigValid) {
        return { ok: false, status: 400, error: 'Ownership signature is invalid' };
    }
    return { ok: true, licenseHash, nonce };
}
// ------------------------------------------------------------
// OWNERSHIP — challenge + activation token (helpers live in ownership.ts)
// ------------------------------------------------------------
const ownershipChallenges = createChallengeStore();
setInterval(() => { /* opportunistic GC */ ownershipChallenges.size(); }, 30_000).unref();
// Per-license active-device session store. Backs the concurrent-device cap
// (AppRecord.maxConcurrentDevices), /releaseSeat, and /resetSessions. In-memory
// by design — a keeper restart drops every session, forcing devices to
// re-prove ownership. That is a security feature: persisted sessions would
// let a stolen token bypass concurrency caps across restarts.
const ownershipSessions = createSessionStore();
setInterval(() => { /* opportunistic GC — activeCount touches prune */ ownershipSessions.size(); }, 30_000).unref();
// Per-license rolling 24h rate limits on the two abuse-prone endpoints
// (/releaseSeat, /resetSessions). Both are legitimate operations the
// license owner might invoke, but at bounded frequency.
//
// The daily limit is exactly `maxConcurrentDevices` — one call per seat per
// day. A 3-device app gets 3/day; a 10-device app gets 10/day. Matches the
// intuition: a license that can only run on N devices should not need to
// reset or release faster than one full device-cycle per seat per day.
//
// Cap=0 (unlimited) apps never reach these endpoints — /respond refuses
// to mint for cap=0 (see the precheck in that handler), so no token can
// exist and neither /releaseSeat nor /resetSessions has anything to
// authenticate against. The cap>0 invariant is upheld at the mint boundary.
//
// In-memory, restart-drops-counts by design — same semantics as the
// session store. Fail-open on restart is fine here: the cap protects
// against sustained abuse, not against a single burst timed to a reboot.
const releaseSeatRateLimit = createRateLimitStore();
const resetSessionsRateLimit = createRateLimitStore();
// Match against the app's current live zkAppAddress OR any entry in its
// deploymentHistory[]. Callers pass whatever address the client pinned
// (which for older buyers is the original gen-1 address, not the current
// live one after a bump) — matching by-any keeps cap/seat lookups stable
// across generation bumps.
async function loadAppByAddress(zkAppAddress) {
    const apps = await readApps();
    return findAppByAnyAddress(apps, zkAppAddress) ?? null;
}
// Resolve which generation a zkAppAddress claims to belong to by walking the
// keeper's AppRecord.deploymentHistory[]. The top-level address is the current
// generation (history.length + 1); older addresses live in history at
// increasing index. Returns null when the address is not present in any
// app's history — which is exactly what stops a "genuine v1 circuit
// redeployed at a fresh address" impersonation: unlisted address → no
// generation → verify rejects. See CANONICAL_VK_HASHES in contractInterface.ts.
async function resolveGenerationByAddress(zkAppAddress) {
    const apps = await readApps();
    for (const a of apps) {
        const historyLen = a.deploymentHistory?.length ?? 0;
        if (a.zkAppAddress === zkAppAddress)
            return historyLen + 1;
        if (a.deploymentHistory) {
            for (let i = 0; i < a.deploymentHistory.length; i++) {
                if (a.deploymentHistory[i].zkAppAddress === zkAppAddress)
                    return i + 1;
            }
        }
    }
    return null;
}
// Ownership-token signing key.
//
// Ed25519 (asymmetric), so vendor apps can verify tokens OFFLINE against a
// pinned public key — the keeper mints, everyone else verifies. Separate from
// PLATFORM_MANIFEST_KEY_FILE by design: a leaked seat signer can mint seats,
// it must NOT also be able to forge signed generation lists (key separation).
// Bootstrap-on-first-run: a fresh host generates a fresh keypair and prints
// the public key so the operator can pin it into the vendor SDK build.
const OWNERSHIP_KEY_PATH = process.env.OWNERSHIP_KEY_PATH ?? join(KEEPER_STATE_DIR, 'ownership-ed25519.key');
const { privateKey: ownershipPrivateKey, publicKeyBase64: ownershipPublicKeyBase64, created: ownershipKeyCreated } = await loadOrCreateOwnershipKey(OWNERSHIP_KEY_PATH);
if (ownershipKeyCreated) {
    console.log(`🔑 Ownership Ed25519 keypair generated → ${OWNERSHIP_KEY_PATH}`);
    console.log(`   Pin this public key into vendor SDK builds:`);
    console.log(`   ${ownershipPublicKeyBase64}`);
}
else {
    console.log(`🔑 Ownership Ed25519 keypair loaded from ${OWNERSHIP_KEY_PATH}`);
    console.log(`   Public key: ${ownershipPublicKeyBase64}`);
}
// Type-tag the private key so downstream signOwnershipToken calls line up.
const _ownershipPrivateKey = ownershipPrivateKey;
// Helper: verify a token when the caller has NO independent expectation of
// which app it targets (/refresh, /releaseSeat carry only the token — no
// zkAppAddress in the request context).
//
// Note the honest limitation: the `expected` we hand to verifyOwnershipToken
// is derived from the token itself (peeked z) plus a registry lookup keyed
// by that same peeked z. So the z-match check is self-consistent, not
// cross-app-authoritative. What this DOES enforce:
//   - signature is valid (only the keeper could have minted it)
//   - z is listed in the app registry (rejects tokens for retired-and-purged apps)
//   - g matches the address's registry-recorded generation (belt-and-suspenders;
//     the two always agree by construction, but a mismatch would be a loud
//     tripwire for registry corruption)
//   - token not past its `e`
//
// It does NOT catch "token minted for app A being replayed against app B."
// That defense lives at the vendor UI, which has an EXTERNAL expected z
// (its own pinned deployment address) — see GET / which takes zkAppAddress
// from the query. This asymmetry is deliberate: keeper-internal ops that
// touch (licenseHash, jti) session state don't produce cross-app harm
// because sessions are keyed by licenseHash anyway.
async function verifyKeeperInternal(token) {
    const peeked = peekOwnershipTokenPayload(token);
    if (!peeked)
        return null;
    const gen = await resolveGenerationByAddress(peeked.z);
    if (gen === null)
        return null;
    return verifyOwnershipToken([ownershipPublicKeyBase64], token, { z: peeked.z, g: String(gen) });
}
// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
async function currentSlot() {
    try {
        const block = await fetchLastBlock();
        return Number(block.globalSlotSinceGenesis.toString());
    }
    catch {
        return 0;
    }
}
// Return an error message if `zkAppAddress` isn't a well-formed B62q address,
// null otherwise. Called at request-parse time so garbage input fails with a
// legible 400 in a couple of ms instead of ~1 s of proof-verify CPU followed
// by a generic 502 from `fromBase58` throwing deep inside checkOnChainLicense.
function validateZkAppAddress(zkAppAddress) {
    try {
        PublicKey.fromBase58(zkAppAddress);
        return null;
    }
    catch (err) {
        return `Invalid zkAppAddress: ${err?.message || 'not a valid Mina B62q address'}`;
    }
}
// One-shot internal retry for a single network call. Absorbs a lone transient
// blip from the Mina GraphQL node — the empirically common failure mode is a
// solitary 502 followed by immediate recovery, not a sustained outage. Two
// attempts with a 500 ms gap add ~500 ms to the tail latency in the retry
// case and zero to the good case. If both attempts fail, the error propagates
// so the outer /respond handler returns 502 and the client-side backoff
// (5 / 15 / 60 s) takes over.
async function fetchWithOneRetry(fn, delayMs = 500) {
    try {
        return await fn();
    }
    catch {
        await new Promise(r => setTimeout(r, delayMs));
        return fn();
    }
}
// Fetch fresh on-chain state and delegate address routing + ancestor walk
// to verifyLicenseWithAncestors. Throws only on network / RPC failure;
// every other outcome (address unknown, VK mismatch, license missing /
// expired) surfaces as a `kind` on the returned verdict.
//
// The `generation` field echoes the *request* address's own stable
// generation, so a client that pinned an older address at build time sees
// a token whose `g` still matches its local expectation across bumps.
async function checkOnChainLicense(zkAppAddress, licenseHash) {
    const apps = await readApps();
    const appRecord = findAppByAnyAddress(apps, zkAppAddress);
    if (!appRecord)
        return { kind: 'unregistered-address' };
    const historyLen = appRecord.deploymentHistory?.length ?? 0;
    const currentGeneration = historyLen + 1;
    const currentLive = appRecord.zkAppAddress;
    // Echo: the request address's own stable generation. Stays consistent
    // across bumps for any client that pinned an older address.
    let requestGeneration = currentGeneration;
    if (zkAppAddress !== currentLive) {
        const idx = (appRecord.deploymentHistory ?? []).findIndex((d) => d.zkAppAddress === zkAppAddress);
        if (idx >= 0)
            requestGeneration = idx + 1;
    }
    const [records, { account }, lastBlock] = await Promise.all([
        readRecords(),
        fetchWithOneRetry(() => fetchAccount({ publicKey: PublicKey.fromBase58(currentLive) })),
        fetchWithOneRetry(() => fetchLastBlock()),
    ]);
    const currentRoot = account?.zkapp?.appState?.[0]?.toString();
    if (!currentRoot)
        return { kind: 'zkapp-not-found' };
    const zkAppVersion = Number(account?.zkapp?.appState?.[7]?.toString() ?? '0');
    const onChainVk = account?.zkapp?.verificationKey?.hash?.toString();
    const expectedVk = CANONICAL_VK_HASHES[currentGeneration];
    if (expectedVk && onChainVk !== expectedVk)
        return { kind: 'vk-mismatch', generation: currentGeneration };
    const currentSlotNum = Number(lastBlock.globalSlotSinceGenesis.toString());
    const walked = await verifyLicenseWithAncestors({
        appRecord,
        licenseHash,
        currentSlot: currentSlotNum,
        currentLiveRoot: currentRoot,
        records,
    });
    return {
        kind: 'checked',
        onChainRoot: walked.onChainRoot,
        currentSlot: currentSlotNum,
        zkAppVersion,
        generation: requestGeneration,
        resolvedAddress: walked.resolvedAddress,
        liveRecords: walked.liveRecords,
        result: walked.result,
    };
}
const APPS_FILE = 'apps.json';
async function readApps() {
    try {
        return JSON.parse(await fs.readFile(APPS_FILE, 'utf8'));
    }
    catch {
        return [];
    }
}
// ------------------------------------------------------------
// EXPRESS SERVER
// ------------------------------------------------------------
const app = express();
app.use(express.json());
app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (_req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});
const VERIFY_ADMIN_TOKEN = process.env.VERIFY_ADMIN_TOKEN ?? '';
function requireAdmin(req, res, next) {
    if (!VERIFY_ADMIN_TOKEN) {
        res.status(503).json({ error: 'Admin endpoint disabled (VERIFY_ADMIN_TOKEN env var not set)' });
        return;
    }
    const auth = req.headers.authorization ?? '';
    const match = auth.match(/^Bearer\s+(.+)$/);
    if (!match || match[1] !== VERIFY_ADMIN_TOKEN) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
}
// Health.
//
// `networkId` is the authoritative "which Mina chain am I on" answer — a stable
// identifier the client can compare against exactly ("devnet" / "mainnet").
// `network` (the raw GraphQL URL) is kept for operator-facing observability
// only, since it can rotate providers (Minascan ↔ Minataur ↔ self-hosted)
// without the chain changing.
//
// `ownershipPublicKeyBase64` is a CONVENIENCE for bootstrap and rotation
// discovery, NOT a trust root. Vendor SDKs must pin their own list of
// accepted public keys at build time and treat any endpoint-fetched value
// as "does this match one of my pinned keys?" — never "trust whatever the
// server returned." A compromised keeper endpoint that swapped this field
// could otherwise fool a naive verifier.
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'verify',
        networkId: MINA_NETWORK_ID,
        network: MINA_GRAPHQL_URL,
        ownershipPublicKeyBase64,
    });
});
// Current MerkleMap root for a specific zkApp.
app.get('/root', async (req, res) => {
    const zkAppAddress = req.query.zkApp ?? '';
    if (!zkAppAddress) {
        return res.status(400).json({ error: 'Missing zkApp query param' });
    }
    const records = await readRecords();
    const map = buildMap(records, zkAppAddress);
    res.json({ root: map.getRoot().toString() });
});
// GET /challenge?licenseHash=...
// Issues a nonce for the ownership challenge-response flow.
app.get('/challenge', (req, res) => {
    const licenseHash = String(req.query.licenseHash ?? '');
    if (!licenseHash) {
        return res.status(400).json({ error: 'Missing licenseHash' });
    }
    res.json(ownershipChallenges.issue(licenseHash));
});
// POST /respond — body: { zkAppAddress, licenseHash, pubKey, nonce, signature, name? }
// Verifies the Ed25519 ownership signature against the issued nonce, consumes
// the nonce, enforces the vendor's concurrent-device cap (if any), and returns
// { ownership: 'verified', token, expiresAt, jti, activeSessions, deviceLimit }
// on success. On cap overflow returns 429 without minting a token — clients
// must release a seat (POST /releaseSeat), reset all sessions (POST
// /resetSessions), or wait for the oldest to hit TTL.
app.post('/respond', async (req, res) => {
    const body = req.body;
    const { zkAppAddress, name: rawName } = body;
    if (!zkAppAddress) {
        return res.status(400).json({ error: 'Missing zkAppAddress' });
    }
    const addrErr = validateZkAppAddress(zkAppAddress);
    if (addrErr)
        return res.status(400).json({ error: addrErr });
    // Client-supplied device name is cosmetic — sanitize (strip control chars,
    // cap at 32 chars) and fall back to a random Adjective+Animal if absent or
    // empty. The name is echoed back to the client and shown in the device
    // list (GET /seats); the verifier never gates on it.
    const sanitizedName = (() => {
        if (typeof rawName !== 'string')
            return randomSeatName();
        // eslint-disable-next-line no-control-regex
        const trimmed = rawName.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 32);
        return trimmed.length > 0 ? trimmed : randomSeatName();
    })();
    // Refuse cap=0 (unlimited) apps at the API boundary. Unlimited apps are
    // architecturally tokenless — clients call GET /verify directly and gate
    // on the on-chain license status. Minting tokens here would only carry
    // downstream state (session-store rows, /refresh, /releaseSeat cadence)
    // for no cap-enforcement benefit. Refused early (before the signature
    // check and on-chain lookup) so a misconfigured client fails fast with
    // a clear hint instead of burning cycles and hitting the archive.
    const app_record_precheck = await loadAppByAddress(zkAppAddress);
    const cap_precheck = Math.max(0, Math.floor(app_record_precheck?.maxConcurrentDevices ?? 0));
    if (cap_precheck === 0) {
        return res.status(400).json({
            error: 'This app has maxConcurrentDevices=0 (unlimited) — no token flow is available.',
            hint: 'Call GET /verify?licenseHash=…&zkAppAddress=… directly. On-chain license status alone gates access for unlimited apps.',
        });
    }
    const ownership = await verifyOwnershipSignature(zkAppAddress, body);
    if (!ownership.ok)
        return res.status(ownership.status).json({ error: ownership.error });
    const { licenseHash, nonce } = ownership;
    // On-chain license-membership check. The ownership signature alone only
    // demonstrates knowledge of a keypair whose pubkey hashes to `licenseHash`
    // — trivially satisfiable by generating a keypair and then declaring
    // "my licenseHash is Poseidon(this pubkey)." To gate a real purchase,
    // require that licenseHash actually exists in this zkApp's on-chain
    // MerkleMap, and that the zkApp itself is registered with a matching
    // canonical VK.
    //
    // Runs BEFORE the nonce is consumed. A 502 from a transient Mina-node
    // failure must not burn the nonce — the client-side retry-with-backoff
    // resubmits the same proof (same nonce) and needs it to still be alive.
    let onChain;
    try {
        onChain = await checkOnChainLicense(zkAppAddress, licenseHash);
    }
    catch (err) {
        return res.status(502).json({ error: `On-chain license lookup failed: ${err?.message || String(err)}` });
    }
    switch (onChain.kind) {
        case 'zkapp-not-found':
            return res.status(404).json({ error: 'zkApp not found on chain' });
        case 'unregistered-address':
            return res.status(403).json({ error: 'zkAppAddress is not in any registered app deployment history' });
        case 'vk-mismatch':
            return res.status(403).json({ error: `zkApp VK does not match generation ${onChain.generation}'s canonical circuit` });
        case 'checked':
            if (!onChain.result.valid) {
                return res.status(403).json({ error: `License not valid: ${onChain.result.reason}` });
            }
            break;
    }
    const nonceState = ownershipChallenges.consume(licenseHash, nonce);
    if (nonceState !== 'ok') {
        return res.status(400).json({ error: `Nonce ${nonceState} — request a fresh /challenge` });
    }
    // Concurrent-device cap enforcement. Reuse the app record we loaded up
    // front for the cap=0 precheck — the value can't have changed within a
    // request. Try to reserve a session slot BEFORE minting: a token without
    // a matching session-store entry is dead on arrival at GET / anyway, so
    // refusing here avoids handing the caller a bearer they can only use to
    // be rejected.
    const cap = cap_precheck;
    // Cap the token's `e` so it never outlives the on-chain license's grace
    // period. The client's local `stateIsFresh` check (`nowMs < state.expiresAt`)
    // then enforces grace-end offline for free — no separate license-expiry
    // check needed on the client, and a phone that never talks to us again
    // still transitions out of PRO exactly when grace ends.
    const rawExp = Date.now() + OWNERSHIP_TOKEN_TTL_MS;
    const graceEndMs = onChain.result.expirySlot > 0 && onChain.result.expiresAt
        ? Date.parse(onChain.result.expiresAt) + GRACE_PERIOD_N * MS_PER_SLOT_N
        : rawExp;
    const exp = Math.min(rawExp, graceEndMs);
    // Mint FIRST so jti is generated inside the helper (single source of truth
    // for "mint always sets jti"). Reserve the seat under that jti; on cap
    // overflow we auto-evict the least-recently-refreshed seat and retry once
    // — the just-proven caller wins the slot because they demonstrated
    // knowledge of the passphrase, which the evicted device does not need to
    // re-do (it will just fail its next /refresh and drop into a re-activation
    // flow). The minted token from a failed insert is thrown away; the retry
    // uses the same jti but the client never saw the failed token.
    const { token, jti } = mintOwnershipToken(_ownershipPrivateKey, {
        z: zkAppAddress,
        g: String(onChain.generation),
        l: licenseHash,
        e: exp,
        n: sanitizedName,
    });
    let reserved = ownershipSessions.insert(licenseHash, jti, exp, cap, sanitizedName);
    let evicted = null;
    if (reserved.state === 'at-cap') {
        evicted = ownershipSessions.evictLRR(licenseHash);
        if (evicted) {
            // eslint-disable-next-line no-console
            console.log(`[respond] LRR eviction: license=${licenseHash} evicted-jti=${evicted.jti} evicted-name="${evicted.name}" evicted-lastRefreshAt=${new Date(evicted.lastRefreshAt).toISOString()} new-name="${sanitizedName}"`);
            reserved = ownershipSessions.insert(licenseHash, jti, exp, cap, sanitizedName);
        }
    }
    if (reserved.state === 'at-cap') {
        // Shouldn't happen after a successful eviction, but guard against the
        // race where a concurrent /respond filled the slot between evict and
        // retry. Surface the classic cap error so the client falls back to the
        // manual release / reset flow.
        return res.status(429).json({
            error: 'Concurrent-device limit reached — release a seat, run POST /resetSessions, or wait for the oldest session to expire',
            activeSessions: reserved.active,
            deviceLimit: cap,
        });
    }
    res.json({
        ownership: 'verified',
        token,
        expiresAt: exp,
        // On-chain license expiry (ISO string). Distinct from `expiresAt` above,
        // which is the session-token TTL bumped every /refresh. Clients that want
        // to show the buyer "your license expires on <date>" (or fire a renewal
        // nudge as the on-chain expiry approaches) should read this — otherwise
        // they end up displaying the rolling 7-day token TTL.
        licenseExpiresAt: onChain.result.expiresAt,
        jti,
        name: sanitizedName,
        activeSessions: reserved.active,
        deviceLimit: cap,
        // Populated when the cap-overflow path forced us to boot an existing
        // seat. Clients surface this ("Replaced 'Silent Otter' — last active
        // 3 days ago") so the buyer understands why an old device just stopped
        // working. Absent on the common no-eviction path.
        ...(evicted ? { evicted: { jti: evicted.jti, name: evicted.name, lastRefreshAt: evicted.lastRefreshAt } } : {}),
    });
});
// POST /releaseSeat — two authorization modes:
//
//   Self-release:   body { token }
//     Releases the caller's own seat. Possession of a valid token is enough
//     (same threat model as any bearer token) — the caller could just drop
//     the token locally, so this endpoint just makes the server-side slot
//     free up in the same moment.
//
//   Kick-other:     body { zkAppAddress, proof, targetJti }
//     Releases a seat identified by `targetJti` within the same license as
//     the proof. Requires a fresh challenge/response — same trust bar as
//     /seats and /resetSessions: enumerating other devices already required
//     the passphrase, so acting on that list must too. A stolen token alone
//     CANNOT kick other devices; only self-release.
//
// Idempotent in both modes — releasing an unknown or already-released jti
// returns 200 with released:false.
app.post('/releaseSeat', async (req, res) => {
    const body = req.body;
    // Sanitize targetJti — accept only non-empty strings up to 64 chars.
    const targetJti = typeof body.targetJti === 'string' && body.targetJti.length > 0 && body.targetJti.length <= 64
        ? body.targetJti
        : null;
    // Kick-other mode: ownership envelope + zkAppAddress + targetJti. Detected
    // by the presence of `signature` — a caller that supplied a signature gets
    // the elevated path even if they also (redundantly) sent a token; a caller
    // that only sent a token but no signature falls into the self-release
    // path below.
    if (body.signature !== undefined) {
        if (!targetJti) {
            return res.status(400).json({ error: 'Kick-other requires targetJti; omit signature to self-release' });
        }
        if (typeof body.zkAppAddress !== 'string' || !body.zkAppAddress) {
            return res.status(400).json({ error: 'Missing zkAppAddress' });
        }
        const addrErr = validateZkAppAddress(body.zkAppAddress);
        if (addrErr)
            return res.status(400).json({ error: addrErr });
        const ownership = await verifyOwnershipSignature(body.zkAppAddress, body);
        if (!ownership.ok)
            return res.status(ownership.status).json({ error: ownership.error });
        const { licenseHash, nonce } = ownership;
        // Rate-limit AFTER signature verification (licenseHash cryptographically
        // trusted) but BEFORE the on-chain lookup and nonce consume — same
        // ordering as /resetSessions. Kick-other counts against the same
        // per-license daily budget as self-release: an attacker holding either
        // a token OR the passphrase shares a bounded budget with the honest
        // owner.
        const app_record_kick = await loadAppByAddress(body.zkAppAddress);
        const kickLimit = Math.max(0, Math.floor(app_record_kick?.maxConcurrentDevices ?? 0));
        if (kickLimit === 0) {
            return res.status(400).json({
                error: 'This app has maxConcurrentDevices=0 (unlimited) — no session state to release.',
            });
        }
        const rlKick = releaseSeatRateLimit.bump(licenseHash, kickLimit);
        if (rlKick.state === 'at-cap') {
            return res.status(429)
                .set('Retry-After', String(rlKick.retryAfterSec))
                .json({
                error: `releaseSeat rate limit exceeded (${kickLimit}/day) — retry in ${rlKick.retryAfterSec}s`,
                retryAfterSec: rlKick.retryAfterSec,
                dailyLimit: kickLimit,
            });
        }
        // On-chain gate BEFORE nonce consume — same rationale as /respond.
        let onChain;
        try {
            onChain = await checkOnChainLicense(body.zkAppAddress, licenseHash);
        }
        catch (err) {
            return res.status(502).json({ error: `On-chain license lookup failed: ${err?.message || String(err)}` });
        }
        switch (onChain.kind) {
            case 'zkapp-not-found':
                return res.status(404).json({ error: 'zkApp not found on chain' });
            case 'unregistered-address':
                return res.status(403).json({ error: 'zkAppAddress is not in any registered app deployment history' });
            case 'vk-mismatch':
                return res.status(403).json({ error: `zkApp VK does not match generation ${onChain.generation}'s canonical circuit` });
            case 'checked':
                if (!onChain.result.valid) {
                    return res.status(403).json({ error: `License not valid: ${onChain.result.reason}` });
                }
                break;
        }
        const nonceState = ownershipChallenges.consume(licenseHash, nonce);
        if (nonceState !== 'ok') {
            return res.status(400).json({ error: `Nonce ${nonceState} — request a fresh /challenge` });
        }
        const released = ownershipSessions.releaseSeat(licenseHash, targetJti);
        return res.json({ ok: true, released, jti: targetJti, self: false });
    }
    // Self-release mode: token-only. Reject a request that supplied no token
    // AND no proof — nothing to act on.
    const token = typeof body.token === 'string' ? body.token : undefined;
    if (!token)
        return res.status(400).json({ error: 'Missing token (or supply zkAppAddress+proof+targetJti to kick another seat)' });
    const payload = await verifyKeeperInternal(token);
    if (!payload)
        return res.status(401).json({ error: 'Invalid or expired token' });
    // Rate-limit AFTER verifying the token so an unauthenticated caller can't
    // drive the per-license counter for a license they don't hold. Counted
    // per licenseHash — a stolen token racing the legit owner shares the cap
    // with them, which is what we want (the abuse is against the license,
    // not against the caller). Limit = the app's device cap (1 release per
    // seat per day). Cap is guaranteed > 0 here because /respond refuses to
    // mint for cap=0 apps, so a valid token implies cap > 0; if the app
    // record has since gone missing (deleted mid-session), fail closed.
    const app_record_for_limit = await loadAppByAddress(payload.z);
    const releaseLimit = Math.max(0, Math.floor(app_record_for_limit?.maxConcurrentDevices ?? 0));
    if (releaseLimit === 0) {
        return res.status(410).json({
            error: 'App is no longer registered with a device cap — session state is stale.',
            hint: 'Drop the local token; a fresh /respond is required (and will 400 if the app is now unlimited).',
        });
    }
    const rl = releaseSeatRateLimit.bump(payload.l, releaseLimit);
    if (rl.state === 'at-cap') {
        return res.status(429)
            .set('Retry-After', String(rl.retryAfterSec))
            .json({
            error: `releaseSeat rate limit exceeded (${releaseLimit}/day) — retry in ${rl.retryAfterSec}s`,
            retryAfterSec: rl.retryAfterSec,
            dailyLimit: releaseLimit,
        });
    }
    if (!payload.jti) {
        // Pre-jti tokens aren't tracked in the session store, so there's no
        // seat to release. Return 200 for idempotency — the caller's intent
        // (log this device out) is satisfied by the local token delete.
        return res.json({ ok: true, released: false, reason: 'token has no jti (pre-jti issue)', self: true });
    }
    const released = ownershipSessions.releaseSeat(payload.l, payload.jti);
    res.json({ ok: true, released, jti: payload.jti, self: true });
});
// POST /seats — body: { zkAppAddress, licenseHash, pubKey, nonce, signature, currentJti? }
// Returns the device list for the licenseHash proved by the ownership signature.
// Requires a fresh challenge/response — same trust bar as /resetSessions,
// intentionally elevated above /releaseSeat's token-alone check: a leaked
// or stolen ownership token can already release its own seat, but
// enumerating (and thus targeting) other devices on the same license is
// gated on the passphrase-holder actually holding the passphrase.
//
// POST (not GET) because the proof blob is large and structured — a query
// string is the wrong shape. Nothing about this call mutates state beyond
// consuming the one-shot nonce, which the passphrase-holder can always
// re-issue.
//
// Optional `currentJti` lets the caller ask the server to stamp `self:true`
// on their own row so the UI can highlight "this device" without a second
// lookup. It's advisory — an unrecognised value simply produces no self
// flag; a hostile value can only lie to the caller's own UI, which they
// already control.
app.post('/seats', async (req, res) => {
    const body = req.body;
    const { zkAppAddress, currentJti: rawCurrentJti } = body;
    if (!zkAppAddress) {
        return res.status(400).json({ error: 'Missing zkAppAddress' });
    }
    const addrErr = validateZkAppAddress(zkAppAddress);
    if (addrErr)
        return res.status(400).json({ error: addrErr });
    const currentJti = typeof rawCurrentJti === 'string' && rawCurrentJti.length > 0 && rawCurrentJti.length <= 64
        ? rawCurrentJti
        : null;
    const ownership = await verifyOwnershipSignature(zkAppAddress, body);
    if (!ownership.ok)
        return res.status(ownership.status).json({ error: ownership.error });
    const { licenseHash, nonce } = ownership;
    // On-chain gate BEFORE consuming the nonce, mirroring /respond and
    // /resetSessions. A transient RPC failure returns 502 without burning
    // the nonce so client-side retry-with-backoff still works.
    let onChain;
    try {
        onChain = await checkOnChainLicense(zkAppAddress, licenseHash);
    }
    catch (err) {
        return res.status(502).json({ error: `On-chain license lookup failed: ${err?.message || String(err)}` });
    }
    switch (onChain.kind) {
        case 'zkapp-not-found':
            return res.status(404).json({ error: 'zkApp not found on chain' });
        case 'unregistered-address':
            return res.status(403).json({ error: 'zkAppAddress is not in any registered app deployment history' });
        case 'vk-mismatch':
            return res.status(403).json({ error: `zkApp VK does not match generation ${onChain.generation}'s canonical circuit` });
        case 'checked':
            if (!onChain.result.valid) {
                return res.status(403).json({ error: `License not valid: ${onChain.result.reason}` });
            }
            break;
    }
    const nonceState = ownershipChallenges.consume(licenseHash, nonce);
    if (nonceState !== 'ok') {
        return res.status(400).json({ error: `Nonce ${nonceState} — request a fresh /challenge` });
    }
    const app_record = await loadAppByAddress(zkAppAddress);
    const cap = Math.max(0, Math.floor(app_record?.maxConcurrentDevices ?? 0));
    if (cap === 0) {
        // Unlimited apps don't track sessions at all — surface an empty seat
        // list rather than 404 so a UI generically wired against /seats degrades
        // to "no devices to show" instead of an error toast.
        return res.json({ seats: [], deviceLimit: 0 });
    }
    // Sort by lastRefreshAt DESC (freshest first) so the UI naturally shows
    // active devices at the top and the LRR candidate — the next eviction
    // target if a new device joins over the cap — at the bottom.
    const rows = ownershipSessions.list(licenseHash);
    const seats = rows
        .slice()
        .sort((a, b) => b.lastRefreshAt - a.lastRefreshAt)
        .map(row => ({
        jti: row.jti,
        name: row.name,
        mintedAt: row.mintedAt,
        lastRefreshAt: row.lastRefreshAt,
        exp: row.exp,
        ...(currentJti !== null && row.jti === currentJti ? { self: true } : {}),
    }));
    res.json({ seats, deviceLimit: cap });
});
// POST /refresh — body: { token }
// Extends the lifetime of the current session without a fresh ownership proof.
// The caller sends the token they already hold; the server verifies the HMAC,
// checks the jti is still active in the session store (i.e. not released or
// evicted), and issues a new token with the same jti and a fresh exp. The
// session store's insert is idempotent per jti, so no cap check is needed —
// the slot was already reserved at /respond time.
//
// Intended for background renewal from a running app: the client polls this
// endpoint before the token expires so a user who keeps the app open never
// has to redo the passphrase-gated challenge/response. A stolen token can be
// refreshed too, which is why /releaseSeat exists — losing a device means the
// owner explicitly logs it out, and subsequent refreshes fail.
//
// Pre-jti tokens (legacy /respond without session tracking) can also refresh:
// they're valid HMAC, they carry no jti, and there's no session-store row to
// gate against. The reissued token is identically pre-jti. Callers that want
// concurrency enforcement must reissue via /respond so a jti gets minted.
app.post('/refresh', async (req, res) => {
    const { token } = req.body;
    if (!token)
        return res.status(400).json({ error: 'Missing token' });
    const payload = await verifyKeeperInternal(token);
    if (!payload)
        return res.status(401).json({ error: 'Invalid or expired token' });
    // Session-store gate first — cheap check, skip the archive round-trip when
    // the seat is already released. Pre-jti tokens (legacy /respond without
    // session tracking) bypass this check and remain refreshable until their
    // exp; the reissued token stays pre-jti.
    if (payload.jti && !ownershipSessions.has(payload.l, payload.jti)) {
        return res.status(401).json({ error: 'Seat released' });
    }
    // Re-read on-chain license state. Two jobs:
    //   1. Pick up mid-session renewals so long-running clients see the fresh
    //      `licenseExpiresAt`.
    //   2. Cut the session off when the chain says the license is past its
    //      grace period, refunded, or otherwise no longer valid. During grace,
    //      verifyLicenseCore returns `valid: true` — grace-period sessions
    //      keep refreshing normally, but the token's `e` is capped at
    //      grace-end below so PRO ends locally exactly when grace ends,
    //      offline or not.
    //
    // Only revoke on a *clear* invalid verdict (`kind: 'checked'` AND
    // `!result.valid`). A transient RPC failure returns null and leaves the
    // seat alive — an archive-node outage must not kick every user offline.
    let licenseExpiresAt = null;
    let graceEndMs = null;
    try {
        const onChain = await checkOnChainLicense(payload.z, payload.l);
        if (onChain.kind === 'checked') {
            if (!onChain.result.valid) {
                // Release the seat so the slot isn't held by a dead session, then
                // 401 so the client (see mlestalk-ui license.js refresh()) drops
                // local state and stops pinging.
                if (payload.jti)
                    ownershipSessions.releaseSeat(payload.l, payload.jti);
                return res.status(401).json({ error: `License no longer valid: ${onChain.result.reason ?? 'unknown'}` });
            }
            licenseExpiresAt = onChain.result.expiresAt;
            if (onChain.result.expirySlot > 0 && onChain.result.expiresAt) {
                graceEndMs = Date.parse(onChain.result.expiresAt) + GRACE_PERIOD_N * MS_PER_SLOT_N;
            }
        }
    }
    catch { /* non-fatal — leave null, session survives transient RPC failure */ }
    // Cap the reissued token at grace-end (see /respond for rationale).
    const rawExp = Date.now() + OWNERSHIP_TOKEN_TTL_MS;
    const newExp = graceEndMs !== null ? Math.min(rawExp, graceEndMs) : rawExp;
    if (payload.jti) {
        // Advance the seat's expiry AND its lastRefreshAt — the latter is the
        // load-bearing field for LRR eviction on the next /respond. If refresh()
        // returns false the seat was released or expired between the has() check
        // above and now (rare — has() prunes opportunistically); treat it the
        // same as "seat released" and 401 so the client drops state.
        if (!ownershipSessions.refresh(payload.l, payload.jti, newExp)) {
            return res.status(401).json({ error: 'Seat released' });
        }
    }
    // Fresh iat on every reissue — the browser verifier ratchets an iatFloor
    // from every accepted token, and a stashed old-iat token replayed later
    // must not verify. Reissuing under the OLD iat would let a compromised
    // client keep refreshing with an old-iat payload.
    //
    // Preserve `n` (device name) verbatim — the client's device list keeps its
    // stable label across refreshes. A pre-name token stays pre-name.
    const next = {
        v: 1,
        z: payload.z,
        g: payload.g,
        l: payload.l,
        e: newExp,
        iat: Date.now(),
        ...(payload.jti ? { jti: payload.jti } : {}),
        ...(payload.n ? { n: payload.n } : {}),
    };
    const nextToken = signOwnershipToken(_ownershipPrivateKey, next);
    res.json({ token: nextToken, expiresAt: newExp, licenseExpiresAt, jti: payload.jti, name: payload.n });
});
// POST /resetSessions — body: { zkAppAddress, licenseHash, pubKey, nonce, signature }
// Drops ALL active sessions for the licenseHash proved by the Ed25519
// ownership signature. Requires the same challenge/response as /respond —
// only the passphrase holder can invoke it. Intended for "reinstall
// unsticks a device that burned a slot without logging out" recovery.
// After this returns, the caller runs a fresh /respond to re-provision a
// session under a zero active count.
app.post('/resetSessions', async (req, res) => {
    const body = req.body;
    const { zkAppAddress } = body;
    if (!zkAppAddress) {
        return res.status(400).json({ error: 'Missing zkAppAddress' });
    }
    const addrErr = validateZkAppAddress(zkAppAddress);
    if (addrErr)
        return res.status(400).json({ error: addrErr });
    const ownership = await verifyOwnershipSignature(zkAppAddress, body);
    if (!ownership.ok)
        return res.status(ownership.status).json({ error: ownership.error });
    const { licenseHash, nonce } = ownership;
    // Rate-limit AFTER signature verification (so licenseHash is cryptographically
    // trusted) but BEFORE the on-chain lookup and nonce consume — a rate-limited
    // caller must not burn their nonce or hammer the archive node. An attacker
    // without the license secret can't forge a valid signature, so they can't drive
    // this counter for a license they don't hold. Limit = the app's device cap
    // (1 reset per seat per day). Cap=0 apps have no tokens (see /respond
    // precheck), so there is nothing to reset; refuse with 400 pointing at
    // GET /verify instead.
    const app_record_for_reset_limit = await loadAppByAddress(zkAppAddress);
    const resetLimit = Math.max(0, Math.floor(app_record_for_reset_limit?.maxConcurrentDevices ?? 0));
    if (resetLimit === 0) {
        return res.status(400).json({
            error: 'This app has maxConcurrentDevices=0 (unlimited) — no session state to reset.',
            hint: 'Call GET /verify?licenseHash=…&zkAppAddress=… directly. Unlimited apps have no tokens or sessions.',
        });
    }
    const rl = resetSessionsRateLimit.bump(licenseHash, resetLimit);
    if (rl.state === 'at-cap') {
        return res.status(429)
            .set('Retry-After', String(rl.retryAfterSec))
            .json({
            error: `resetSessions rate limit exceeded (${resetLimit}/day) — retry in ${rl.retryAfterSec}s`,
            retryAfterSec: rl.retryAfterSec,
            dailyLimit: resetLimit,
        });
    }
    // Same on-chain gate as /respond, same ordering rationale: run BEFORE the
    // nonce is consumed so a transient Mina-node 502 doesn't burn the nonce
    // and break the client-side retry-with-backoff. Without this check a ZK
    // preimage proof for a (secret, hash) pair the caller invented would
    // reset zero sessions and return 200 for a no-op — violating the
    // "proof-of-ownership endpoints assert on-chain existence" contract.
    let onChain;
    try {
        onChain = await checkOnChainLicense(zkAppAddress, licenseHash);
    }
    catch (err) {
        return res.status(502).json({ error: `On-chain license lookup failed: ${err?.message || String(err)}` });
    }
    switch (onChain.kind) {
        case 'zkapp-not-found':
            return res.status(404).json({ error: 'zkApp not found on chain' });
        case 'unregistered-address':
            return res.status(403).json({ error: 'zkAppAddress is not in any registered app deployment history' });
        case 'vk-mismatch':
            return res.status(403).json({ error: `zkApp VK does not match generation ${onChain.generation}'s canonical circuit` });
        case 'checked':
            if (!onChain.result.valid) {
                return res.status(403).json({ error: `License not valid: ${onChain.result.reason}` });
            }
            break;
    }
    const nonceState = ownershipChallenges.consume(licenseHash, nonce);
    if (nonceState !== 'ok') {
        return res.status(400).json({ error: `Nonce ${nonceState} — request a fresh /challenge` });
    }
    const dropped = ownershipSessions.reset(licenseHash);
    res.json({ ok: true, dropped });
});
// GET /?licenseHash=...&zkAppAddress=...[&token=...]
// Primary endpoint for Android, iOS, PWA, and Node SDK license verification.
//
// Ownership semantics:
//  - Without `token`, the response describes the state of the on-chain leaf
//    only — it does NOT prove the caller owns the license. This is fine for
//    status displays; gate access behind /respond or pass a fresh
//    activation `token` in the query string.
//  - With `token`, the service checks the HMAC and refuses if the token isn't
//    for this (zkAppAddress, licenseHash) pair.
app.get('/', async (req, res) => {
    const { licenseHash: licenseHashStr, zkAppAddress, token } = req.query;
    if (!licenseHashStr || !zkAppAddress) {
        return res.status(400).json({ error: 'Missing required query params: licenseHash, zkAppAddress' });
    }
    let ownershipVerified = false;
    if (token) {
        // The caller has already told us zkAppAddress in the query, so we can
        // pass it (plus the registry-resolved generation) as the authoritative
        // expected z/g — no peeking at the token first.
        const expectedGen = await resolveGenerationByAddress(zkAppAddress);
        if (expectedGen === null) {
            return res.status(401).json({ error: 'Invalid or expired ownership token' });
        }
        const payload = verifyOwnershipToken([ownershipPublicKeyBase64], token, { z: zkAppAddress, g: String(expectedGen) });
        if (!payload || payload.l !== licenseHashStr) {
            return res.status(401).json({ error: 'Invalid or expired ownership token' });
        }
        // Session-store gate: a jti-bearing token must still be in the active-
        // session set for its license. A token whose jti was released (via
        // /releaseSeat, /resetSessions, or evicted by TTL prune) is refused even if
        // it's still HMAC-valid and inside its exp. Pre-jti tokens (issued
        // before the session-tracking rollout) skip this check and remain
        // usable until their exp — no forced logout across the migration.
        if (payload.jti && !ownershipSessions.has(payload.l, payload.jti)) {
            return res.status(401).json({ error: 'Seat released — call POST /respond to acquire a fresh token' });
        }
        ownershipVerified = true;
    }
    // Defense-in-depth against impersonation: the helper resolves the address's
    // generation via keeper deploymentHistory and asserts its on-chain VK equals
    // that generation's canonical hash. Two rejection modes it covers: (a) the
    // address is not in any registered app's deployment history — stops a
    // genuine old circuit redeployed at a fresh address; (b) the address is
    // listed but its VK doesn't match — a loud index-corruption tripwire.
    //
    // Unlike POST /respond, GET / surfaces these as 200 responses with
    // `valid: false` in the body — public verifiers expect a consistent verdict
    // envelope. The helper's `zkAppVersion` field (appState[7]) is a free
    // informational tag for the SDK / dashboard, not a security gate.
    const ownership = ownershipVerified ? 'verified' : 'unverified';
    try {
        const onChain = await checkOnChainLicense(zkAppAddress, licenseHashStr);
        switch (onChain.kind) {
            case 'zkapp-not-found':
                return res.status(404).json({ error: 'zkApp not found on chain' });
            case 'unregistered-address':
                return res.json({
                    valid: false,
                    expiresAt: null,
                    expirySlot: 0,
                    inGracePeriod: false,
                    remainingDays: 0,
                    reason: 'zkAppAddress is not in any registered app deployment history',
                    ownership,
                });
            case 'vk-mismatch':
                return res.json({
                    valid: false,
                    expiresAt: null,
                    expirySlot: 0,
                    inGracePeriod: false,
                    remainingDays: 0,
                    reason: `zkApp verification key does not match generation ${onChain.generation}'s canonical LicensingApp circuit`,
                    ownership,
                });
            case 'checked': {
                // Key on resolvedAddress (the address the license was actually found
                // under) rather than the request address — for pre-bump buyers who
                // never migrated, these differ: request is the retired addr the
                // client pinned, resolved is the retired addr the record lives on.
                const record = onChain.liveRecords.find(r => r.zkAppAddress === onChain.resolvedAddress && r.licenseHash === licenseHashStr);
                return res.json({
                    ...onChain.result,
                    currentSlot: onChain.currentSlot,
                    purchaseSlot: record?.purchaseSlot ?? 0,
                    ownership,
                    zkAppVersion: onChain.zkAppVersion,
                });
            }
        }
    }
    catch (err) {
        console.error('[verify]', err?.message ?? err);
        res.status(500).json({ error: err?.message ?? 'Verification failed' });
    }
});
// License map witness — composite (zkAppAddress, licenseHash) key.
app.get('/witness/:zkAppAddress/:licenseHash', async (req, res) => {
    const { zkAppAddress, licenseHash } = req.params;
    try {
        const records = await readRecords();
        const map = buildMap(records, zkAppAddress);
        const key = Field(licenseHash);
        const witness = map.getWitness(key);
        res.json({
            root: map.getRoot().toString(),
            currentValue: map.get(key).toString(),
            ...serializeWitness(witness),
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// License status — composite (zkAppAddress, licenseHash) key.
app.get('/license/:zkAppAddress/:licenseHash', async (req, res) => {
    const { zkAppAddress, licenseHash } = req.params;
    const record = await getLicense(zkAppAddress, licenseHash);
    const slot = await currentSlot();
    const status = licenseStatus(record, slot);
    res.json({
        found: record !== null,
        expirySlot: record?.expirySlot ?? 0,
        status,
        txHash: record?.txHash ?? null,
    });
});
// List registered apps
app.get('/apps', async (_req, res) => {
    const apps = await readApps();
    res.json({ apps });
});
// POST /bootstrap — admin
// Body: { zkAppAddress: string }
// Replays all canonical events from the archive node and rebuilds licenses.json.
// Gated because an open archive-replay endpoint is a DoS vector (each call hits
// the archive node and rewrites the local store).
app.post('/bootstrap', requireAdmin, async (req, res) => {
    const { zkAppAddress } = req.body;
    if (!zkAppAddress) {
        return res.status(400).json({ error: 'Missing zkAppAddress' });
    }
    const addrErr = validateZkAppAddress(zkAppAddress);
    if (addrErr)
        return res.status(400).json({ error: addrErr });
    try {
        // Refuse to replay a zkApp whose immutable source-version tag doesn't match
        // one this verifier understands. Otherwise a v2-deployed contract's events
        // could be decoded with a v1 schema and yield subtly wrong state.
        const onChainVersion = await fetchLicensingAppVersion(zkAppAddress);
        if (onChainVersion === null) {
            return res.status(400).json({ error: `zkApp ${zkAppAddress.slice(0, 16)}… not visible on chain` });
        }
        if (!SUPPORTED_LICENSING_APP_VERSIONS.includes(onChainVersion)) {
            return res.status(400).json({
                error: `unsupported LicensingApp version — on-chain v${onChainVersion}, this verifier supports v${SUPPORTED_LICENSING_APP_VERSIONS.join(', v')}`,
            });
        }
        console.log(`[bootstrap] Replaying events for ${zkAppAddress.slice(0, 16)}… (v${onChainVersion}) from ${archiveUrl}`);
        const { events } = await bootstrapFromArchive(zkAppAddress);
        const { count, warnings } = await applyEventsToStore(zkAppAddress, events);
        for (const w of warnings)
            console.warn('[bootstrap]', w);
        console.log(`[bootstrap] Done — ${count} license records written`);
        res.json({ ok: true, count, warnings, onChainVersion });
    }
    catch (err) {
        console.error('[bootstrap]', err?.message ?? err);
        res.status(500).json({ error: err?.message ?? 'Bootstrap failed' });
    }
});
// ------------------------------------------------------------
// START
// ------------------------------------------------------------
let records = await readRecords();
// Auto-bootstrap from archive if store is empty.
if (records.length === 0) {
    const apps = await readApps();
    if (apps.length > 0) {
        console.log(`📦 licenses.json is empty — bootstrapping ${apps.length} app(s) from archive node…`);
        for (const appRecord of apps) {
            try {
                // Same version guard as POST /bootstrap — refuse to replay any address
                // whose on-chain source-version tag this verifier doesn't understand.
                const onChainVersion = await fetchLicensingAppVersion(appRecord.zkAppAddress);
                if (onChainVersion === null) {
                    console.warn(`   ⚠️  ${appRecord.name}: zkApp not visible on chain — skipping`);
                    continue;
                }
                if (!SUPPORTED_LICENSING_APP_VERSIONS.includes(onChainVersion)) {
                    console.warn(`   ⚠️  ${appRecord.name}: on-chain v${onChainVersion} not supported (supports v${SUPPORTED_LICENSING_APP_VERSIONS.join(', v')}) — skipping`);
                    continue;
                }
                const { events } = await bootstrapFromArchive(appRecord.zkAppAddress);
                const { count, warnings } = await applyEventsToStore(appRecord.zkAppAddress, events);
                for (const w of warnings)
                    console.warn('⚠️', w);
                console.log(`   ✅ ${appRecord.name} (v${onChainVersion}): ${count} records`);
            }
            catch (err) {
                console.warn(`   ⚠️  ${appRecord.name}: bootstrap failed — ${err?.message ?? err}`);
            }
        }
        records = await readRecords();
    }
}
console.log(`📋 Loaded ${records.length} license records across ${new Set(records.map(r => r.zkAppAddress)).size} zkApp(s)`);
app.listen(PORT, () => {
    console.log(`🔍 Verify service listening on http://localhost:${PORT}`);
    console.log(`   GET  /?licenseHash=...&zkAppAddress=...[&token=...]`);
    console.log(`   GET  /challenge?licenseHash=...`);
    console.log(`   POST /respond`);
    console.log(`   POST /refresh`);
    console.log(`   POST /releaseSeat`);
    console.log(`   POST /resetSessions`);
    console.log(`   GET  /witness/:zkAppAddress/:licenseHash`);
    console.log(`   GET  /license/:zkAppAddress/:licenseHash`);
    console.log(`   GET  /apps`);
    console.log(`   POST /bootstrap`);
    if (VERIFY_ADMIN_TOKEN) {
        console.log(`🔒 Admin endpoints (bootstrap) enabled`);
    }
    else {
        console.log(`⚠️  Admin endpoints disabled (set VERIFY_ADMIN_TOKEN to enable)`);
    }
    console.log(`🔁 Lazy bootstrap on root mismatch (no periodic poller)`);
});
//# sourceMappingURL=verifyService.js.map