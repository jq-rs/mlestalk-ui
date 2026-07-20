// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * generationClient.ts
 *
 * Browser-safe fetcher for the keeper's signed generation-list. Returns the
 * app's deployment history — every past address plus the current live one —
 * verified against a caller-supplied pin list of platform manifest public
 * keys.
 *
 * Trust model: the keeper is not the trust anchor for this data — it can
 * be re-hosted, mirrored, cached, or (worst case) impersonated. The pin
 * list is. Any response that fails signature verification is surfaced as
 * `verified: false` with `generations: []` so callers cannot accidentally
 * route a wallet prompt to an unverified address.
 *
 * Optional corroboration channel: an operator that publishes
 *   https://<vendor-host>/.well-known/zklicensing/<appId>.json
 * (using the same keeper-signed payload) can be cross-checked from the
 * on-chain zkappUri. Per-app filename because a vendor may host several
 * apps at one origin. The cross-check is opt-in per-app — a 404 at that
 * URL is not a failure signal, just "no corroboration published for this
 * app." That's the caller's job, not this module's.
 */
import { verifyManifestSignature } from './manifestVerify.js';
function baseUrl(url) {
    return url.replace(/\/+$/, '');
}
function parseGenerationBody(body) {
    const gensRaw = body.generations;
    return {
        current: typeof body.current === 'number' ? body.current : null,
        generations: Array.isArray(gensRaw) ? gensRaw : [],
        signature: typeof body.signature === 'string' ? body.signature : null,
        issuedAt: typeof body.issuedAt === 'string' ? body.issuedAt : null,
        appId: typeof body.appId === 'string' ? body.appId : null,
    };
}
async function verifyAndProject(parsed, pinnedPublicKeysBase64) {
    const { current, generations, signature, issuedAt, appId } = parsed;
    if (!signature || !issuedAt || !appId || current === null) {
        return { current, generations, verified: false };
    }
    // Reconstruct the canonical payload — must match keeperService's
    // signPayload input exactly.
    const canonical = { appId, current, generations, issuedAt };
    const verified = await verifyManifestSignature(canonical, signature, pinnedPublicKeysBase64);
    if (!verified) {
        // Never surface unverified `current`/`generations` — a caller must not
        // accidentally route a wallet prompt to an address we couldn't authenticate.
        return { current: null, generations: [], verified: false };
    }
    return { current, generations, verified: true };
}
/**
 * GET /apps/:appId — returns { appId, current, generations, issuedAt, publicKey, signature }.
 * We reconstruct the canonical payload (everything except `publicKey` +
 * `signature`) and verify against the pin list. `publicKey` in the response
 * is advisory only — it's the key the keeper claims to have signed with;
 * the SDK never trusts it in place of a pin.
 */
export async function fetchGenerationInfo(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/apps/${encodeURIComponent(req.appId)}`, {
        method: 'GET',
        signal: req.signal,
    });
    if (!resp.ok) {
        return { current: null, generations: [], verified: false };
    }
    let body;
    try {
        body = await resp.json();
    }
    catch {
        return { current: null, generations: [], verified: false };
    }
    return verifyAndProject(parseGenerationBody(body), req.pinnedPublicKeysBase64);
}
/**
 * GET /apps/by-address/:zkAppAddress — same signed payload as fetchGenerationInfo,
 * but keyed by an address the caller already has (direct-paste buys, renew on a
 * since-retired address). Buyers arriving without an appId would otherwise have
 * to trust the keeper's unsigned `/apps` list to bind their address to an appId
 * first — defeating the pin.
 *
 * Extra assertion beyond the appId flow: the queried address MUST appear in the
 * returned `generations[]`. Without this, a malicious keeper could return a
 * validly-signed payload for a DIFFERENT app in response to the query, and the
 * signature check alone wouldn't catch it.
 */
export async function fetchGenerationInfoByAddress(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/apps/by-address/${encodeURIComponent(req.zkAppAddress)}`, { method: 'GET', signal: req.signal });
    if (!resp.ok) {
        return { current: null, generations: [], verified: false };
    }
    let body;
    try {
        body = await resp.json();
    }
    catch {
        return { current: null, generations: [], verified: false };
    }
    const projected = await verifyAndProject(parseGenerationBody(body), req.pinnedPublicKeysBase64);
    if (!projected.verified)
        return projected;
    if (!projected.generations.some(g => g.zkAppAddress === req.zkAppAddress)) {
        return { current: null, generations: [], verified: false };
    }
    return projected;
}
//# sourceMappingURL=generationClient.js.map