import type { Prisma } from "@saroh/database";

import { BOOKING_PAPER } from "../bookings/desk-take";
import { fromCents, toCents } from "../invoices/totals";

/**
 * What a booking has been paid, for Customer Detail's booking lines
 * (UX-049): "Paid ₹800 · Cash" once money is in, instead of "Pays at the
 * desk" staying after the desk took it.
 *
 * Read from the booking's own paper (`BOOKING_PAPER`: its invoice and a
 * deposit's balance), as the calendar reads it (`desk-take.ts`): every
 * PAID one counts, whether the desk recorded it by hand or it was paid
 * online, and the newest says how.
 */

/** The select for a booking's paper, as {@link bookingPaid} reads it. */
export const BOOKING_PAID_INVOICES = {
    where: { ...BOOKING_PAPER, status: "PAID" },
    select: {
        total: true,
        currency: true,
        paymentMethod: true,
        paidAt: true,
    },
} satisfies Prisma.Booking$invoicesArgs;

export interface BookingPaidRow {
    total: { toString(): string };
    currency: string;
    paymentMethod: string | null;
    paidAt: Date | null;
}

export interface BookingPaid {
    /**
     * Major units, as a decimal string; null for a viewer without
     * `invoice:read`, who still learns that it is paid (DEC-039: money is
     * the invoice's read).
     */
    amount: string | null;
    currency: string | null;
    /** CASH | UPI | CARD | BANK_TRANSFER | OTHER, or ONLINE / null: paid online. */
    method: string | null;
}

/** What was paid, or null while nothing has been. */
export function bookingPaid(
    rows: readonly BookingPaidRow[],
    seesMoney = true,
): BookingPaid | null {
    if (rows.length === 0) return null;
    const sorted = [...rows].sort(
        (a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0),
    );
    const cents = sorted.reduce((n, r) => n + toCents(r.total.toString()), 0);
    if (cents <= 0) return null;
    const last = sorted[sorted.length - 1];
    return {
        amount: seesMoney ? fromCents(cents) : null,
        currency: seesMoney ? last.currency : null,
        method: last.paymentMethod,
    };
}
