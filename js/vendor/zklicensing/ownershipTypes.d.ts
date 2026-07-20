/**
 * ownershipTypes.ts
 *
 * Types-only file shared by ownership.ts (Node-side: sign/verify with
 * node:crypto) and ownershipTokenVerify.ts (browser-side: verify with
 * WebCrypto). Kept import-free so bundlers pulling only the browser path
 * never pick up node:crypto or node:fs by accident.
 */
export type OwnershipTokenPayload = {
    v: 1;
    z: string;
    g: string;
    l: string;
    e: number;
    iat?: number;
    jti?: string;
};
//# sourceMappingURL=ownershipTypes.d.ts.map