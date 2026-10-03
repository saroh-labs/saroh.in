import type { Prisma } from "@saroh/database";

import {
    bookingPaymentInTx,
    bookingRefundKey,
} from "../payments/booking-refund";
import type { BookingRulesValue } from "./booking-rules";
import type { DeskTake } from "./desk-take";
import {
    BOOKING_PAPER,
    BOOKING_PAPER_SELECT,
    deskTake,
    paidAtDesk,
} from "./desk-take";

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
     * The price less what was paid online, while it stands and is paid for
     * with money — at the desk, or online in part. Null for a pack's or a
     * membership's class, and once cancelled.
     */
    dueCents: number | null;
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
 * What is still due at the visit (default 50): the price less what was paid
 * online and at the desk (P2), while the booking stands and is paid for with
 * money — at the desk, or online in part. Null for a pack's or a
 * membership's class, and once cancelled. The calendar's Due (E19) reads the
 * same rule.
 */
export function bookingDueCents(
    booking: { status: string; paidWith: string | null; snapshot: unknown },
    paidOnlineCents: number,
    paidAtDeskCents = 0,
): number | null {
    const { priceCents } = bookingPrice(booking.snapshot);
    const byMoney =
        booking.paidWith === "DESK" ||
        booking.paidWith === "PAID" ||
        paidOnlineCents > 0;
    if (booking.status === "CANCELLED" || !byMoney || priceCents === null) {
        return null;
    }
    return Math.max(0, priceCents - paidOnlineCents - paidAtDeskCents);
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
        paidWith: string | null;
        /** A visit of a treatment (E9): the order its money is on. */
        orderId?: string | null;
        /** A course's session (ADR-007): paid for with the course. */
        courseEnrollmentId?: string | null;
        snapshot: unknown;
    },
    rules: Pick<BookingRulesValue, "refundInTimeCancels"> = REFUNDS_BY_DEFAULT,
): Promise<BookingMoney> {
    const { priceCents, currency } = bookingPrice(booking.snapshot);
    const cancelled = booking.status === "CANCELLED";
    const [paid, refund, left, paper] = await Promise.all([
        db.paymentIntent.aggregate({
            where: {
                organizationId: booking.organizationId,
                status: "SUCCEEDED",
                invoice: {
                    bookingId: booking.id,
                    source: "BOOKING",
                    kind: "INVOICE",
                    status: { in: ["PAID", "CREDITED"] },
                },
            },
            _sum: { amountCents: true },
        }),
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
            select: BOOKING_PAPER_SELECT,
        }),
    ]);
    const paidOnlineCents = paid._sum.amountCents ?? 0;
    const desk = paidAtDesk(paper);
    const take = deskTake(booking, {
        priceCents,
        paidOnlineCents,
        paidAtDeskCents: desk.cents,
        paper,
    });
    return {
        priceCents,
        currency,
        paidOnlineCents,
        deposit: paidOnlineCents > 0 && paidADeposit(booking.snapshot),
        dueCents: bookingDueCents(booking, paidOnlineCents, desk.cents),
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
