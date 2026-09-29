/**
 * A business's legal form (F10, default 60): the design's six, or none.
 *
 * Until F10 there were two, `individual` and `company`. Today's `company`
 * is a private limited company, spelled `pvt` from now on. The rename runs
 * readers first (release boundary 9), because the API before F10 refuses
 * `pvt`:
 *
 *   1. F10 read and accepted both spellings, and still STORED `company`,
 *      so a rollback left no row the release before it couldn't read.
 *   2. F10b (this release) stores `pvt` for either spelling, answers a
 *      stored `company` as `pvt`, and the app sends `pvt`. The backfill
 *      `packages/database/src/backfill/business-type-pvt.cli.ts` moves the
 *      stored `company` rows to `pvt` once this API serves. F10's API reads
 *      a `pvt` row, so rolling back to it is safe.
 *   3. Z4, a release after this, stops accepting `company`.
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

/** The old spelling of `pvt`, still accepted (mapped to `pvt`) until Z4. */
export const LEGACY_PRIVATE_LIMITED = "company";

/** Every spelling a request may carry. */
export const ACCEPTED_BUSINESS_TYPES = [
    ...BUSINESS_TYPES,
    LEGACY_PRIVATE_LIMITED,
] as const;
export type AcceptedBusinessType = (typeof ACCEPTED_BUSINESS_TYPES)[number];

/**
 * What a save stores for a type sent: "" clears it, and an old client's
 * `company` is stored as `pvt` (step 2 above).
 */
export function businessTypeWrite(
    type: string | null | undefined,
): string | null | undefined {
    if (type === undefined) return undefined;
    if (type === null || type === "") return null;
    return type === LEGACY_PRIVATE_LIMITED ? "pvt" : type;
}

/**
 * A stored type in today's vocabulary: `company` reads as `pvt`, so the
 * settings answer and the audit stream say one thing whichever spelling a
 * row holds until the backfill has run.
 */
export function businessTypeRead(
    type: string | null | undefined,
): string | null {
    if (!type) return null;
    return type === LEGACY_PRIVATE_LIMITED ? "pvt" : type;
}
