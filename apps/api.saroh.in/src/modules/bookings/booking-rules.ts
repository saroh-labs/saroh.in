import type { Prisma } from "@saroh/database";

/**
 * A business's booking rules (U3): how far ahead a customer may book, the
 * latest they may book before a start, and how long before a class they may
 * cancel and get it back. A null is no rule — what every business had before
 * the rules existed, so nothing changes until a merchant sets one.
 *
 * Book-ahead and latest-booking bind the customer (the booking page); the
 * merchant booking someone in by hand is not held to their own customer
 * rules. Free cancellation decides whether a class that was paid for — by
 * a pack or a membership — comes back, and whether a cancel is in time.
 *
 * `refundInTimeCancels` is the business's refund policy (E30, DEC-058):
 * whether money paid online goes back automatically when a booking is
 * cancelled in time. On by default — what E8 shipped — so a business that
 * never set it, or has no rules row, keeps refunding.
 *
 * `bookingPayment` is how people pay when they book on the booking page
 * (DEC-088): online, at the desk, or both. Both by default — what every
 * business had before — so nothing changes until a merchant chooses.
 *
 * `gapMinutes` is "Gap between bookings" (DEC-170, #1038): minutes kept
 * clear either side of a person's bookings, none by default.
 * `memberRuleChangesNeedApproval` is the business's switch: on — for every
 * business, and one with no rules row — a change someone makes to their
 * own booking rules waits for an owner or admin (`person-rules.ts`).
 *
 * Each person may have their own book-ahead, latest-booking, free-cancel
 * and gap, falling back to these field by field (`rulesForPerson`).
 */
export interface BookingRulesValue {
    bookAheadDays: number | null;
    latestBookingMinutes: number | null;
    freeCancelHours: number | null;
    refundInTimeCancels: boolean;
    bookingPayment: BookingPayment;
    gapMinutes: number;
    memberRuleChangesNeedApproval: boolean;
}

/**
 * How people pay when they book (DEC-088): ONLINE only, at the DESK only,
 * or BOTH. Online still needs a provider that can take it
 * (`takesOnlinePayment`); a deposit or full price at booking is paid
 * online, or at the desk when online can't take it and the desk is allowed
 * (DEC-089).
 */
export const BOOKING_PAYMENTS = ["ONLINE", "DESK", "BOTH"] as const;
export type BookingPayment = (typeof BOOKING_PAYMENTS)[number];

export const NO_BOOKING_RULES: BookingRulesValue = {
    bookAheadDays: null,
    latestBookingMinutes: null,
    freeCancelHours: null,
    refundInTimeCancels: true,
    bookingPayment: "BOTH",
    gapMinutes: 0,
    memberRuleChangesNeedApproval: true,
};

/** A stored value read as a way to pay; anything unknown reads as BOTH. */
export function bookingPaymentOf(value: unknown): BookingPayment {
    return (BOOKING_PAYMENTS as readonly unknown[]).includes(value)
        ? (value as BookingPayment)
        : "BOTH";
}

/** Whether the business lets people pay online when they book. */
export function allowsOnline(
    rules: Pick<BookingRulesValue, "bookingPayment">,
): boolean {
    return rules.bookingPayment !== "DESK";
}

/** Whether the business lets people book to pay at the desk. */
export function allowsDesk(
    rules: Pick<BookingRulesValue, "bookingPayment">,
): boolean {
    return rules.bookingPayment !== "ONLINE";
}

/**
 * Whether a cancel refunds what was paid online on its own (DEC-058): only
 * in time, and only when the business's policy says so. A late cancel never
 * does; money is handed back past that only by someone who may refund
 * (`payment:manage`), by hand. Pure.
 */
export function refundsAutomatically(
    inTime: boolean,
    rules: Pick<BookingRulesValue, "refundInTimeCancels">,
): boolean {
    return inTime && rules.refundInTimeCancels;
}

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
 * The free-cancel deadline a booking is given when it is made (E8,
 * DEC-051): its start less the business's free-cancel hours, or null when
 * the business has no such rule. Written once; a move never changes it.
 */
export function freeCancelDeadline(
    startAt: Date,
    rules: Pick<BookingRulesValue, "freeCancelHours">,
): Date | null {
    if (rules.freeCancelHours === null) return null;
    return new Date(startAt.getTime() - rules.freeCancelHours * HOUR);
}

/**
 * Whether cancelling now is past the free-cancellation window, so a class
 * paid for stays used and a deposit is kept. The deadline fixed at booking
 * decides when the booking has one (E8, DEC-051), so moving a booking later
 * never makes a late cancel free. A booking made before the column (or with
 * no rule then) is judged by its start and today's rule, as before. No
 * rule: never late.
 */
export function isLateCancel(
    booking: { startAt: Date; freeCancelUntil?: Date | null },
    now: Date,
    rules: BookingRulesValue,
): boolean {
    if (booking.freeCancelUntil) {
        return now.getTime() > booking.freeCancelUntil.getTime();
    }
    const deadline = freeCancelDeadline(booking.startAt, rules);
    return deadline !== null && now.getTime() > deadline.getTime();
}

/** "2 hours", "1 day", "45 minutes": a length of time in words. */
export function describeMinutes(minutes: number): string {
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

/** The columns a rules row is read with. */
export const BOOKING_RULES_SELECT = {
    bookAheadDays: true,
    latestBookingMinutes: true,
    freeCancelHours: true,
    refundInTimeCancels: true,
    bookingPayment: true,
    gapMinutes: true,
    memberRuleChangesNeedApproval: true,
} as const;

/** A stored rules row as the value the rest of the API reads. */
export function bookingRulesOf(
    row: Omit<BookingRulesValue, "bookingPayment"> & {
        bookingPayment: string;
    },
): BookingRulesValue {
    return { ...row, bookingPayment: bookingPaymentOf(row.bookingPayment) };
}

/** The business's rules, or none. */
export async function loadBookingRules(
    db: Db,
    organizationId: string,
): Promise<BookingRulesValue> {
    const row = await db.bookingRules.findUnique({
        where: { organizationId },
        select: BOOKING_RULES_SELECT,
    });
    if (!row) return NO_BOOKING_RULES;
    return bookingRulesOf(row);
}
