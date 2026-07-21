// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * contractInterface.ts
 *
 * Public contract interface: event Structs, slot/grace constants, duration
 * helpers, and a minimal `LicensingAppEventsContract` SmartContract subclass
 * that has the events declaration but no @method bodies.
 *
 * The full `LicensingApp` (with provable method bodies) lives in the private
 * zklicensing-app package; only the things needed to decode events and reason
 * about durations are published here so a public verify service can replay
 * the archive without pulling in the contract source.
 *
 * `CANONICAL_VK_HASH` is the verification-key hash of the published
 * `LicensingApp` circuit. Bump it whenever the on-chain zkApp changes
 * and rerun the keeper's boot assertion (see zklicensing-app/src/keeperService.ts)
 * / the verify service's `ensureCompiled()` check to catch drift.
 */
import { declareState, fetchAccount, Field, PublicKey, SmartContract, Struct, UInt32, UInt64, MerkleMap } from '../o1js/index.js';
// ------------------------------------------------------------
// EVENT STRUCTS
// ------------------------------------------------------------
// Struct() returns a class whose type references o1js internals that fall
// outside this package's rootDir (npm hoists o1js to the workspace root).
// Annotating each export as `any` keeps tsc from inferring (and therefore
// emitting) those internal type references. Consumers get full typing through
// the hand-written contractInterface.d.ts shim.
//
// The clean alternative — `export class X extends Struct({...}) {}` as the
// mina-fungible-token repo does — only works when o1js sits inside rootDir,
// which a workspace member can't guarantee.
export const LicenseIssuedEvent = Struct({
    licenseHash: Field,
    buyer: PublicKey,
    amount: UInt64,
    slot: UInt32,
    expirySlot: UInt32,
});
export const ExpiryUpdateEvent = Struct({
    licenseHash: Field,
    newExpiry: UInt32,
});
export const PriceUpdatedEvent = Struct({
    priceMonthly: UInt64,
    priceYearly: UInt64,
    priceFiveYear: UInt64,
});
export const AppCreatedEvent = Struct({
    vendor: PublicKey,
});
// Emitted by `migrateLicense` when a license issued under an ancestor
// deployment is re-minted into this deployment at zero payment. `licenseHash`
// is stable across all deployments because the buyer's derived hash is what
// identifies the license; `expirySlot` is copied verbatim from the ancestor's
// licensesRoot entry; `ancestorGen` is the generation index the migration
// resolved against (needed so archive replay and auditors can trace which
// frozen root supplied the entry — skip-generation migrations are one-hop).
export const LicenseMigratedEvent = Struct({
    licenseHash: Field,
    expirySlot: UInt32,
    ancestorGen: UInt32,
});
// ------------------------------------------------------------
// CONSTANTS (slot math — 90 s/slot after Mesa upgrade)
// ------------------------------------------------------------
export const MONTHLY_SLOTS_N = 28_800; // 30 days × 24 × 40
export const ONE_YEAR_SLOTS_N = 350_640; // 365.25 days × 24 × 40 (Julian year)
export const FIVE_YEAR_SLOTS_N = 1_753_200; // 5 × ONE_YEAR_SLOTS_N
export const REFUND_WINDOW_N = 13_440;
export const GRACE_PERIOD_N = 6_720;
export const MS_PER_SLOT_N = 90_000; // Mesa slot duration in ms
export const SLOTS_PER_DAY_N = 960; // 86_400_000 / MS_PER_SLOT_N
// Slot tolerance for the globalSlotSinceGenesis precondition. Applied uniformly to
// every method that reads currentSlot. 40 slots × 90 s = 1 hour — sized to
// clear the honest-user prove+wallet+mempool latency envelope. The refund vs
// release windows stay disjoint by construction: requestRefund asserts against
// the lower bound (currentSlot ≤ purchaseSlot + REFUND_WINDOW), releaseFunds
// asserts against a threshold shifted by +TOLERANCE_WINDOW so neither can
// land on the same real slot as the other. See AUDIT_BRIEF.md §7.
export const TOLERANCE_WINDOW_N = 40;
export const EMPTY = Field(0);
export const EMPTY_ROOT = new MerkleMap().getRoot();
// ------------------------------------------------------------
// DURATION HELPERS
// ------------------------------------------------------------
export const DURATION_LABELS = ['1 Month', '1 Year', '5 Years'];
export const DURATION_INDEX = { '1 Month': 0, '1 Year': 1, '5 Years': 2 };
export function durationSlotsFromLabel(label) {
    if (label === '1 Month')
        return MONTHLY_SLOTS_N;
    if (label === '1 Year')
        return ONE_YEAR_SLOTS_N;
    if (label === '5 Years')
        return FIVE_YEAR_SLOTS_N;
    return null;
}
export function durationIndexFromLabel(label) {
    if (label === '1 Month')
        return 0;
    if (label === '1 Year')
        return 1;
    if (label === '5 Years')
        return 2;
    return null;
}
export function durationLabelFromIndex(idx) {
    return DURATION_LABELS[idx] ?? null;
}
// ------------------------------------------------------------
// EVENTS-ONLY CONTRACT
//
// A SmartContract subclass with the same `events: { ... }` declaration as
// LicensingApp but no `@method` bodies. Used by archive-replay code to call
// `.fetchEvents()` without depending on the private circuit source.
// ------------------------------------------------------------
export class LicensingAppEventsContract extends SmartContract {
    events = {
        appCreated: AppCreatedEvent,
        licenseIssued: LicenseIssuedEvent,
        licenseIssuedNoEscrow: LicenseIssuedEvent,
        licenseRenewed: ExpiryUpdateEvent,
        licenseMigrated: LicenseMigratedEvent,
        refundIssued: Field,
        fundsReleased: Field,
        priceUpdated: PriceUpdatedEvent,
    };
}
// State-slot layout mirrors LicensingApp's declareState(). Read-only from here
// — no @method bodies exist. Consumers use `.version.get()`, `.licensesRoot.get()`
// etc. after fetchAccount(). `pricesPacked` is a single Field with the three
// UInt64 tier prices packed as [pM | pY<<64 | pF<<128]; unpack with
// `unpackPrices` if you need the individual tiers off-chain.
declareState(LicensingAppEventsContract, {
    licensesRoot: Field,
    vendor: PublicKey,
    escrowRoot: Field,
    pricesPacked: Field,
    version: UInt32,
    ancestorsRoot: Field,
});
// Off-chain mirror of the in-circuit price packing (see LicensingApp.ts). Kept
// here so the events service can decode `pricesPacked` slots without pulling
// the private contract source.
export function unpackPrices(packed) {
    const raw = packed.toBigInt();
    const mask = (1n << 64n) - 1n;
    return {
        priceMonthly: UInt64.from(raw & mask),
        priceYearly: UInt64.from((raw >> 64n) & mask),
        priceFiveYear: UInt64.from((raw >> 128n) & mask),
    };
}
// ------------------------------------------------------------
// SUPPORTED SOURCE VERSIONS
//
// On-chain `version` slot is set at init() and can never change (setPermissions
// is impossible; setVerificationKey is impossibleDuringCurrentVersion). A
// keeper / verifier that only understands v1 state decodes must refuse to serve
// a zkApp deployed from a different source revision — otherwise it could
// mis-decode events or feed a stale state format to the verifier.
//
// Add new versions here once the corresponding decoder / verifier code path
// lands. Never remove: dropping a version is a support-removal decision that
// belongs in a release note, not silent breakage.
// ------------------------------------------------------------
export const SUPPORTED_LICENSING_APP_VERSIONS = [1];
// Read the immutable `version` slot from a deployed LicensingApp. Returns null
// when the account is not (yet) a zkApp — caller decides whether to retry
// (deploy still pending) or reject (wrong address).
export async function fetchLicensingAppVersion(zkAppAddress) {
    const pub = PublicKey.fromBase58(zkAppAddress);
    await fetchAccount({ publicKey: pub });
    const contract = new LicensingAppEventsContract(pub);
    try {
        const v = contract.version.get();
        return Number(v.toString());
    }
    catch {
        return null;
    }
}
// ------------------------------------------------------------
// CANONICAL VK HASHES
//
// Per-generation, append-only. The keeper boots with `LicensingApp.compile()`
// and asserts the resulting VK hash matches `CANONICAL_VK_HASH` (the current
// generation's row); the verify service resolves an address's generation via
// AppRecord.deploymentHistory and asserts the on-chain VK hash matches
// `CANONICAL_VK_HASHES[generation]`. Retired-generation licenses (e.g. a
// 5-year buyer whose license lives on v1 after the platform bumped to v2/v3)
// continue to verify because the historical row is still present. A genuine
// old circuit deployed at a fresh address fails: the address is not in any
// `deploymentHistory[]`, so the resolver returns null and verify rejects.
//
// Rules:
//   - Append the new generation's row at each hardfork migration; never
//     delete historical rows.
//   - Bump `CURRENT_GENERATION` to the new key alongside the row.
//   - `CANONICAL_VK_HASH` is derived from the record — drift test and keeper
//     boot-assert are unchanged.
// ------------------------------------------------------------
export const CANONICAL_VK_HASHES = {
    1: '8380713395198105004709629742590481719045223404635446983829642411637960196723',
    // 2: '…' — append at each hardfork migration, never delete.
};
export const CURRENT_GENERATION = 1;
export const CANONICAL_VK_HASH = CANONICAL_VK_HASHES[CURRENT_GENERATION];
//# sourceMappingURL=contractInterface.js.map