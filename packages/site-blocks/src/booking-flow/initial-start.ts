import type { BookingDays, BookingStart } from "./model";
import { dateIn, timeIn } from "./model";

/**
 * Opening the booking page on a time (G18): "On today" on the home page links
 * here with `?service=&date=&start=`, and the page opens on that service and
 * day with the time chosen — if it is still free.
 *
 * Pure, so the rule is tested without the flow. The flow applies it once,
 * when the first service's days arrive.
 */

/** What the page says when the time linked to has gone meanwhile. */
export const INITIAL_TIME_GONE =
    "That time has just gone — here's what's left.";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A `?date=` worth using: `YYYY-MM-DD`, else null. */
export function initialDateOf(value: unknown): string | null {
    return typeof value === "string" && DATE.test(value) ? value : null;
}

/** A `?start=` worth using: `HH:MM`, else null. */
export function initialTimeOf(value: unknown): string | null {
    return typeof value === "string" && TIME.test(value) ? value : null;
}

/**
 * The start the link named, if the booking page still offers it: the same
 * day and wall-clock time in the business's zone, and for a class a place
 * left. `null` when it has gone.
 */
export function findInitialStart(
    days: BookingDays,
    date: string,
    time: string,
    isClass: boolean,
): BookingStart | null {
    const zone = days.timezone;
    const day = days.days.find((d) => d.date === date);
    const found = day?.starts.find(
        (s) =>
            dateIn(s.startAt, zone) === date &&
            timeIn(s.startAt, zone) === time,
    );
    if (!found) return null;
    if (isClass && (found.placesLeft ?? 0) <= 0) return null;
    return found;
}
