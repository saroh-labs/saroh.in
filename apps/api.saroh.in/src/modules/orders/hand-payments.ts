/*
 * What an order has been paid (audit, 6 Oct 2026): every payment it
 * received, wherever it was taken. The order is the ledger (DEC-023), and
 * its money comes from two places:
 *
 *  - online: its SUCCEEDED payment intents, less what was handed back
 *    because an edit lowered the order (a line refund does not lower what
 *    the order costs, so it never counts here);
 *  - by hand: `Order.paidByHand` — cash, UPI or a card machine at the
 *    counter, a payment marked by hand, a difference recorded as paid after
 *    an edit, less what an edit handed back from the till.
 *
 * An order paid by hand before `paidByHand` was kept has 0 there and no
 * online payment: it counts its total, as every reader did before, and the
 * first edit or payment after that writes the real amount.
 */

import type { Prisma } from "@saroh/database";

import type { PaymentMethod } from "../invoices/invoice-state";
import type { CounterPayment } from "./new-order.dto";
import { orderMoneyIntents } from "./treatment-ledger";

interface DecimalLike {
    toString(): string;
}

const cents = (v: DecimalLike) => Math.round(Number(v.toString()) * 100);

/** Online money an order keeps: its payments less what edits handed back. */
export function onlineKeptCents(
    payments: readonly {
        amountCents: number;
        refunds: readonly { amountCents: number; forEdit?: boolean }[];
    }[],
): number {
    return payments.reduce(
        (s, p) =>
            s +
            p.amountCents -
            p.refunds
                .filter((r) => r.forEdit !== false)
                .reduce((t, r) => t + r.amountCents, 0),
        0,
    );
}

/**
 * What the order was paid outside Saroh, in minor units. `paymentIntents`
 * are its SUCCEEDED ones: with none, a paid order whose amount was never
 * recorded counts its total (`total` as it stands before any change the
 * caller is making).
 */
export function handPaidCents(order: {
    total: DecimalLike;
    paymentStatus: string;
    paidByHand?: DecimalLike | null;
    paymentIntents: readonly unknown[];
}): number {
    const recorded = order.paidByHand ? cents(order.paidByHand) : 0;
    if (recorded > 0) return recorded;
    const paid =
        order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED";
    return paid && order.paymentIntents.length === 0 ? cents(order.total) : 0;
}

/**
 * How a difference recorded as paid reads on the order's timeline. The
 * note carries no amount (whoever works the order reads the timeline
 * without money); the step's amount says it to a money reader.
 */
export const DIFFERENCE_PAID_NOTE: Record<CounterPayment, string> = {
    CASH: "Difference paid in cash",
    UPI: "Difference paid by UPI",
    CARD: "Difference paid by card",
};

/**
 * How an order marked paid by hand ("Record as paid", #834) reads on its
 * timeline, by how the business says it was paid. No amount, as above.
 * An app that sends no way says only that it was marked paid.
 */
export const MARKED_PAID_NOTE: Record<PaymentMethod, string> = {
    CASH: "Marked paid · cash",
    UPI: "Marked paid · UPI",
    BANK_TRANSFER: "Marked paid · bank transfer",
    CARD: "Marked paid · card at the counter",
    OTHER: "Marked paid · another way",
};

export function markedPaidNote(how: PaymentMethod | undefined): string {
    return how ? MARKED_PAID_NOTE[how] : "Marked paid by hand";
}

/**
 * Marked paid by hand ("Record as paid"): what it was paid outside Saroh is
 * what its total leaves after the payments it received online, kept on the
 * order, so an edit later asks only for the difference. Under the order's
 * row lock, in the caller's transaction. Returns what was recorded, in
 * minor units.
 */
export async function recordPaidByHandInTx(
    tx: Pick<Prisma.TransactionClient, "order" | "paymentIntent">,
    orderId: string,
): Promise<number> {
    const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { total: true },
    });
    if (!order) return 0;
    const online = await tx.paymentIntent.findMany({
        where: { ...orderMoneyIntents(orderId), status: "SUCCEEDED" },
        select: {
            amountCents: true,
            refunds: {
                where: { status: { not: "FAILED" }, forEdit: true },
                select: { amountCents: true },
            },
        },
    });
    const byHand = Math.max(0, cents(order.total) - onlineKeptCents(online));
    await tx.order.update({
        where: { id: orderId },
        data: { paidByHand: (byHand / 100).toFixed(2) },
    });
    return byHand;
}
