/**
 * vendorAccountClient.ts
 *
 * Browser-safe client for the vendor's shared legal/billing block —
 * the fields that must stay consistent across every app registered by
 * one vendor wallet (legal entity name, billing country and address,
 * VAT id, company registry). One PATCH updates all of the vendor's
 * apps atomically on the keeper, so a legal-entity rename or address
 * move doesn't leave old apps advertising stale CRD Art. 6 disclosures.
 *
 * Signature covers the vendor address, mirroring the "sign the
 * resource id" pattern PUT /apps/:appId uses. The keeper verifies
 * against the on-chain vendor recorded on the app records.
 */
export type VendorLegalBlock = {
    country?: string;
    legalName?: string;
    billingAddress?: {
        line1: string;
        line2?: string;
        city: string;
        postalCode: string;
    };
    invoiceEmail?: string;
    vatId?: string;
    companyRegistrationRegistry?: string;
    companyRegistrationNumber?: string;
};
export type GetVendorLegalRequest = {
    keeperUrl: string;
    vendorAddress: string;
    vendorSessionToken: string;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type GetVendorLegalResponse = {
    legal: VendorLegalBlock | null;
};
export type UpdateVendorLegalRequest = {
    keeperUrl: string;
    vendorAddress: string;
    signature: {
        field: string;
        scalar: string;
    };
    payload: VendorLegalBlock;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
};
export type UpdateVendorLegalResponse = {
    ok: true;
    appsUpdated: number;
};
export declare function getVendorLegal(req: GetVendorLegalRequest): Promise<GetVendorLegalResponse>;
export declare function updateVendorLegal(req: UpdateVendorLegalRequest): Promise<UpdateVendorLegalResponse>;
//# sourceMappingURL=vendorAccountClient.d.ts.map