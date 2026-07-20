// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * verifyCore.ts
 *
 * Pure verification logic shared by keeperService and verifyService.
 * No HTTP, no network — takes already-fetched on-chain state and
 * performs Merkle inclusion check + expiry logic.
 */
import { Field } from '../o1js/index.js';
import { buildMap } from './licenseStore.js';
import { GRACE_PERIOD_N, MS_PER_SLOT_N, SLOTS_PER_DAY_N } from './contractInterface.js';
function computeRemainingDays(expirySlot, currentSlot) {
    if (expirySlot === 0)
        return 0;
    return Math.floor((expirySlot - currentSlot) / SLOTS_PER_DAY_N);
}
/**
 * Core license verification.
 *
 * @param zkAppAddress - app address (composite key with licenseHash)
 * @param licenseHash  - Poseidon.hash([secretHash]) as a field string
 * @param records      - current off-chain license records (from licenseStore)
 * @param onChainRoot  - zkApp appState[0] fetched from Mina
 * @param currentSlot  - current blockchain slot (globalSlotSinceGenesis)
 */
export function verifyLicenseCore(params) {
    const { zkAppAddress, licenseHash, records, onChainRoot, currentSlot } = params;
    const map = buildMap(records, zkAppAddress);
    const key = Field(licenseHash);
    const currentValue = map.get(key).toString();
    const witness = map.getWitness(key);
    const [computedRoot] = witness.computeRootAndKey(Field(currentValue));
    if (computedRoot.toString() !== onChainRoot) {
        return { valid: false, expiresAt: null, expirySlot: 0, inGracePeriod: false, remainingDays: 0, reason: 'License state does not match on-chain root' };
    }
    if (currentValue === '0') {
        const record = records.find(r => r.zkAppAddress === zkAppAddress && r.licenseHash === licenseHash);
        const reason = record?.refunded ? 'License has been refunded' : 'License not found';
        return { valid: false, expiresAt: null, expirySlot: 0, inGracePeriod: false, remainingDays: 0, reason };
    }
    const expirySlot = Number(currentValue);
    const inGracePeriod = currentSlot > expirySlot && currentSlot <= expirySlot + GRACE_PERIOD_N;
    const expired = currentSlot > expirySlot + GRACE_PERIOD_N;
    const expiresAt = new Date(Date.now() + (expirySlot - currentSlot) * MS_PER_SLOT_N).toISOString();
    const remainingDays = computeRemainingDays(expirySlot, currentSlot);
    if (expired) {
        return { valid: false, expiresAt, expirySlot, inGracePeriod: false, remainingDays, reason: 'License has expired' };
    }
    return {
        valid: true,
        expiresAt,
        expirySlot,
        inGracePeriod,
        remainingDays,
        reason: inGracePeriod ? 'License is in grace period — renew to avoid interruption' : null,
    };
}
//# sourceMappingURL=verifyCore.js.map