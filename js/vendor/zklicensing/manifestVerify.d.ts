/**
 * manifestVerify.ts
 *
 * Browser + Node Ed25519 signature verification for platform-signed manifests
 * (currently: the generation-list served at GET /apps/:appId, next: the
 * sales-freeze manifest). The keeper signs with the platform manifest key
 * loaded via PLATFORM_MANIFEST_KEY_FILE; the SDK pins the public key against
 * a caller-supplied allow-list and verifies before trusting anything.
 *
 * Runtime: browsers and Node ≥ 20 expose `globalThis.crypto.subtle`. The
 * SDK's `engines.node` is `>=20` for this reason — Node 18 child workers
 * (spawned by `node --test`) do not populate `globalThis.crypto`.
 *
 * Canonicalization must match `src/manifestSign.ts` byte-for-byte:
 *   - sorted object keys
 *   - no whitespace
 *   - arrays preserved in order
 * Any divergence silently breaks verification, so keep the algorithm dead
 * simple and mirrored.
 */
export declare function canonicalize(value: unknown): string;
/**
 * Verify a base64 Ed25519 signature over a canonicalized payload against
 * one of the pinned base64 public keys. Returns true iff at least one
 * pinned key verifies. Fails closed on any error (unknown key format,
 * WebCrypto rejection, missing subtle) — callers must interpret `false`
 * as "do not trust."
 */
export declare function verifyManifestSignature(payload: unknown, signatureBase64: string, pinnedPublicKeysBase64: readonly string[]): Promise<boolean>;
//# sourceMappingURL=manifestVerify.d.ts.map