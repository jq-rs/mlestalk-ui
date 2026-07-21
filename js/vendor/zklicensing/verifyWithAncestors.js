// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * verifyWithAncestors.ts
 *
 * Shared address-routing core used by both verifyService.ts and
 * keeperService.ts. Given an already-resolved AppRecord, an already-fetched
 * current-live on-chain root, and the current set of license records, this
 * helper:
 *
 *   1. Tries verifyLicenseCore against the current live contract (fresh
 *      post-bump buyers and buyers who migrated land here).
 *   2. On "License not found" in current-live, walks the app's
 *      deploymentHistory[] newest-first, fetching each retired contract's
 *      own on-chain root and re-checking with records filtered to that
 *      retired address (pre-bump buyers who never migrated land here).
 *   3. Applies one lazy-bootstrap replay per address on
 *      "License state does not match on-chain root" — same self-heal the
 *      callers used to do inline.
 *
 * The helper does NOT do VK-hash validation or version admission — those
 * are caller-specific policy (verifyService uses per-generation
 * CANONICAL_VK_HASHES; keeper uses its single compiled canonicalVkHash).
 * Callers do their VK check up front against the current-live account they
 * fetched, then hand the fetched root here.
 */
import { PublicKey, fetchAccount } from '../o1js/index.js';
import { verifyLicenseCore } from './verifyCore.js';
import { readRecords } from './licenseStore.js';
import { lazyBootstrap } from './archiveBootstrap.js';
// One-shot internal retry for a single network call. Absorbs a lone
// transient blip from the Mina GraphQL node. Duplicated shape from
// verifyService's fetchWithOneRetry — kept local to this module so the
// helper stays self-contained and the two callers don't need to inject
// their own retry strategy.
async function fetchWithOneRetry(fn, delayMs = 500) {
    try {
        return await fn();
    }
    catch {
        await new Promise(r => setTimeout(r, delayMs));
        return fn();
    }
}
export async function verifyLicenseWithAncestors(input) {
    const { appRecord, licenseHash, currentSlot, currentLiveRoot } = input;
    let liveRecords = input.records;
    const currentLive = appRecord.zkAppAddress;
    // Step 1: try current-live first.
    let result = verifyLicenseCore({
        zkAppAddress: currentLive,
        licenseHash,
        records: liveRecords,
        onChainRoot: currentLiveRoot,
        currentSlot,
    });
    if (!result.valid && result.reason === 'License state does not match on-chain root') {
        await lazyBootstrap(currentLive);
        liveRecords = await readRecords();
        result = verifyLicenseCore({
            zkAppAddress: currentLive,
            licenseHash,
            records: liveRecords,
            onChainRoot: currentLiveRoot,
            currentSlot,
        });
    }
    if (result.valid || result.reason !== 'License not found') {
        return { result, resolvedAddress: currentLive, onChainRoot: currentLiveRoot, liveRecords };
    }
    // Step 2: walk retired addresses newest-first.
    const retiredAddrs = (appRecord.deploymentHistory ?? []).map(d => d.zkAppAddress).reverse();
    for (const retired of retiredAddrs) {
        let retiredAccount;
        try {
            const fetched = await fetchWithOneRetry(() => fetchAccount({ publicKey: PublicKey.fromBase58(retired) }));
            retiredAccount = fetched.account;
        }
        catch {
            continue;
        }
        const retiredRoot = retiredAccount?.zkapp?.appState?.[0]?.toString();
        if (!retiredRoot)
            continue;
        let retiredResult = verifyLicenseCore({
            zkAppAddress: retired,
            licenseHash,
            records: liveRecords,
            onChainRoot: retiredRoot,
            currentSlot,
        });
        if (!retiredResult.valid && retiredResult.reason === 'License state does not match on-chain root') {
            await lazyBootstrap(retired);
            liveRecords = await readRecords();
            retiredResult = verifyLicenseCore({
                zkAppAddress: retired,
                licenseHash,
                records: liveRecords,
                onChainRoot: retiredRoot,
                currentSlot,
            });
        }
        if (retiredResult.valid || retiredResult.reason !== 'License not found') {
            return { result: retiredResult, resolvedAddress: retired, onChainRoot: retiredRoot, liveRecords };
        }
    }
    // Not found anywhere — return the current-live "License not found" verdict.
    return { result, resolvedAddress: currentLive, onChainRoot: currentLiveRoot, liveRecords };
}
//# sourceMappingURL=verifyWithAncestors.js.map