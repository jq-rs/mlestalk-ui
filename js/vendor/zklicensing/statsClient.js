// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
function baseUrl(url) {
    return url.replace(/\/+$/, '');
}
// Admin __all mode: pass `adminToken` and omit `vendorAddress` (or pass '__all').
// Fetches aggregate over every registered app. Server gates with Bearer auth.
// tzOffsetMinutes: signed minutes east of UTC — shifts tax-year cutovers on the
// countryBreakdown so a UK vendor's 2026 doesn't include a Dec 31 23:30 PST
// purchase. Default omitted → UTC bucketing preserved for existing callers.
export async function fetchVendorStats(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const headers = {};
    if (opts.adminToken)
        headers.Authorization = `Bearer ${opts.adminToken}`;
    else if (opts.vendorSessionToken)
        headers.Authorization = `VendorSession ${opts.vendorSessionToken}`;
    const tzQ = typeof opts.tzOffsetMinutes === 'number' ? `&tz=${opts.tzOffsetMinutes}` : '';
    const resp = await fetcher(`${baseUrl(opts.keeperUrl)}/stats?vendor=${encodeURIComponent(opts.vendorAddress)}${tzQ}`, { signal: opts.signal, headers });
    if (!resp.ok)
        return null;
    return await resp.json();
}
export async function fetchTransactions(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const headers = {};
    if (opts.adminToken)
        headers.Authorization = `Bearer ${opts.adminToken}`;
    else if (opts.vendorSessionToken)
        headers.Authorization = `VendorSession ${opts.vendorSessionToken}`;
    const qs = new URLSearchParams({ vendor: opts.vendorAddress });
    if (opts.from && opts.to) {
        qs.set('from', opts.from);
        qs.set('to', opts.to);
    }
    else {
        qs.set('days', String(opts.days ?? 30));
    }
    const resp = await fetcher(`${baseUrl(opts.keeperUrl)}/transactions?${qs.toString()}`, { signal: opts.signal, headers });
    if (!resp.ok)
        return null;
    return await resp.json();
}
// Admin all-apps mode: pass `adminToken` and set `vendorAddress` to '__all'.
// Hits GET /apps (no auth needed today; the admin overload just uses a
// different URL) so vendors visiting their own dashboard still hit the same
// per-vendor endpoint.
export async function fetchVendorApps(opts) {
    const fetcher = opts.fetcher ?? fetch;
    const headers = {};
    if (opts.adminToken)
        headers.Authorization = `Bearer ${opts.adminToken}`;
    else if (opts.vendorSessionToken)
        headers.Authorization = `VendorSession ${opts.vendorSessionToken}`;
    const url = opts.adminToken && opts.vendorAddress === '__all'
        ? `${baseUrl(opts.keeperUrl)}/apps?all=1`
        : `${baseUrl(opts.keeperUrl)}/apps/vendor/${encodeURIComponent(opts.vendorAddress)}`;
    const resp = await fetcher(url, { signal: opts.signal, headers });
    if (!resp.ok)
        return null;
    return await resp.json();
}
//# sourceMappingURL=statsClient.js.map