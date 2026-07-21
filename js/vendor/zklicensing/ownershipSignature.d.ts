/**
 * HKDF-SHA256 with empty salt and a fixed domain-separation info string.
 * Deterministic: same passphrase → same 32-byte seed. Consumers should
 * not depend on the specific derivation beyond determinism — the info
 * string is versioned (`v1`) so we can rotate the KDF later without
 * silent collision with old outputs.
 */
export declare function deriveSeed(passphrase: string): Promise<Uint8Array>;
export type OwnershipKeypair = {
    privateKey: CryptoKey;
    publicKeyRaw: Uint8Array;
    publicKeyBase64: string;
};
/**
 * Derive an Ed25519 keypair deterministically from a passphrase.
 *
 * Extractable=true on the private key so we can pull the public key out
 * via JWK export (WebCrypto's Ed25519 doesn't expose the pubkey from a
 * private-only PKCS8 import any other way). Not a security regression:
 * the seed is deterministically re-derivable from the passphrase, so
 * "the private key is extractable" is dominated by "the passphrase IS
 * the secret." Callers should keep the returned CryptoKey scoped to the
 * activation call and let it be GC'd rather than persisting it.
 */
export declare function deriveOwnershipKeypair(passphrase: string): Promise<OwnershipKeypair>;
export type ChallengeMessage = {
    licenseHash: string;
    nonce: string;
    zkAppAddress: string;
};
/**
 * Canonical byte serialization of the challenge message. NUL separator
 * gives an unambiguous boundary between fields — none of the fields'
 * current encodings (Field decimals, base58 addresses) can legitimately
 * contain NUL. The full serialized form is what both signer and
 * verifier hash into the Ed25519 signature.
 */
export declare function serializeChallenge(msg: ChallengeMessage): Uint8Array;
export declare function signChallenge(privateKey: CryptoKey, msg: ChallengeMessage): Promise<Uint8Array>;
/**
 * Verify an Ed25519 signature over a challenge message. Returns false
 * (never throws) for any failure — malformed pubkey, malformed
 * signature, wrong length, actual signature mismatch. Callers get a
 * single go/no-go decision without having to distinguish "invalid" from
 * "unparseable."
 */
export declare function verifyChallenge(publicKeyRaw: Uint8Array, msg: ChallengeMessage, signature: Uint8Array): Promise<boolean>;
export declare function encodeBase64(bytes: Uint8Array): string;
export declare function decodeBase64(b64: string): Uint8Array;
//# sourceMappingURL=ownershipSignature.d.ts.map