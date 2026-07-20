import { MerkleMap, MerkleMapWitness } from 'o1js';
import { type LicenseRecord as _LicenseRecord, type LicenseStatus as _LicenseStatus } from './licenseRecord.js';
export type LicenseRecord = _LicenseRecord;
export type LicenseStatus = _LicenseStatus;
export declare const PENDING_REAP_SLOTS = 60;
export declare function licenseStorePath(): string;
export declare function readRecords(): Promise<LicenseRecord[]>;
export declare function buildMap(records: LicenseRecord[], zkAppAddress: string): MerkleMap;
export declare function buildEscrowMap(records: LicenseRecord[], zkAppAddress: string): MerkleMap;
export declare function serializeWitness(witness: MerkleMapWitness): {
    isLefts: boolean[];
    siblings: string[];
};
export declare function deserializeWitness(json: {
    isLefts: boolean[];
    siblings: string[];
}): MerkleMapWitness;
export declare function getWitness(zkAppAddress: string, licenseHash: string): Promise<{
    root: string;
    currentValue: string;
    witness: MerkleMapWitness;
    serialized: ReturnType<typeof serializeWitness>;
}>;
export declare function getLicense(zkAppAddress: string, licenseHash: string): Promise<LicenseRecord | null>;
export declare function licenseStatus(record: LicenseRecord | null, currentSlot: number): LicenseStatus;
export declare function upsertLicense(record: LicenseRecord): Promise<void>;
export declare function updateExpiry(zkAppAddress: string, licenseHash: string, expirySlot: number, opts?: {
    markRenewed?: boolean;
    renewal?: {
        slot: number;
        amount: string;
        newExpiry: number;
        txHash?: string;
    };
}): Promise<boolean>;
export declare function recordRefund(zkAppAddress: string, licenseHash: string): Promise<boolean>;
export declare function recordRelease(zkAppAddress: string, licenseHash: string, releaseSlot?: number, txHash?: string): Promise<boolean>;
export declare function confirmRecord(zkAppAddress: string, licenseHash: string): Promise<boolean>;
export declare function applyLicenseIssued(zkAppAddress: string, licenseHash: string, fields: {
    expirySlot: number;
    purchaseSlot: number;
    purchaseAmount: string;
    tier?: 'monthly' | 'yearly' | 'fiveYear';
    escrowless?: boolean;
}): Promise<void>;
export declare function applyLicenseRenewed(zkAppAddress: string, licenseHash: string, fields: {
    newExpiry: number;
}): Promise<boolean>;
export declare function deleteRecord(zkAppAddress: string, licenseHash: string): Promise<boolean>;
export declare function getStalePendingRecords(currentSlot: number, maxAgeSlots?: number): Promise<LicenseRecord[]>;
export declare function getReleasableRecords(currentSlot: number): Promise<LicenseRecord[]>;
//# sourceMappingURL=licenseStore.d.ts.map