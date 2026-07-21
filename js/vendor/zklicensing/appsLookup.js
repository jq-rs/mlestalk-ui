// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
export function findAppByAnyAddress(apps, zkAppAddress) {
    return apps.find(a => a.zkAppAddress === zkAppAddress ||
        (a.deploymentHistory ?? []).some(d => d.zkAppAddress === zkAppAddress));
}
//# sourceMappingURL=appsLookup.js.map