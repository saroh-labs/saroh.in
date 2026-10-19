import type { BookingRules, PersonRules } from "./types";

const HOUR = 3_600_000;

/**
 * How many hours before the start a booking with this person can be
 * cancelled for free (DEC-170, #1038): their own rule, else the
 * business's; null when there is no rule.
 *
 * The API fixes a booking's deadline when it is made (`freeCancelUntil`),
 * which the calendar read doesn't carry yet. Until it does, the person's
 * rule as it is now is the nearest the screen can say.
 */
export function freeCancelHoursFor(
    business: Pick<BookingRules, "freeCancelHours"> | null | undefined,
    person: { rules?: PersonRules } | null | undefined,
): number | null {
    const own = person?.rules?.freeCancelHours;
    if (own !== null && own !== undefined) return own;
    return business?.freeCancelHours ?? null;
}

/** Past the free-cancel mark at `now`, for a rule from `freeCancelHoursFor`. */
export function pastFreeCancel(
    hours: number | null,
    startAt: string,
    now: number,
): boolean {
    return hours !== null && now > Date.parse(startAt) - hours * HOUR;
}
