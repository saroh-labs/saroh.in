/**
 * The takings read Insights draws (DEC-075), as
 * `GET /organizations/:id/analytics/takings` sends it
 * (`apps/api.saroh.in/src/modules/analytics/takings.ts` has the rule).
 * Types only, so the pure figures and words can import them anywhere.
 *
 * Takings are money actually taken: paid orders, and paid invoices that
 * are not an order's own, each net of what went back, counted once, in the
 * week it was paid in the business's zone. Minor units (paise).
 */

/** Where money came from. */
export type TakingsPlaceKind = "LOCATION" | "ONLINE" | "INVOICES";

export interface TakingsPlace {
    key: string;
    kind: TakingsPlaceKind;
    /** A location's name; null for online and invoices. */
    name: string | null;
}

export interface TakingsWeek {
    /** Monday, `2026-09-14`. */
    start: string;
    /** Sunday, `2026-09-20`. */
    end: string;
    takingsMinor: number;
    /** What its paid orders took (the rest came by invoice). */
    orderTakingsMinor: number;
    orders: number;
    /** Paid orders and paid invoices. */
    payments: number;
    /** Largest first; a place that took nothing is left out. */
    places: { key: string; takingsMinor: number }[];
}

export interface TakingsRead {
    zone: string;
    currency: string | null;
    otherCurrencies: string[];
    /** The business's date of the first money it ever took; null for none. */
    firstSaleOn: string | null;
    /** Monday of the week in progress, which the weeks stop short of. */
    thisWeekStart: string;
    /** Open locations. */
    locations: number;
    places: TakingsPlace[];
    /** Twelve whole weeks, oldest first. */
    weeks: TakingsWeek[];
}

/**
 * One source of the Insights page: what came back, a role that may not
 * read it, or a read that failed — never an empty answer in place of a
 * failed one.
 */
export type SourceRead<T> =
    { status: "ok"; data: T } | { status: "denied" } | { status: "failed" };
