// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
// Baked-in ownership-token pubkeys. Two entries from day one — active
// primary + pinned standby — so an emergency rotation is a single verify-
// service restart on the platform side, not a coordinated vendor-app
// rebuild.
//
// Vendors that want stricter control (pin their own list, out-of-band
// verification, air-gapped review) pass their own array to
// verifyOwnershipTokenClient and ignore this default entirely.
//
// Rotation cadence for this list is coupled to SDK release cadence.
// Retiring a pubkey = SDK patch release. Vendors on a semver caret
// range pick it up on their next `npm install`. See the top-level
// README's "Ownership token signing key" section for the operator
// runbook.
export const DEFAULT_OWNERSHIP_PUBKEYS = [
    // Active primary. Private key held at OWNERSHIP_KEY_PATH on the
    // verify-service host.
    'DFje72rZM5d9qAHotBwmuEbrHPgSBKrScfIzLBVWSio=',
    // Pinned standby. Private key held in cold storage; not present on the
    // verify-service host. Emergency rotation cuts over to this key.
    'UJYBe8MGIa81dIJ/8Q+FwNuzLqGmUscUJy2vew3BkPM=',
];
//# sourceMappingURL=ownershipPubkeys.js.map