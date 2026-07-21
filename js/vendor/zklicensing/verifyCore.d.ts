import { type LicenseRecord } from './licenseStore.js';
export type VerifyResponse = {
    valid: boolean;
    expiresAt: string | null;
    expirySlot: number;
    inGracePeriod: boolean;
    remainingDays: number;
    reason: string | null;
};
/**
 * Core license verification.
 *
 * @param zkAppAddress - app address (composite key with licenseHash)
 * @param licenseHash  - Poseidon hash of the buyer's Ed25519 pubkey (see ownershipLicenseHash.ts) as a field string
 * @param records      - current off-chain license records (from licenseStore)
 * @param onChainRoot  - zkApp appState[0] fetched from Mina
 * @param currentSlot  - current blockchain slot (globalSlotSinceGenesis)
 */
export declare function verifyLicenseCore(params: {
    zkAppAddress: string;
    licenseHash: string;
    records: LicenseRecord[];
    onChainRoot: string;
    currentSlot: number;
}): VerifyResponse;
//# sourceMappingURL=verifyCore.d.ts.map