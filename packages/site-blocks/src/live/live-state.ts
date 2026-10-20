/**
 * Live facts on cached pages (DEC-172, plan U8, #1042): the rule that says
 * what a fact read in the browser may show, kept pure so it is tested
 * without a page, a clock or a network.
 *
 * A merchant's page is kept in the page cache and sent to every visitor
 * alike, so nothing that changes by the minute ("Next free", "3 places
 * left", "Open now") is in its HTML. Each is read in the visitor's browser
 * and shown only while it is true:
 *
 * - **loading**: nothing read yet. The fact keeps its height and shows no
 *   number (no shimmer).
 * - **fresh**: read within {@link FRESH_FOR_MS}. Shown.
 * - **refreshing**: fresh, and a new read is on its way. Shown as fresh.
 * - **stale**: the last answer is older than {@link FRESH_FOR_MS} and a
 *   new one has not come (the tab was hidden, or the read is slow). Counts
 *   hide; the rest may stay.
 * - **failed**: the read failed or took longer than {@link READ_TIMEOUT_MS},
 *   with nothing fresh to show. The fact falls back to what the cached page
 *   already says ("See times").
 *
 * "unknown" (a read that answered, with nothing to say) is the fact's own
 * call (`LiveFact`'s `pick`), not the read's.
 */

/** How often a fact is read again while the page is in view. */
export const POLL_EVERY_MS = 30_000;

/** How long an answer may be shown: older than this, a count hides. */
export const FRESH_FOR_MS = 60_000;

/** A read slower than this has failed, and the fact falls back. */
export const READ_TIMEOUT_MS = 8_000;

export type LiveReadStatus =
    "loading" | "fresh" | "refreshing" | "stale" | "failed";

/** What one read source knows at a moment. */
export interface LiveSnapshot<T = unknown> {
    /** The last good answer, if any. */
    data?: T;
    /** When it came (`Date.now()`). */
    fetchedAt?: number;
    /** The last attempt failed (an error, a bad answer or a timeout). */
    error: boolean;
    /** A read is on its way. */
    inFlight: boolean;
}

/**
 * What a fact may show now. A fresh answer always wins; an old one is
 * stale while a new read is on its way (or none has failed since), and a
 * failure with nothing fresh is failed.
 */
export function liveStatus(
    snap: LiveSnapshot,
    now: number,
    freshFor: number = FRESH_FOR_MS,
): LiveReadStatus {
    if (snap.data !== undefined && snap.fetchedAt !== undefined) {
        if (now - snap.fetchedAt <= freshFor) {
            return snap.inFlight ? "refreshing" : "fresh";
        }
        return snap.error && !snap.inFlight ? "failed" : "stale";
    }
    return snap.error ? "failed" : "loading";
}

/**
 * When the status will next change by the clock alone (a fresh answer
 * turning stale), in ms from `now`; null when only a read can change it.
 */
export function nextChangeIn(
    snap: LiveSnapshot,
    now: number,
    freshFor: number = FRESH_FOR_MS,
): number | null {
    if (snap.fetchedAt === undefined) return null;
    const left = snap.fetchedAt + freshFor - now;
    return left >= 0 ? left + 1 : null;
}

/** Whether a fact in this status shows its value at all. */
export function showsValue(status: LiveReadStatus): boolean {
    return status === "fresh" || status === "refreshing" || status === "stale";
}

/** Whether a count may show: only while fresh, never from an old answer. */
export function showsCount(status: LiveReadStatus): boolean {
    return status === "fresh" || status === "refreshing";
}
