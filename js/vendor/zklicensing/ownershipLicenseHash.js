// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * ownershipLicenseHash.ts
 *
 * Field-side binding between the buyer's Ed25519 pubkey and the
 * `licenseHash` Field stored on-chain. The keeper's /respond handler and
 * the buy client both compute this from the raw 32-byte pubkey and assert
 * equality against the `licenseHash` the buyer originally sent to /prove
 * /buy — that mutual assertion is what proves knowledge of the passphrase
 * without ever showing the passphrase to the network.
 *
 * Kept in its own module (not in ownershipSignature.ts) so vendor apps
 * that only need to sign a challenge on device can import
 * ownershipSignature.ts without pulling o1js into their client bundle.
 * Only the /prove/buy and /respond surfaces — which already need o1js for
 * other reasons — import this file.
 */
import { Encoding, Poseidon } from '../o1js/index.js';
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
export function licenseHashFromPubkey(publicKeyRaw) {
    if (publicKeyRaw.length !== 32) {
        throw new Error(`Ed25519 pubkey must be 32 bytes, got ${publicKeyRaw.length}`);
    }
    const fields = Encoding.bytesToFields(publicKeyRaw);
    return Poseidon.hash(fields).toString();
}
//# sourceMappingURL=ownershipLicenseHash.js.map