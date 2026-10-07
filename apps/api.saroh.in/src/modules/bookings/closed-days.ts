import type { Interval, OpeningHours } from "./availability";
import { openingIntervals } from "./availability";

/**
 * Whether the business itself is closed over a day `[from, to)` (UX-054):
 * a closure covers all of it, or it has opening hours and none fall on
 * that day. A day it is open but this service has no times — its person
 * doesn't work then, or it has no hours of its own that day — is not
 * closed: the booking page says "No times", and keeps "Closed" for this.
 * With no opening hours known, only a closure closes a day.
 */
export function businessClosedOn(
    day: Interval,
    opening: OpeningHours | null,
    closures: Interval[],
): boolean {
    const from = day.startAt.getTime();
    const to = day.endAt.getTime();
    if (
        closures.some(
            (c) => c.startAt.getTime() <= from && c.endAt.getTime() >= to,
        )
    ) {
        return true;
    }
    if (!opening) return false;
    return !openingIntervals(opening, day.startAt, day.endAt).some(
        (w) => w.startAt.getTime() < to && w.endAt.getTime() > from,
    );
}
