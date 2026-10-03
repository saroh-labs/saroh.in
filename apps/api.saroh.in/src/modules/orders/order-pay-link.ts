import type { Prisma } from "@saroh/database";

import { amountDueCents } from "./order-read";
import { withBookingPayments } from "./treatment-ledger";

/**
 * An order's pay link (plan B, B11), as ADR-007's invoice pay link: a token
 * handed to whoever makes it, once, and kept only as its SHA-256
 * (`invoices/pay-token.ts`). These are the rules both sides share — the
 * staff side that makes a link and the customer's pay page that takes the
 * money — so the two never disagree about whether an order can be paid.
 */

type Tx = Prisma.TransactionClient;

/** The order columns the pay-link rules read. */
export const PAY_LINK_ORDER_SELECT = {
    id: true,
    organizationId: true,
    storeId: true,
    status: true,
    paymentStatus: true,
    // A site checkout's order (G13) holds its stock on its first payment;
    // a later one for its balance (B9) is routed past the hold by the
    // webhook (`online-order-payment.ts` `heldByAnotherPayment`).
    placedOnline: true,
    total: true,
    currency: true,
    store: { select: { settings: { select: { pausedAt: true } } } },
    // What was taken: the SUCCEEDED payments, with the refunds an edit made
    // (money handed back because the order was edited down never counts).
    paymentIntents: {
        where: { status: "SUCCEEDED" },
        select: {
            amountCents: true,
            refunds: {
                where: { status: { not: "FAILED" } },
                select: { amountCents: true, forEdit: true },
            },
        },
    },
    // A treatment's deposit, paid at booking on its invoice (E9): a pay
    // link asks only for the rest.
    invoices: {
        where: { source: "BOOKING", kind: "INVOICE" },
        select: {
            paymentIntents: {
                where: { status: "SUCCEEDED" },
                select: {
                    amountCents: true,
                    refunds: {
                        where: { status: { not: "FAILED" } },
                        select: { amountCents: true, forEdit: true },
                    },
                },
            },
        },
    },
} satisfies Prisma.OrderSelect;

export type PayLinkOrder = Prisma.OrderGetPayload<{
    select: typeof PAY_LINK_ORDER_SELECT;
}>;

/** What clears a pay link: the order was paid online, cancelled or refunded. */
export const RETIRED_PAY_LINK = {
    payTokenHash: null,
    payLinkCreatedAt: null,
} as const;

/** How the order stands for a pay link. */
export type PayLinkStanding = "DUE" | "PAID" | "CLOSED";

/**
 * Due: unpaid, or its payment failed, with money still owed — or paid
 * online and changed since to cost more (B9: a dearer way to fulfil it, or
 * an edit), so what was received falls short of the current total and the
 * balance is owed. That holds for a site checkout's order too. Paid: paid,
 * by hand or online, with nothing more owed; paid by hand, the counter
 * settles any difference. Closed: cancelled or refunded — there is nothing
 * to pay.
 */
export function payLinkStanding(order: PayLinkOrder): PayLinkStanding {
    if (order.status === "CANCELLED" || order.paymentStatus === "REFUNDED") {
        return "CLOSED";
    }
    if (order.paymentStatus === "PAID") {
        return order.paymentIntents.length > 0 && dueCentsOf(order) > 0
            ? "DUE"
            : "PAID";
    }
    if (order.paymentStatus !== "UNPAID" && order.paymentStatus !== "FAILED") {
        return "PAID";
    }
    return dueCentsOf(order) > 0 ? "DUE" : "PAID";
}

/** The order's total less what was taken — what a pay link charges. */
export function dueCentsOf(order: PayLinkOrder): number {
    return amountDueCents(withBookingPayments(order, order.invoices));
}

/**
 * Why the order can't take a payment through a link now, in the merchant's
 * words; null when it can. The pay page says its own words for the same.
 */
export function payLinkRefusal(order: PayLinkOrder): string | null {
    switch (payLinkStanding(order)) {
        case "CLOSED":
            return order.status === "CANCELLED"
                ? "This order is cancelled, so there's nothing to pay."
                : "This order was refunded, so there's nothing to pay.";
        case "PAID":
            return "This order is already paid.";
        default:
            break;
    }
    // A paused storefront takes no payments (the checkout's own rule).
    if (order.store.settings?.pausedAt) {
        return "This location is paused, so it isn't taking payments.";
    }
    return null;
}

/**
 * Stop the order's pay link working, on the caller's transaction (cancelled
 * or refunded by hand). The webhook clears it as it moves the payment.
 */
export async function retireOrderPayLinkInTx(
    tx: Tx,
    orderId: string,
): Promise<void> {
    await tx.order.updateMany({
        where: { id: orderId, payTokenHash: { not: null } },
        data: RETIRED_PAY_LINK,
    });
}
