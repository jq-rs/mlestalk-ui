/**
 * Derive the Field-side `licenseHash` from an Ed25519 raw pubkey.
 *
 * `Encoding.bytesToFields(32B)` packs the pubkey into 2 Pallas Fields
 * (Pallas Fp is ~254 bits, so 32B = 256b does not fit in one). Poseidon
 * hashes those 2 fields into a single Field, matching the on-chain shape
 * of every other `licenseHash` used by LicensingApp — which treats
 * licenseHash as an opaque Field commitment, so the on-chain contract
 * doesn't care that the preimage is a pubkey rather than the previous
 * Poseidon(passphrase) chain.
 */
export declare function licenseHashFromPubkey(publicKeyRaw: Uint8Array): string;
//# sourceMappingURL=ownershipLicenseHash.d.ts.map