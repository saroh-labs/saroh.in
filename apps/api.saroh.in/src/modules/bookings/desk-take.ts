import type { Prisma } from "@saroh/database";

import {
    leftToPayCents,
    paidSoFarCents,
    PAYMENT_METHODS,
} from "../invoices/invoice-state";
import { toCents } from "../invoices/totals";

/*
 * Taking payment at the desk for a booking (round-2 P2): what "Take ₹X"
 * takes, and why it can't. Pure, so the booking's read, the calendar's
 * diary and the write all decide it the same way (`booking-desk-pay.ts`
 * writes it).
 *
 * The money a booking was paid online is its own invoice's payments (E8);
 * money taken at the desk is the same paper recorded by hand — its own
 * invoice, or, after a deposit, a balance invoice against the deposit's
 * (DEC-023: money in has an invoice; an issued invoice never changes).
 * What has been paid is read from that paper's ledger (DEC-173): however
 * it came in — online, at the desk, or recorded by hand on Invoices, in
 * one payment or several — never from how the last of it was paid.
 */

/** How the desk takes it: cash, UPI at the counter, or the card machine. */
export const DESK_METHODS = ["CASH", "UPI", "CARD"] as const;
export type DeskMethod = (typeof DESK_METHODS)[number];

/** The booking's own paper: its invoice, and a deposit's balance. */
export const BOOKING_PAPER = {
    source: "BOOKING",
    kind: { in: ["INVOICE", "SUPPLEMENTARY"] },
} satisfies Prisma.InvoiceWhereInput;

/** What {@link paidAtDesk} and {@link deskTake} read of it. */
export const BOOKING_PAPER_SELECT = {
    kind: true,
    status: true,
    paymentMethod: true,
    total: true,
    // Part of it recorded by hand on its ledger (DEC-173).
    paidCents: true,
    paidAt: true,
    // A payment going through online right now: a charge in progress.
    paymentIntents: {
        where: { status: "PROCESSING" },
        select: { id: true },
    },
} satisfies Prisma.InvoiceSelect;

/** A booking's invoice as its money is read: its own, or a balance's. */
export interface BookingPaperRow {
    kind: string;
    status: string;
    paymentMethod: string | null;
    total: { toString(): string };
    /**
     * What its ledger holds as paid (DEC-173): part of an issued invoice
     * recorded by hand. Absent reads as nothing.
     */
    paidCents?: number;
    paidAt: Date | null;
    /** Its payments going through online right now; absent reads as none. */
    paymentIntents?: readonly unknown[];
}

/** A way of paying recorded by hand — never ONLINE, never an order's. */
function byHand(method: string | null): boolean {
    return (PAYMENT_METHODS as readonly (string | null)[]).includes(method);
}

/**
 * What was paid at the desk: the booking's PAID invoices — its own, or a
 * deposit's balance — recorded by hand rather than by a provider (this
 * screen's cash, UPI or card, or "Mark it paid" on the invoice), and how the
 * last of them was paid.
 */
export function paidAtDesk(rows: readonly BookingPaperRow[]): {
    cents: number;
    method: string | null;
} {
    const desk = rows
        .filter((r) => r.status === "PAID" && byHand(r.paymentMethod))
        .sort(
            (a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0),
        );
    return {
        cents: desk.reduce((n, r) => n + toCents(r.total.toString()), 0),
        method: desk[desk.length - 1]?.paymentMethod ?? null,
    };
}

/**
 * What the booking's paper has been paid, in paise, from its ledger
 * (DEC-173): each invoice's paid so far (`paidSoFarCents`), on paper that
 * took money — issued (part paid), paid, or credited since. A draft or a
 * voided invoice took nothing.
 */
export function paidOnPaperCents(
    paper: readonly Pick<BookingPaperRow, "status" | "total" | "paidCents">[],
): number {
    return paper
        .filter(
            (p) =>
                p.status === "ISSUED" ||
                p.status === "PAID" ||
                p.status === "CREDITED",
        )
        .reduce(
            (n, p) =>
                n +
                paidSoFarCents({
                    status: p.status,
                    total: p.total,
                    paidCents: p.paidCents ?? 0,
                }),
            0,
        );
}

/** The same paper with only its payments going through online right now. */
export function chargingOnly<
    T extends { paymentIntents: readonly { status: string }[] },
>(paper: readonly T[]): T[] {
    return paper.map((p) => ({
        ...p,
        paymentIntents: p.paymentIntents.filter(
            (i) => i.status === "PROCESSING",
        ),
    }));
}

/** What the diary and the write read of the paper: payments, with amounts. */
export const BOOKING_PAPER_PAYMENTS = {
    where: { status: { in: ["SUCCEEDED", "PROCESSING"] } },
    select: { status: true, amountCents: true },
} satisfies Prisma.PaymentIntentFindManyArgs;

/** What "Take ₹X" takes now. */
export interface DeskTake {
    cents: number;
    /**
     * Whether "Send a pay link" can ask for it instead. A link bills the
     * whole booking on its own invoice, so never a deposit's balance.
     */
    byLink: boolean;
}

/** Why the desk can't take anything, in the words the team reads. */
export const DESK_REFUSED = {
    cancelled: "This booking is cancelled, so there's nothing to take.",
    holding: "This booking is waiting on the customer's own online payment.",
    treatment:
        "This visit is part of a treatment, so it's paid for on its order.",
    course: "This session is part of a course, so it's paid for with the course.",
    paid: "This booking is already paid.",
    charging:
        "A payment for this booking is going through online. Wait for it to finish.",
    voided: "This booking's invoice was voided or credited. Record the payment from Invoices.",
    unpriced: "This booking has no price, so there's nothing to take.",
} as const;

/** How a booking is paid already, so there is nothing to take. */
const PAID_OTHERWISE = ["PACK", "MEMBERSHIP"];

/**
 * What the desk can take for a booking, or why not. First the booking: it
 * stands (not cancelled, not a hold still waiting on its own payment), and
 * its money is its own (not a treatment's visit, not a course's session,
 * not a pack's or membership's class). Then its paper: nothing going
 * through online, an invoice with a pay link out takes what is left on it,
 * a voided or credited invoice is left to Invoices. Otherwise the price
 * less what the paper's ledger says was paid (`paidOnPaperCents`), however
 * it was paid; paid in full is refused. A booking recorded as "Paid now"
 * by hand, with nothing on paper, is paid already.
 */
export function deskTake(
    booking: {
        status: string;
        paidWith: string | null;
        orderId?: string | null;
        courseEnrollmentId?: string | null;
    },
    money: {
        priceCents: number | null;
        paper: readonly BookingPaperRow[];
    },
): DeskTake | { refusal: string } {
    if (booking.status === "CANCELLED") {
        return { refusal: DESK_REFUSED.cancelled };
    }
    if (booking.status === "PENDING") return { refusal: DESK_REFUSED.holding };
    if (booking.orderId) return { refusal: DESK_REFUSED.treatment };
    if (booking.courseEnrollmentId) return { refusal: DESK_REFUSED.course };
    if (booking.paidWith && PAID_OTHERWISE.includes(booking.paidWith)) {
        return { refusal: DESK_REFUSED.paid };
    }
    if (money.paper.some((p) => (p.paymentIntents?.length ?? 0) > 0)) {
        return { refusal: DESK_REFUSED.charging };
    }
    const own = money.paper.filter((p) => p.kind === "INVOICE");
    // A pay link is out: the desk takes what that invoice still asks, its
    // total less anything recorded on it by hand (DEC-173).
    const issued = own.find((p) => p.status === "ISSUED");
    if (issued) {
        const left = leftToPayCents({
            total: issued.total,
            paidCents: issued.paidCents ?? 0,
        });
        return left > 0
            ? { cents: left, byLink: true }
            : { refusal: DESK_REFUSED.paid };
    }
    const paidOwn = own.some((p) => p.status === "PAID");
    if (!paidOwn && own.some((p) => p.status !== "DRAFT")) {
        return { refusal: DESK_REFUSED.voided };
    }
    if (money.priceCents === null || money.priceCents <= 0) {
        return { refusal: DESK_REFUSED.unpriced };
    }
    const paid = paidOnPaperCents(money.paper);
    // Paid, with no amount to count: "Paid now" by hand (E4) records no
    // paper.
    if (booking.paidWith === "PAID" && paid === 0) {
        return { refusal: DESK_REFUSED.paid };
    }
    const cents = money.priceCents - paid;
    if (cents <= 0) return { refusal: DESK_REFUSED.paid };
    return { cents, byLink: paid === 0 };
}
