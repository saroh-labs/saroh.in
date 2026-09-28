import type { Prisma } from "@saroh/database";

import { bookingRefundKey } from "../payments/booking-refund";

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
}

/** Whether a booking's snapshot says only its deposit was paid online. */
export function paidADeposit(snapshot: unknown): boolean {
    const deposit = (snapshot as { deposit?: { cents?: unknown } } | null)
        ?.deposit;
    return typeof deposit?.cents === "number";
}

type Db = Pick<Prisma.TransactionClient, "paymentIntent" | "paymentRefund">;

/** The money of one booking — see {@link BookingMoney}. */
export async function bookingMoney(
    db: Db,
    booking: {
        id: string;
        organizationId: string;
        status: string;
        paidWith: string | null;
        snapshot: unknown;
    },
): Promise<BookingMoney> {
    const terms = (
        booking.snapshot as {
            service?: { priceCents?: unknown; currency?: unknown };
        } | null
    )?.service;
    const priceCents =
        typeof terms?.priceCents === "number" ? terms.priceCents : null;
    const currency =
        typeof terms?.currency === "string" ? terms.currency : null;
    const [paid, refund] = await Promise.all([
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
    ]);
    const paidOnlineCents = paid._sum.amountCents ?? 0;
    const byMoney =
        booking.paidWith === "DESK" ||
        booking.paidWith === "PAID" ||
        paidOnlineCents > 0;
    const stands = booking.status !== "CANCELLED" && byMoney;
    return {
        priceCents,
        currency,
        paidOnlineCents,
        deposit: paidOnlineCents > 0 && paidADeposit(booking.snapshot),
        dueCents:
            stands && priceCents !== null
                ? Math.max(0, priceCents - paidOnlineCents)
                : null,
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
    };
}
