// Hand-written declarations for licenseProof.ts.
// tsc can't emit these automatically because the inferred return types of
// Struct() and ZkProgram() reference internal o1js paths outside this
// package's rootDir, triggering TS2742. Callers get full typing on the
// methods they actually invoke by importing the corresponding o1js types
// directly (Field, Proof, etc.) in their own code.

export const OwnershipChallenge: any;
export type OwnershipChallenge = any;

export const LicenseProof: any;

export class LicenseProofProof {
  static publicInputType: any;
  static publicOutputType: any;
  static fromJSON(json: any): Promise<LicenseProofProof>;
  static dummy(...args: any[]): Promise<LicenseProofProof>;
  publicInput: any;
  publicOutput: any;
  proof: any;
  maxProofsVerified: 0 | 1 | 2;
  shouldVerify: any;
  verify(): void;
  verifyIf(condition: any): void;
  toJSON(): { publicInput: string[]; publicOutput: string[]; maxProofsVerified: 0 | 1 | 2; proof: string };
}
