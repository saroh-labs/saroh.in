/**
 * Pure predicates about a booking's state (#241).
 *
 * Deliberately NOT in `./service`, which imports the CRM HTTP plumbing and so
 * reaches `next/headers` — importing it from a client component is a build
 * error, and the bookings table is a client component. These are the parts the
 * table and the detail page both need, and they touch nothing but their
 * arguments.
 *
 * Both take `now` explicitly with a default, so a caller that already knows the
 * time can pass it rather than reading the clock again per row.
 */

/**
 * The state vocabulary lives HERE, not in `./service`, so nothing in this file
 * imports from the module that re-exports it — that was a genuine import
 * cycle, and `check:cycles` caught it.
 */
export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

/**
 * How an appointment went (#241). Null means nobody has said yet — which is
 * the honest answer, and distinct from both outcomes.
 */
export type BookingOutcome = "ATTENDED" | "NO_SHOW";

/** The fields these predicates read — less than a Booking, on purpose. */
export interface BookingStateFields {
    endAt: string;
    status: BookingStatus;
    outcome: BookingOutcome | null;
}

/**
 * Whether a booking's slot has ended.
 *
 * Nothing about a booking's OUTCOME is decided by this — only a person sets
 * that — but a past appointment offers different controls to a future one.
 */
export function hasEnded(
    booking: Pick<BookingStateFields, "endAt">,
    now: number = Date.now(),
): boolean {
    return new Date(booking.endAt).getTime() < now;
}

/**
 * A past, uncancelled booking nobody has said how it went.
 *
 * The three conditions are each load-bearing: a future appointment has nothing
 * to report yet, a cancelled one already has its answer, and one already
 * marked is done. What is left is the merchant's actual queue.
 */
export function needsOutcome(
    booking: BookingStateFields,
    now: number = Date.now(),
): boolean {
    return (
        booking.outcome === null &&
        booking.status !== "CANCELLED" &&
        hasEnded(booking, now)
    );
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether a booking belongs under "Next 7 days": not over yet, and starting
 * within a week of now.
 *
 * "Not over yet" is the half that was missing (#360). The filter compared
 * days-until-start against 7, and days-until is negative for every booking
 * that has already happened — so the tab listed the past, while Upcoming,
 * which asked the right question, said nothing was coming.
 */
export function isInNextWeek(
    booking: Pick<BookingStateFields, "endAt"> & { startAt: string },
    now: number = Date.now(),
): boolean {
    return (
        !hasEnded(booking, now) &&
        new Date(booking.startAt).getTime() <= now + WEEK_MS
    );
}

/** How early before the start the desk may check someone in (the API's rule). */
export const CHECK_IN_EARLY_MS = 60 * 60 * 1000;

/**
 * Whether someone can be checked in now: from an hour before the start, the
 * way the API allows it — the desk checks people in as they walk in.
 */
export function canCheckIn(
    booking: Pick<BookingStateFields, "status"> & { startAt: string },
    now: number = Date.now(),
): boolean {
    return (
        booking.status !== "CANCELLED" &&
        now >= new Date(booking.startAt).getTime() - CHECK_IN_EARLY_MS
    );
}

/** Whether a no-show can be said: once the start has passed. */
export function canMarkNoShow(
    booking: Pick<BookingStateFields, "status"> & { startAt: string },
    now: number = Date.now(),
): boolean {
    return (
        booking.status !== "CANCELLED" &&
        now >= new Date(booking.startAt).getTime()
    );
}
