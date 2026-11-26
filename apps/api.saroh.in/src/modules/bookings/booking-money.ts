import type { Prisma } from "@saroh/database";

import {
    bookingPaymentInTx,
    bookingRefundKey,
} from "../payments/booking-refund";
import type { BookingRulesValue } from "./booking-rules";
import type { BookingPaperRow, DeskTake } from "./desk-take";
import {
    BOOKING_PAPER,
    BOOKING_PAPER_PAYMENTS,
    BOOKING_PAPER_SELECT,
    chargingOnly,
    deskTake,
    paidAtDesk,
    paidOnPaperCents,
} from "./desk-take";
import type { PaidWith } from "./dto";
import { PAID_WITH } from "./dto";

/*
 * What a booking's money reads as on its detail screen (E8, default 50):
 * what was paid online at booking, what is due at the visit, and where a
 * cancel's refund stands. Worked out on the server from the booking's own
 * invoice and payments, so the screen does no sums of its own. Part of the
 * booking (DEC-039): `booking:read` sees its price and deposit.
 */

/** A cancel's refund, as the provider has answered for it so far. */
export interface BookingRefundView {
    amountCents: number;
    /** PENDING until the provider confirms it; FAILED when it made none. */
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    /** PENDING with no answer from the provider yet: the money is held. */
    beingConfirmed: boolean;
}

export interface BookingMoney {
    priceCents: number | null;
    currency: string | null;
    /** Taken online for it (the deposit, the whole price, or a pay link). */
    paidOnlineCents: number;
    /** Only the deposit was paid at booking; the rest is due at the visit. */
    deposit: boolean;
    /**
     * Still to take ({@link bookingPay}'s `dueCents`): the price less what
     * its paper's ledger holds as paid. Null where money doesn't apply.
     */
    dueCents: number | null;
    /** The one money answer for the booking (DEC-272). */
    pay: BookingPay;
    refund: BookingRefundView | null;
    /**
     * What a cancel could hand back now: what is left of the online payment
     * a refund draws on, never more than was received (DEC-058). 0 once
     * cancelled, or with nothing paid online.
     */
    refundableCents: number;
    /**
     * The business's refund policy (E30, DEC-058): a cancel in time refunds
     * what was paid online automatically. The screen states it.
     */
    refundInTimeCancels: boolean;
    /**
     * A visit of a treatment (E9, DEC-050): the order its money is on. It
     * never refunds on its own (`refundableCents` is 0); the order does.
     */
    treatmentOrderId: string | null;
    /**
     * Taken at the desk and recorded on the booking's paper (P2): cash, UPI
     * at the counter or a card — or its invoice marked paid by hand.
     */
    paidAtDeskCents: number;
    /** How the last of it was taken (CASH, UPI, CARD, …); null when none was. */
    deskMethod: string | null;
    /**
     * What "Take ₹X" takes now (P2), and whether a pay link could ask for it
     * instead; null when the desk has nothing to take for it.
     */
    take: DeskTake | null;
}

/** Whether a booking's snapshot says only its deposit was paid online. */
export function paidADeposit(snapshot: unknown): boolean {
    const deposit = (snapshot as { deposit?: { cents?: unknown } } | null)
        ?.deposit;
    return typeof deposit?.cents === "number";
}

/** The price and currency a booking was made at, from its snapshot. */
export function bookingPrice(snapshot: unknown): {
    priceCents: number | null;
    currency: string | null;
} {
    const terms = (
        snapshot as {
            service?: { priceCents?: unknown; currency?: unknown };
        } | null
    )?.service;
    return {
        priceCents:
            typeof terms?.priceCents === "number" ? terms.priceCents : null,
        currency: typeof terms?.currency === "string" ? terms.currency : null,
    };
}

/**
 * Booked at a price of 0 (DEC-261): the price its snapshot froze, or for a
 * booking from before snapshots its service's. No price at all (null) is
 * never free. The one rule every read that says how a booking is paid uses.
 */
export function isFreeBooking(
    snapshot: unknown,
    servicePriceCents: number | null = null,
): boolean {
    return (bookingPrice(snapshot).priceCents ?? servicePriceCents) === 0;
}

/**
 * How a booking was paid, as a read says it: a free booking stored "at the
 * desk" before DEC-261 owes nothing, so it reads as no way to pay.
 */
export function shownPaidWith<T extends string>(
    paidWith: T | null,
    free: boolean,
): T | null {
    return free && paidWith === "DESK" ? null : paidWith;
}

/** How a booking was paid, from what it records (U3) and what it holds. */
export function howPaid(row: {
    paidWith: string | null;
    packRedemption: { reversedAt: Date | null } | null;
    subscriptionId: string | null;
}): PaidWith | null {
    if (row.paidWith && (PAID_WITH as readonly string[]).includes(row.paidWith))
        return row.paidWith as PaidWith;
    if (row.packRedemption?.reversedAt === null) return "PACK";
    if (row.subscriptionId) return "MEMBERSHIP";
    return null;
}

/**
 * The one payment word a booking reads as, on every surface that says how a
 * booking is paid (DEC-272): the List's Money and badge, the diary's block,
 * the quick look, the booking's page, the Business calendar, Home. Not a
 * money figure, so everyone who reads bookings gets it (DEC-098); the
 * amounts beside it only go to whoever may see money.
 */
export const PAY_WORDS = [
    "FREE",
    "PAID",
    "AWAITING_PAYMENT",
    "PAYS_AT_VISIT",
    "PACK",
    "MEMBERSHIP",
    "ON_ORDER",
    "WITH_COURSE",
    "NOTHING_TO_PAY",
] as const;
export type PayWord = (typeof PAY_WORDS)[number];

/**
 * How the money came in (PAID, or what a cancelled booking had paid), or
 * that a pay link asks for it (AWAITING_PAYMENT). Null when not recorded:
 * a booking marked paid with no payment on its paper says just "Paid".
 */
export type PayHow = "ONLINE" | "DESK" | "ONLINE_AND_DESK" | "LINK" | null;

/** A booking's money, as one answer (DEC-272). */
export interface BookingPay {
    word: PayWord | null;
    how: PayHow;
    /** Taken for it so far, online and at the desk (its paper's ledger). */
    paidCents: number;
    /**
     * Still to take; 0 when nothing is. Null where money doesn't apply:
     * a pack's or membership's class, a treatment's visit, a course's
     * session, a booking with no price, a cancelled one.
     */
    dueCents: number | null;
}

/** The facts {@link bookingPay} reads: the booking and its own paper. */
export interface PayFacts {
    status: string;
    outcome: string | null;
    endAt: Date;
    /** How it is paid, as a read says it (`howPaid`, `shownPaidWith`). */
    paidWith: string | null;
    /** Booked at a price of 0 (DEC-261, {@link isFreeBooking}). */
    free: boolean;
    orderId?: string | null;
    courseEnrollmentId?: string | null;
    /** What it was booked at (`bookingPrice`), or its service's price. */
    priceCents: number | null;
    /** Its paper (`BOOKING_PAPER`), with the payments on it. */
    paper: readonly (Pick<
        BookingPaperRow,
        "kind" | "status" | "total" | "paidCents"
    > & {
        paymentIntents?: readonly { status?: string; amountCents?: number }[];
    })[];
}

/**
 * What was paid online for a booking: the succeeded payments on its paper
 * that took money (paid, or credited since). A payment going through is
 * not money in yet.
 */
export function paidOnlineOnPaper(paper: PayFacts["paper"]): number {
    return paper
        .filter((p) => p.status === "PAID" || p.status === "CREDITED")
        .flatMap((p) => p.paymentIntents ?? [])
        .filter((i) => (i.status ?? "SUCCEEDED") === "SUCCEEDED")
        .reduce((n, i) => n + (i.amountCents ?? 0), 0);
}

/**
 * The one money answer for a booking (DEC-272, DEC-273), computed once on
 * the server. In order:
 *
 * 1. Cancelled: "Paid" with what it had paid (the refund is the booking's
 *    page's), else "Nothing to pay".
 * 2. Booked at a price of 0: "Free" (DEC-261).
 * 3. Paid some other way: a treatment's visit (on its order), a course's
 *    session, a class pack, a membership. No amount.
 * 4. No price: "Paid" when it was marked paid, else nothing to say.
 * 5. Paid is what its paper's ledger holds (DEC-173: online, at the desk,
 *    by hand on Invoices); marked "Paid now" with no paper is paid in full
 *    (E4, as `deskTake` reads it). Nothing left: "Paid".
 * 6. Money left: a hold waiting on the customer's own payment, or a pay
 *    link out, "Awaiting payment". Didn't come: "Nothing to pay" (the desk
 *    can still take a fee). Once the visit has ended, "Awaiting payment"
 *    (DEC-273). Before it, "Pays at the visit".
 */
export function bookingPay(b: PayFacts, now: Date): BookingPay {
    const paid = paidOnPaperCents(b.paper);
    const online = Math.min(paid, paidOnlineOnPaper(b.paper));
    const how: PayHow =
        online > 0 && paid > online
            ? "ONLINE_AND_DESK"
            : online > 0
              ? "ONLINE"
              : paid > 0
                ? "DESK"
                : null;
    const say = (
        word: PayWord | null,
        dueCents: number | null,
        paidCents = paid,
        shownHow: PayHow = paidCents > 0 ? how : null,
    ): BookingPay => ({ word, how: shownHow, paidCents, dueCents });
    if (b.status === "CANCELLED") {
        return say(paid > 0 ? "PAID" : "NOTHING_TO_PAY", null);
    }
    if (b.free) return say("FREE", 0, 0);
    if (b.orderId) return say("ON_ORDER", null);
    if (b.courseEnrollmentId) return say("WITH_COURSE", null);
    if (b.paidWith === "PACK") return say("PACK", null);
    if (b.paidWith === "MEMBERSHIP") return say("MEMBERSHIP", null);
    const price = b.priceCents;
    if (price === null || price <= 0) {
        return say(b.paidWith === "PAID" ? "PAID" : null, null);
    }
    if (b.paidWith === "PAID" && paid === 0) return say("PAID", 0, price);
    const due = Math.max(0, price - paid);
    if (due === 0) return say("PAID", 0);
    const linkOut = b.paper.some(
        (p) => p.kind === "INVOICE" && p.status === "ISSUED",
    );
    if (b.status === "PENDING") return say("AWAITING_PAYMENT", due);
    if (linkOut) return say("AWAITING_PAYMENT", due, paid, "LINK");
    if (b.outcome === "NO_SHOW") {
        return say(paid > 0 ? "PAID" : "NOTHING_TO_PAY", 0);
    }
    if (b.endAt.getTime() <= now.getTime()) {
        return say("AWAITING_PAYMENT", due);
    }
    return say("PAYS_AT_VISIT", due);
}

/** The payment word and how, with no amount: for a viewer who reads no money. */
export function payWords(pay: BookingPay): Pick<BookingPay, "word" | "how"> {
    return { word: pay.word, how: pay.how };
}

type Db = Pick<
    Prisma.TransactionClient,
    "paymentIntent" | "paymentRefund" | "invoice"
>;

const REFUNDS_BY_DEFAULT = { refundInTimeCancels: true };

/** The money of one booking — see {@link BookingMoney}. */
export async function bookingMoney(
    db: Db,
    booking: {
        id: string;
        organizationId: string;
        status: string;
        outcome: string | null;
        endAt: Date;
        paidWith: string | null;
        /** A visit of a treatment (E9): the order its money is on. */
        orderId?: string | null;
        /** A course's session (ADR-007): paid for with the course. */
        courseEnrollmentId?: string | null;
        snapshot: unknown;
        packRedemption?: { reversedAt: Date | null } | null;
        subscriptionId?: string | null;
        service: { priceCents: number | null };
    },
    rules: Pick<BookingRulesValue, "refundInTimeCancels"> = REFUNDS_BY_DEFAULT,
    now: Date = new Date(),
): Promise<BookingMoney> {
    const { priceCents, currency } = bookingPrice(booking.snapshot);
    const cancelled = booking.status === "CANCELLED";
    const [refund, left, paper] = await Promise.all([
        db.paymentRefund.findFirst({
            where: {
                organizationId: booking.organizationId,
                idempotencyKey: bookingRefundKey(booking.id),
            },
            select: {
                amountCents: true,
                status: true,
                providerRefundId: true,
            },
        }),
        cancelled
            ? null
            : bookingPaymentInTx(db, booking.organizationId, booking.id),
        db.invoice.findMany({
            where: {
                organizationId: booking.organizationId,
                bookingId: booking.id,
                ...BOOKING_PAPER,
            },
            select: {
                ...BOOKING_PAPER_SELECT,
                paymentIntents: BOOKING_PAPER_PAYMENTS,
            },
        }),
    ]);
    // The one answer (DEC-272): the List, the diary and this page read it.
    const free = isFreeBooking(booking.snapshot, booking.service.priceCents);
    const pay = bookingPay(
        {
            ...booking,
            paidWith: shownPaidWith(
                howPaid({
                    paidWith: booking.paidWith,
                    packRedemption: booking.packRedemption ?? null,
                    subscriptionId: booking.subscriptionId ?? null,
                }),
                free,
            ),
            free,
            priceCents: priceCents ?? booking.service.priceCents,
            paper,
        },
        now,
    );
    const paidOnlineCents = Math.min(pay.paidCents, paidOnlineOnPaper(paper));
    const desk = paidAtDesk(paper);
    const take = deskTake(booking, { priceCents, paper: chargingOnly(paper) });
    return {
        priceCents,
        currency,
        paidOnlineCents,
        deposit: paidOnlineCents > 0 && paidADeposit(booking.snapshot),
        dueCents: pay.dueCents,
        pay,
        refund: refund
            ? {
                  amountCents: refund.amountCents,
                  status:
                      refund.status === "SUCCEEDED" ||
                      refund.status === "FAILED"
                          ? refund.status
                          : "PENDING",
                  beingConfirmed:
                      refund.status === "PENDING" && !refund.providerRefundId,
              }
            : null,
        refundableCents: left?.leftCents ?? 0,
        refundInTimeCancels: rules.refundInTimeCancels,
        treatmentOrderId: booking.orderId ?? null,
        paidAtDeskCents: desk.cents,
        deskMethod: desk.method,
        take: "refusal" in take ? null : take,
    };
}
