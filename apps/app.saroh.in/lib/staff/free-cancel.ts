const HOUR = 3_600_000;

/**
 * Past the free-cancel mark at `now`, for the business's free-cancel hours
 * (`BookingRules.freeCancelHours`; null is no rule). Free cancelling
 * follows the business's refund policy for everyone (DEC-170, owner 20 Oct
 * 2026), so there is no person's own to prefer.
 *
 * The API fixes a booking's deadline when it is made (`freeCancelUntil`),
 * which the calendar read doesn't carry yet. Until it does, the business's
 * rule as it is now is the nearest the screen can say.
 */
export function pastFreeCancel(
    hours: number | null,
    startAt: string,
    now: number,
): boolean {
    return hours !== null && now > Date.parse(startAt) - hours * HOUR;
}
