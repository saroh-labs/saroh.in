/*
 * A refund recorded by hand ("Record as refunded", UX-061, #865, DEC-116):
 * money handed back outside Saroh — cash, UPI, a transfer — and written on
 * the order. Full amount by default, or another amount: anything above zero
 * up to what is left to refund, which is what the order was paid less every
 * refund on it (online ones, line refunds among them, and earlier ones by
 * hand, `Order.refundedByHand`).
 *
 * The whole of what is left moves the order to REFUNDED, credits the rest
 * of its invoice and takes it off Insights' orders figure (#867). Less
 * leaves it PAID: a credit note for that amount, a step on the timeline,
 * and `refundedByHand` grows, so the money panel, Spent and takings read it
 * net and the next refund knows what is left. Under the order's row lock,
 * in the caller's transaction.
 */

import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { recordOrderRefundedInTx } from "../analytics/order-events";
import type { PaymentMethod } from "../invoices/invoice-state";
import {
    creditPartOfOrder,
    creditRestOfOrder,
} from "../invoices/order-invoicing";
import { leftToRefundCents, refundedByHandNote } from "./hand-payments";
import { capGoodwill } from "./order-refunds";
import { orderMoneyIntents } from "./treatment-ledger";

type Tx = Prisma.TransactionClient;

/** Money as the wire carries it, "49.50", in minor units; null if not money. */
export function moneyCents(raw: string): number | null {
    const typed = raw.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(typed)) return null;
    return Math.round(Number(typed) * 100);
}

/** What one refund by hand hands back, and whether it is all that was left. */
export interface HandRefundPlan {
    amountCents: number;
    full: boolean;
}

/**
 * The amount asked, judged against what is left: none asked is everything
 * left; another amount must be above zero and no more than is left
 * (`capGoodwill`'s words, as the online "another amount" says them).
 * Pure.
 */
export function planHandRefund(
    asked: string | undefined,
    leftCents: number,
    currency: string,
): HandRefundPlan {
    if (asked === undefined) return { amountCents: leftCents, full: true };
    const amountCents = moneyCents(asked);
    if (amountCents === null) {
        throw new BadRequestException({
            message: "Type an amount like 50 or 49.50.",
            field: "refundAmount",
        });
    }
    if (amountCents <= 0) {
        throw new BadRequestException({
            message: "Type an amount above zero.",
            field: "refundAmount",
        });
    }
    capGoodwill(amountCents, leftCents, currency);
    return { amountCents, full: amountCents >= leftCents };
}

/** Reads what is left to refund on the order, under the caller's lock. */
export async function readLeftToRefundInTx(
    tx: Pick<Tx, "order" | "paymentIntent">,
    orderId: string,
): Promise<{ leftCents: number; currency: string }> {
    const [order, paid] = await Promise.all([
        tx.order.findUniqueOrThrow({
            where: { id: orderId },
            select: {
                total: true,
                currency: true,
                paymentStatus: true,
                paidByHand: true,
                refundedByHand: true,
            },
        }),
        tx.paymentIntent.findMany({
            where: { ...orderMoneyIntents(orderId), status: "SUCCEEDED" },
            select: {
                amountCents: true,
                refunds: {
                    where: { status: { not: "FAILED" } },
                    select: { amountCents: true },
                },
            },
        }),
    ]);
    return {
        leftCents: leftToRefundCents({ ...order, paymentIntents: paid }),
        currency: order.currency,
    };
}

/**
 * An online refund never hands back more than is left on the ORDER (#865,
 * DEC-116): its payments' own balances don't know what went back by hand,
 * so the refund core checks this too, under the order's row lock it holds,
 * in the same transaction that creates the refund rows. "At most ₹X can be
 * refunded." in the online "another amount"'s words. Nothing to check
 * without the order.
 */
export async function assertWithinOrderLeftInTx(
    tx: Pick<Tx, "order" | "paymentIntent">,
    orderId: string,
    amountCents: number,
    currency: string,
): Promise<void> {
    const [order, paid] = await Promise.all([
        tx.order.findUnique({
            where: { id: orderId },
            select: {
                total: true,
                paymentStatus: true,
                paidByHand: true,
                refundedByHand: true,
            },
        }),
        tx.paymentIntent.findMany({
            where: { ...orderMoneyIntents(orderId), status: "SUCCEEDED" },
            select: {
                amountCents: true,
                refunds: {
                    where: { status: { not: "FAILED" } },
                    select: { amountCents: true },
                },
            },
        }),
    ]);
    if (!order) return;
    capGoodwill(
        amountCents,
        leftToRefundCents({ ...order, paymentIntents: paid }),
        currency,
    );
}

/**
 * Writes a refund by hand the caller has planned and, for a full one,
 * already moved to REFUNDED: the credit note (the rest of the invoice, or
 * this amount spread over its lines), what was handed back on the order,
 * Insights' `order.refunded` for a full one only (#867: that figure is net
 * of full refunds by design), and the REFUND step with the amount and how.
 */
export async function recordHandRefundInTx(
    tx: Tx,
    input: {
        orderId: string;
        organizationId: string | null;
        userId: string;
        how: PaymentMethod | undefined;
        plan: HandRefundPlan;
    },
): Promise<void> {
    const { orderId, plan } = input;
    if (plan.full) {
        await creditRestOfOrder(tx, orderId, "Refunded", input.userId);
        // Off Insights' orders figure again (#867).
        await recordOrderRefundedInTx(tx, orderId);
    } else {
        await creditPartOfOrder(
            tx,
            orderId,
            plan.amountCents,
            "Refunded",
            input.userId,
        );
    }
    if (plan.amountCents > 0) {
        await tx.order.update({
            where: { id: orderId },
            data: {
                refundedByHand: {
                    increment: (plan.amountCents / 100).toFixed(2),
                },
            },
        });
    }
    if (input.organizationId) {
        // On the timeline: how much went back, and how (UX-061).
        await tx.orderEvent.create({
            data: {
                organizationId: input.organizationId,
                orderId,
                kind: "REFUND",
                actorUserId: input.userId,
                note: refundedByHandNote(input.how),
                amountCents: plan.amountCents,
            },
        });
    }
}
