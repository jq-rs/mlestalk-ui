export interface GenerationEntry {
    gen: number;
    zkAppAddress: string;
    status: 'retired' | 'live';
    frozenRoot?: string;
    deployedAt?: string;
    retiredAt?: string;
}
export interface GenerationInfo {
    /** Live-generation index (matches the entry with status: 'live'). Null when unverified or missing. */
    current: number | null;
    generations: GenerationEntry[];
    /** True iff signature verified against one of the pinned pubkeys. */
    verified: boolean;
}
export interface FetchGenerationRequest {
    keeperUrl: string;
    appId: string;
    /** Base64-encoded Ed25519 public keys pinned by the caller. Empty ⇒ verified:false. */
    pinnedPublicKeysBase64: readonly string[];
    fetcher?: typeof fetch;
    signal?: AbortSignal;
}
export interface FetchGenerationByAddressRequest {
    keeperUrl: string;
    /** Any zkApp address in the app's generation chain — current live or any retired. */
    zkAppAddress: string;
    /** Base64-encoded Ed25519 public keys pinned by the caller. Empty ⇒ verified:false. */
    pinnedPublicKeysBase64: readonly string[];
    fetcher?: typeof fetch;
    signal?: AbortSignal;
}
/**
 * GET /apps/:appId — returns { appId, current, generations, issuedAt, publicKey, signature }.
 * We reconstruct the canonical payload (everything except `publicKey` +
 * `signature`) and verify against the pin list. `publicKey` in the response
 * is advisory only — it's the key the keeper claims to have signed with;
 * the SDK never trusts it in place of a pin.
 */
export declare function fetchGenerationInfo(req: FetchGenerationRequest): Promise<GenerationInfo>;
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
export declare function fetchGenerationInfoByAddress(req: FetchGenerationByAddressRequest): Promise<GenerationInfo>;
//# sourceMappingURL=generationClient.d.ts.map