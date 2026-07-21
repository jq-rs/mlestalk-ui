export type LookupableApp = {
    zkAppAddress: string;
    deploymentHistory?: Array<{
        zkAppAddress: string;
    }>;
};
export declare function findAppByAnyAddress<T extends LookupableApp>(apps: readonly T[], zkAppAddress: string): T | undefined;
//# sourceMappingURL=appsLookup.d.ts.map