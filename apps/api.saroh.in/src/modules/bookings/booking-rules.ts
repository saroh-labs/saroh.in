import type { Prisma } from "@saroh/database";

/**
 * A business's booking rules (U3): how far ahead a customer may book, the
 * latest they may book before a start, and how long before a class they may
 * cancel and get it back. A null is no rule — what every business had before
 * the rules existed, so nothing changes until a merchant sets one.
 *
 * Book-ahead and latest-booking bind the customer (the booking page); the
 * merchant booking someone in by hand is not held to their own customer
 * rules. Free cancellation decides only whether a class that was paid for —
 * by a pack or a membership — comes back.
 */
export interface BookingRulesValue {
    bookAheadDays: number | null;
    latestBookingMinutes: number | null;
    freeCancelHours: number | null;
}

export const NO_BOOKING_RULES: BookingRulesValue = {
    bookAheadDays: null,
    latestBookingMinutes: null,
    freeCancelHours: null,
};

/** A refusal the error filter carries to the form as `details.field`. */
export interface FieldRefusal {
    message: string;
    field: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Why a customer may not book a start, or null when they may. Pure; the
 * caller supplies `now`.
 */
export function bookingWindowRefusal(
    startAt: Date,
    now: Date,
    rules: BookingRulesValue,
): FieldRefusal | null {
    // No rule, no check — not even for the past, which the booking page
    // never offered before the rules existed either (its listing starts now).
    const lead = startAt.getTime() - now.getTime();
    if (
        rules.latestBookingMinutes !== null &&
        lead < rules.latestBookingMinutes * MINUTE
    ) {
        return {
            message: `Bookings close ${describeMinutes(rules.latestBookingMinutes)} before the start. Pick a later time.`,
            field: "startAt",
        };
    }
    if (rules.bookAheadDays !== null && lead > rules.bookAheadDays * DAY) {
        return {
            message: `Bookings open ${rules.bookAheadDays} ${rules.bookAheadDays === 1 ? "day" : "days"} ahead. Pick an earlier date.`,
            field: "startAt",
        };
    }
    return null;
}

/** Whether a customer may book this start — the listing's filter. */
export function withinBookingWindow(
    startAt: Date,
    now: Date,
    rules: BookingRulesValue,
): boolean {
    return bookingWindowRefusal(startAt, now, rules) === null;
}

/**
 * Whether cancelling now is inside the free-cancellation window, so a class
 * paid for stays used. No rule: never late.
 */
export function isLateCancel(
    startAt: Date,
    now: Date,
    rules: BookingRulesValue,
): boolean {
    if (rules.freeCancelHours === null) return false;
    return now.getTime() > startAt.getTime() - rules.freeCancelHours * HOUR;
}

function describeMinutes(minutes: number): string {
    if (minutes % 1440 === 0) {
        const days = minutes / 1440;
        return `${days} ${days === 1 ? "day" : "days"}`;
    }
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

type Db = Pick<Prisma.TransactionClient, "bookingRules">;

/** The business's rules, or none. */
export async function loadBookingRules(
    db: Db,
    organizationId: string,
): Promise<BookingRulesValue> {
    const row = await db.bookingRules.findUnique({
        where: { organizationId },
        select: {
            bookAheadDays: true,
            latestBookingMinutes: true,
            freeCancelHours: true,
        },
    });
    return row ?? NO_BOOKING_RULES;
}
