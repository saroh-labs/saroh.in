import { addDays, dayBounds, localDateOf, weekStartOf } from "./diary";
import { readBookingsCalendar, readNow } from "./service";
import type { ServiceUsage } from "./usage";
import { tallyUsage } from "./usage";

/** How far ahead "still to come" counts. */
const AHEAD_DAYS = 90;

/**
 * How the services are being used this week and ahead (U16, E2), in the
 * business's zone. Null when the bookings read failed — a failed read is
 * never a zero (`frontend-error-feedback.md`).
 */
export async function readServiceUsage(
    serviceIds: readonly string[],
    timezone: string,
): Promise<Record<string, ServiceUsage> | null> {
    const now = readNow();
    const today = localDateOf(new Date(now), timezone);
    const weekStart = weekStartOf(today);
    const calendar = await readBookingsCalendar(
        dayBounds(weekStart, timezone).from.toISOString(),
        dayBounds(addDays(today, AHEAD_DAYS), timezone).to.toISOString(),
    );
    if (!calendar) return null;
    const weekEnd = dayBounds(addDays(weekStart, 6), timezone).to.getTime();
    return tallyUsage(calendar, serviceIds, { now, weekEnd });
}
