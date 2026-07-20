// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
function baseUrl(url) {
    return url.replace(/\/+$/, '');
}
export async function notifyBroadcast(req) {
    const fetcher = req.fetcher ?? fetch;
    try {
        await fetcher(`${baseUrl(req.keeperUrl)}/tx-broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: req.signal,
            body: JSON.stringify({ appId: req.appId, txHash: req.txHash }),
        });
    }
    catch (err) {
        req.onError?.(err);
    }
}
//# sourceMappingURL=txBroadcastClient.js.map