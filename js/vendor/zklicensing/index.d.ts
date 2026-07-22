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
}
export { createRefreshStateStore, runGuardedRefresh, createRefreshScheduler, DEFAULT_COOLDOWN_MIN_MS, DEFAULT_COOLDOWN_JITTER_MS, DEFAULT_MAX_REFRESH_DELAY_MS, } from './refreshScheduler.js';
export type { RefreshState, RefreshStateStore, RefreshStateStorage, RefreshOutcome, GuardedRefreshOpts, RefreshScheduler, RefreshSchedulerOpts, } from './refreshScheduler.js';
export declare function loadActivation(storage: Storage, zkAppAddress: string, licenseHash: string, nowMs?: number): ActivationRecord | null;
export declare function saveActivation(storage: Storage, zkAppAddress: string, licenseHash: string, rec: ActivationRecord): void;
export interface ProofInput {
    licenseHash: string;
    zkAppAddress: string;
    expirySlot: number;
    verifierUrl?: string;
}
/**
 * Callback that signs an ownership challenge with the buyer's Ed25519
 * keypair. The caller derives the keypair from the passphrase (via
 * `deriveOwnershipKeypair` in ./ownershipSignature.ts) and returns the
 * base64-encoded pubkey + signature. Keeping this abstract preserves the
 * SDK's zero-dependency verify path — vendors who never activate never
 * bundle the WebCrypto glue at all.
 *
 * Return shape matches POST /respond's ownership envelope exactly, so the
 * SDK forwards it verbatim.
 */
export type Signer = (input: {
    licenseHash: string;
    nonce: string;
    zkAppAddress: string;
}) => Promise<{
    pubKey: string;
    signature: string;
}>;
export interface VerifyOptions {
    verifierUrl?: string;
    storage?: Storage | null;
    fetcher?: typeof fetch;
    now?: () => number;
    signer?: Signer;
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
    activationRefreshFailed?: boolean;
}
export declare function __setJitterSampler(fn: () => number): void;
export declare function verifyLicense(proof: ProofInput, options?: VerifyOptions): Promise<VerifyResult>;
export { REFUND_WINDOW_N, GRACE_PERIOD_N, MS_PER_SLOT };
export { verifyOwnershipTokenClient } from './ownershipTokenVerify.js';
export type { OwnershipTokenPayload } from './ownershipTypes.js';
export { DEFAULT_OWNERSHIP_PUBKEYS } from './ownershipPubkeys.js';
//# sourceMappingURL=index.d.ts.map