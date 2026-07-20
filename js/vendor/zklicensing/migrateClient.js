// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * migrateClient.ts
 *
 * Browser-safe client for /prove/migrate. Assembles a single-hop cross-
 * generation proof against the current live map — the keeper walks the
 * deploymentHistory once, gathers all three witnesses (ancestor / pred /
 * live-empty), and returns a signable tx.
 *
 * Failure surfaces:
 *   - 404 "license refunded or unknown": no leaf anywhere in history for
 *     this licenseHash. Caller should not retry — it's terminal.
 *   - 409 "already migrated": leaf is present in the live map. Caller
 *     should refresh their license record and stop.
 *   - 409 "proving queue busy": another root-mutating request (buy, renew,
 *     migrate) is holding this app's in-flight slot. Thrown as the shared
 *     ProveQueueBusyError so callers can wait+retry uniformly across the
 *     three endpoints.
 */
import { readErrorBody, tryQueueBusyFromBody } from './proveErrors.js';
/**
 * Terminal migrate failures (404 refunded/unknown, 409 already migrated).
 * The queue-busy 409 is surfaced separately as ProveQueueBusyError so
 * callers can share one retry helper across buy/renew/migrate.
 */
export class ProveMigrateError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.name = 'ProveMigrateError';
        this.status = status;
    }
}
function baseUrl(url) {
    return url.replace(/\/+$/, '');
}
export async function proveMigrate(req) {
    const fetcher = req.fetcher ?? fetch;
    const resp = await fetcher(`${baseUrl(req.keeperUrl)}/prove/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
            licenseHash: req.licenseHash,
            appId: req.appId,
            buyerAddress: req.buyerAddress,
        }),
    });
    if (!resp.ok) {
        const parsed = await readErrorBody(resp);
        const queueBusy = tryQueueBusyFromBody(parsed);
        if (queueBusy)
            throw queueBusy;
        throw new ProveMigrateError(parsed.message, resp.status);
    }
    return await resp.json();
}
//# sourceMappingURL=migrateClient.js.map