// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * licenseProof.ts — ZkProgram for ownership challenge-response.
 *
 * Loaded only when the caller needs to *produce* an ownership proof on the
 * client (the verify path never imports this file). Lives in a dedicated
 * subpath (`zklicensing/prove`) so the verify-only entry stays free of o1js.
 *
 * Proves: Poseidon.hash([secretHash]) === licenseHash
 * where  secretHash = Poseidon.hash(Encoding.stringToFields(rawSecret)).
 *
 * The nonce sits in the public input. Its sole purpose is replay-resistance:
 * a proof generated for nonce A is mathematically distinct from one for nonce
 * B, so a verifier that issued nonce A will reject any proof not produced for
 * exactly that challenge.
 */
import { ZkProgram, Field, Poseidon, Struct } from '../o1js/index.js';
// Struct() / ZkProgram / ZkProgram.Proof() return types reference o1js
// internal paths outside this package's rootDir, triggering TS2742 on
// declaration emit. Annotating each export as `any` suppresses the inference;
// consumers get real types via the hand-written licenseProof.d.ts shim.
// See contractInterface.ts for the longer rationale on why this workaround.
export const OwnershipChallenge = Struct({
    licenseHash: Field,
    nonce: Field,
});
export const LicenseProof = ZkProgram({
    name: 'license-proof',
    publicInput: OwnershipChallenge,
    methods: {
        prove: {
            privateInputs: [Field], // secretHash — never sent anywhere
            async method(pub, secretHash) {
                Poseidon.hash([secretHash]).assertEquals(pub.licenseHash);
            },
        },
    },
});
export const LicenseProofProof = ZkProgram.Proof(LicenseProof);
//# sourceMappingURL=licenseProof.js.map