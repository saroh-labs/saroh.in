import type { Prisma } from "@saroh/database";

/*
 * A treatment's money (E9, DEC-050). A treatment booked online is paid at
 * booking through its first visit's own invoice — the deposit or the whole
 * price — and that invoice is the order's (it names the order). The payment
 * therefore hangs off the invoice, not the order, so every reader of what
 * an order was paid counts these too: the order's read, its row in the
 * list and its pay link. A balance recorded by hand at the clinic marks the
 * order paid with no payment behind it (`balanceByHand`).
 */

/** An order's SUCCEEDED payments with their refunds, as the readers take them. */
export const LEDGER_PAYMENTS = {
    where: { status: "SUCCEEDED" },
    select: {
        amountCents: true,
        refunds: {
            where: { status: { not: "FAILED" } },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                amountCents: true,
                forEdit: true,
                status: true,
                providerRefundId: true,
            },
        },
    },
} as const satisfies Prisma.Order$paymentIntentsArgs;

/** The order's invoice that a booking paid at booking (a treatment's). */
export const BOOKING_INVOICES = {
    where: { source: "BOOKING", kind: "INVOICE" },
    select: { paymentIntents: LEDGER_PAYMENTS },
} as const satisfies Prisma.Order$invoicesArgs;

/**
 * The order with its treatment's booking payments counted as its own, and
 * whether the rest was recorded by hand: paid, with money taken online at
 * booking (a deposit) and the balance at the clinic.
 */
export function withBookingPayments<
    I,
    O extends { paymentStatus: string; paymentIntents: I[] },
>(
    order: O,
    bookingInvoices: readonly { paymentIntents: I[] }[] | undefined,
): O & { balanceByHand: boolean } {
    const booking = (bookingInvoices ?? []).flatMap((i) => i.paymentIntents);
    return {
        ...order,
        paymentIntents: [...order.paymentIntents, ...booking],
        balanceByHand: order.paymentStatus === "PAID" && booking.length > 0,
    };
}

/**
 * Every payment that is the order's own money: its own intents, and a
 * treatment's payments on the booking invoice that names it (a deposit or
 * the whole price paid at booking). What a refund of the order may hand
 * back, and where a refund of it is looked for.
 */
export function orderMoneyIntents(
    orderId: string,
): Prisma.PaymentIntentWhereInput {
    return {
        OR: [
            { orderId },
            {
                orderId: null,
                invoice: { orderId, source: "BOOKING", kind: "INVOICE" },
            },
        ],
    };
}
