/**
 * A business's legal form (F10, default 60): the design's six, or none.
 *
 * Until F10 there were two, `individual` and `company`. Today's `company`
 * is a private limited company, spelled `pvt` from now on. The rename runs
 * readers first (release boundary 9), because the API before F10 refuses
 * `pvt`:
 *
 *   1. This release reads and accepts both spellings, and still STORES
 *      `company`, so a rollback leaves no row the previous release can't
 *      read, and the app sends `company` for Private limited.
 *   2. The follow-up (F10b) stores `pvt`, has the app send it, and moves
 *      the stored `company` rows to `pvt` in a migration.
 *   3. Z4, a release after that, stops accepting `company`.
 */

/** The legal forms a business may be, in the design's order. */
export const BUSINESS_TYPES = [
    "individual",
    "partnership",
    "llp",
    "pvt",
    "public",
    "trust",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/** The old spelling of `pvt`, accepted and stored until F10b (see above). */
export const LEGACY_PRIVATE_LIMITED = "company";

/** Every spelling a request may carry. */
export const ACCEPTED_BUSINESS_TYPES = [
    ...BUSINESS_TYPES,
    LEGACY_PRIVATE_LIMITED,
] as const;
export type AcceptedBusinessType = (typeof ACCEPTED_BUSINESS_TYPES)[number];

/**
 * What a save stores for a type sent: "" clears it, and a private limited
 * company is kept as `company` for one more release (step 1 above).
 */
export function businessTypeWrite(
    type: string | null | undefined,
): string | null | undefined {
    if (type === undefined) return undefined;
    if (type === null || type === "") return null;
    return type === "pvt" ? LEGACY_PRIVATE_LIMITED : type;
}

/**
 * A stored type in today's vocabulary: `company` reads as `pvt`, so the
 * audit stream says one thing whichever spelling a row holds.
 */
export function businessTypeRead(
    type: string | null | undefined,
): string | null {
    if (!type) return null;
    return type === LEGACY_PRIVATE_LIMITED ? "pvt" : type;
}
