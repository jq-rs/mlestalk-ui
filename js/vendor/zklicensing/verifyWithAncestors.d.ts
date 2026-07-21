import { type VerifyResponse } from './verifyCore.js';
import { type LicenseRecord } from './licenseStore.js';
import type { LookupableApp } from './appsLookup.js';
export type VerifyWithAncestorsInput = {
    appRecord: LookupableApp;
    licenseHash: string;
    currentSlot: number;
    currentLiveRoot: string;
    records: LicenseRecord[];
};
export type VerifyWithAncestorsResult = {
    result: VerifyResponse;
    resolvedAddress: string;
    onChainRoot: string;
    liveRecords: LicenseRecord[];
};
export declare function verifyLicenseWithAncestors(input: VerifyWithAncestorsInput): Promise<VerifyWithAncestorsResult>;
//# sourceMappingURL=verifyWithAncestors.d.ts.map