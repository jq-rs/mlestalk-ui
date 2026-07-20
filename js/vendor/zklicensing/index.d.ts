/**
 * verifyLicense — client SDK.
 *
 * Calls the keeper's GET /verify until the on-chain refund window for the
 * license has closed; from that point on returns from a local anchor and
 * never touches the network again. The refund-window decision is server-
 * side: the keeper returns `refundWindowClosed: boolean` on its /verify
 * response, computed from its own record of `purchaseSlot + REFUND_WINDOW_N`
 * against the on-chain `currentSlot`. The SDK gates anchor writes on that
 * boolean and never trusts a `purchaseSlot` supplied by the local proof
 * file, so a user who forges their proof metadata cannot force the offline
 * branch prematurely.
 *
 * Anchor purity: every field persisted in the Anchor derives from the
 * keeper's /verify response — `anchoredSlot`, `expirySlot`, `ownership`.
 * The only client-supplied input to the offline branch is
 * `proof.expirySlot`, used solely as the loadAnchor binding key. A
 * tampered proof file therefore never gets a wrong answer; it gets no
 * offline branch at all and falls through to the keeper on every call.
 */
import { REFUND_WINDOW_N, GRACE_PERIOD_N } from './contractInterface.js';
declare const MS_PER_SLOT = 90000;
export interface Storage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export interface ActivationRecord {
    token: string;
    expiresAt: number;
    secretHash?: string;
}
export declare function loadActivation(storage: Storage, zkAppAddress: string, licenseHash: string, nowMs?: number): ActivationRecord | null;
export declare function saveActivation(storage: Storage, zkAppAddress: string, licenseHash: string, rec: ActivationRecord): void;
export interface ProofInput {
    licenseHash: string;
    zkAppAddress: string;
    expirySlot: number;
    verifierUrl?: string;
}
/**
 * Callback that proves an OwnershipChallenge using a stored secretHash.
 * Callers wire this up with their own o1js + LicenseProof imports so the SDK
 * stays dependency-free for the verify-only path. Return value is the
 * `proof.toJSON()` payload the verifier's POST /respond expects.
 */
export type TokenProver = (input: {
    licenseHash: string;
    nonce: string;
    secretHash: string;
}) => Promise<unknown>;
export interface VerifyOptions {
    verifierUrl?: string;
    storage?: Storage | null;
    fetcher?: typeof fetch;
    now?: () => number;
    prover?: TokenProver;
    secretHash?: string;
}
export interface VerifyResult {
    valid: boolean;
    expirySlot: number;
    expiresAt: string | null;
    currentSlot: number;
    inGracePeriod: boolean;
    remainingDays: number;
    reason: string | null;
    source: 'offline' | 'chain';
    ownership: 'verified' | 'unverified';
}
export declare function verifyLicense(proof: ProofInput, options?: VerifyOptions): Promise<VerifyResult>;
export { REFUND_WINDOW_N, GRACE_PERIOD_N, MS_PER_SLOT };
export { verifyOwnershipTokenClient } from './ownershipTokenVerify.js';
export type { OwnershipTokenPayload } from './ownershipTypes.js';
export { DEFAULT_OWNERSHIP_PUBKEYS } from './ownershipPubkeys.js';
//# sourceMappingURL=index.d.ts.map