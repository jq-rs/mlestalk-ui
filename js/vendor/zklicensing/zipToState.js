// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * zipToState.ts
 *
 * US ZIP-code prefix → 2-letter state code lookup. Used by countryStats.ts to
 * roll US buyers up into per-state buckets for sales-tax reporting. Prefix is
 * the first three digits of the ZIP; every US ZIP starts with three digits
 * that resolve to exactly one state (source: USPS ZIP Code Directory).
 *
 * Data model: inclusive [lo, hi] prefix ranges → state code. Ranges are
 * ordered by lo for readability but the lookup does a linear scan since the
 * table is small (~55 rows) and this runs once per record on a background
 * aggregation, not in a hot loop.
 *
 * Coverage: 50 states, DC, military APO/FPO (AA/AE/AP), Puerto Rico (PR), Guam
 * and adjacent Pacific territories (GU). US Virgin Islands (VI), American
 * Samoa (AS), and Northern Mariana Islands (MP) share prefixes with the
 * Pacific block; we return 'GU' for that range — good enough for
 * digital-goods reporting where those territories don't have their own tax.
 * Returns undefined for prefixes that don't map (very few — USPS reserves
 * some for future assignment).
 */
const RANGES = [
    [5, 5, 'NY'],
    [6, 9, 'PR'],
    [10, 27, 'MA'],
    [28, 29, 'RI'],
    [30, 38, 'NH'],
    [39, 49, 'ME'],
    [50, 59, 'VT'],
    [60, 69, 'CT'],
    [70, 89, 'NJ'],
    [90, 99, 'AE'],
    [100, 149, 'NY'],
    [150, 196, 'PA'],
    [197, 199, 'DE'],
    [200, 205, 'DC'],
    [206, 219, 'MD'],
    [220, 246, 'VA'],
    [247, 268, 'WV'],
    [270, 289, 'NC'],
    [290, 299, 'SC'],
    [300, 319, 'GA'],
    [320, 349, 'FL'],
    [350, 369, 'AL'],
    [370, 385, 'TN'],
    [386, 397, 'MS'],
    [398, 399, 'GA'],
    [400, 427, 'KY'],
    [430, 459, 'OH'],
    [460, 479, 'IN'],
    [480, 499, 'MI'],
    [500, 528, 'IA'],
    [530, 549, 'WI'],
    [550, 567, 'MN'],
    [570, 577, 'SD'],
    [580, 588, 'ND'],
    [590, 599, 'MT'],
    [600, 629, 'IL'],
    [630, 658, 'MO'],
    [660, 679, 'KS'],
    [680, 693, 'NE'],
    [700, 714, 'LA'],
    [716, 729, 'AR'],
    [730, 749, 'OK'],
    [750, 799, 'TX'],
    [800, 816, 'CO'],
    [820, 831, 'WY'],
    [832, 838, 'ID'],
    [840, 847, 'UT'],
    [850, 865, 'AZ'],
    [870, 884, 'NM'],
    [889, 898, 'NV'],
    [900, 961, 'CA'],
    [962, 966, 'AP'],
    [967, 968, 'HI'],
    [969, 969, 'GU'],
    [970, 979, 'OR'],
    [980, 994, 'WA'],
    [995, 999, 'AK'],
];
export function zipToState(zip) {
    const m = /^(\d{3})/.exec(zip);
    if (!m)
        return undefined;
    const n = parseInt(m[1], 10);
    for (const [lo, hi, st] of RANGES) {
        if (n >= lo && n <= hi)
            return st;
    }
    return undefined;
}
//# sourceMappingURL=zipToState.js.map