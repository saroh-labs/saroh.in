import type { Prisma } from "@saroh/database";

import { cancelTreatmentVisitsInTx } from "../bookings/treatment-cancel";
import type { OrderStage } from "./dto";
import { isHandedOver, typeOf } from "./fulfilment";
import { applyInventoryTransition, phaseOf } from "./order-inventory";
import { retireOrderPayLinkInTx } from "./order-pay-link";
import { orderMoneyIntents } from "./treatment-ledger";

/*
 * "Cancel order…" is a refund in full, and the order is kept as cancelled
 * (round-2 B9, R7; DESIGN-NOTES "Orders are never deleted").
 *
 * What was paid online goes back through the order's one refund path
 * (`PaymentsService.refundOrderForCancel`, DEC-026): its rows carry a key
 * that says a cancel asked for them. The order is marked cancelled only
 * once nothing it took online is left and the provider has answered for
 * every refund in flight — so a refund whose answer was lost keeps the
 * order open, its money held, until the refund webhook or a try-again
 * settles it ({@link finishCancelInTx}, called from each of those paths).
 * Promised stock comes back when the provider confirms each refund
 * (DEC-032, `settleRefundStock`), never earlier.
 *
 * An order with nothing paid online — unpaid, or paid by hand — is
 * cancelled at once ({@link completeCancelInTx}), its stock released there.
 */

type Tx = Prisma.TransactionClient;

/** The start of every refund key a cancel makes. */
export const CANCEL_KEY_PREFIX = "order-cancel:";

/** The keys of one order's cancel refunds start with this. */
export function cancelKeyPrefix(orderId: string): string {
    return `${CANCEL_KEY_PREFIX}${orderId}:`;
}

/**
 * The refund key for one cancel request: the order and the sheet's own
 * key, so a retry of the same request finds the refund it made, and a new
 * request after a refusal makes a new one.
 */
export function cancelRefundKey(orderId: string, requestKey: string): string {
    return `${cancelKeyPrefix(orderId)}${requestKey}`;
}

/** Whether a refund was made by a cancel. */
export function isCancelRefundKey(key: string | null | undefined): boolean {
    return typeof key === "string" && key.startsWith(CANCEL_KEY_PREFIX);
}

/** What says whether an order can still be cancelled. */
export interface CancelFacts {
    status: string;
    paymentStatus: string;
    stage: string;
    fulfilment: string;
    /** A visit of the treatment was attended: it has begun (E9). */
    treatmentBegun?: boolean;
}

/**
 * Why the order can't be cancelled, in the merchant's words; null when it
 * can. From its handover on it can't (DEC-045), but a refund still can.
 */
export function cancelRefusal(order: CancelFacts): string | null {
    if (order.status === "CANCELLED") return "This order is already cancelled.";
    if (order.paymentStatus === "REFUNDED") {
        return "It's already refunded in full.";
    }
    if (order.treatmentBegun) {
        return "A visit has been attended, so the treatment can't be cancelled. Refund it instead.";
    }
    if (
        order.status === "SHIPPED" ||
        order.status === "DELIVERED" ||
        isHandedOver(typeOf(order.fulfilment), order.stage as OrderStage)
    ) {
        return "It has been handed over, so it can't be cancelled. Refund it instead.";
    }
    return null;
}

/**
 * Mark the order cancelled, on the caller's transaction and under its row
 * lock: the status, its pay link retired, a treatment's visits still to
 * come cancelled, and the step on the timeline with the reason. Stock is
 * released here only with `releaseStock` — an order whose money went back
 * through the provider gives its units back as each refund is confirmed.
 * Returns false when it was already cancelled.
 */
export async function completeCancelInTx(
    tx: Tx,
    input: {
        orderId: string;
        actorUserId: string | null;
        reason: string | null;
        releaseStock: boolean;
        now?: Date;
    },
): Promise<boolean> {
    const order = await tx.order.findUnique({
        where: { id: input.orderId },
        select: {
            id: true,
            organizationId: true,
            status: true,
            stage: true,
            items: { select: { id: true } },
        },
    });
    if (!order || order.status === "CANCELLED") return false;
    if (input.releaseStock) {
        await applyInventoryTransition(
            tx,
            order.items,
            phaseOf(order.status),
            "RELEASED",
            input.actorUserId,
        );
    }
    const { count } = await tx.order.updateMany({
        where: { id: order.id, status: { not: "CANCELLED" } },
        data: { status: "CANCELLED" },
    });
    if (count === 0) return false;
    await retireOrderPayLinkInTx(tx, order.id);
    if (order.organizationId) {
        await cancelTreatmentVisitsInTx(tx, {
            organizationId: order.organizationId,
            orderId: order.id,
            actorUserId: input.actorUserId,
            now: input.now ?? new Date(),
        });
        await tx.orderEvent.create({
            data: {
                organizationId: order.organizationId,
                orderId: order.id,
                kind: "STATUS",
                actorUserId: input.actorUserId,
                fromStage: order.stage,
                toStage: order.stage,
                fromStatus: order.status,
                toStatus: "CANCELLED",
                note: input.reason,
            },
            select: { id: true },
        });
    }
    return true;
}

/** What is still to go back online, and whether a refund awaits its answer. */
export async function onlineRefundableInTx(
    tx: Pick<Tx, "paymentIntent">,
    orderId: string,
): Promise<{ leftCents: number; unanswered: number }> {
    const payments = await tx.paymentIntent.findMany({
        where: { ...orderMoneyIntents(orderId), status: "SUCCEEDED" },
        select: {
            amountCents: true,
            providerIntentId: true,
            refunds: {
                where: { status: { not: "FAILED" } },
                select: {
                    amountCents: true,
                    status: true,
                    providerRefundId: true,
                },
            },
        },
    });
    let leftCents = 0;
    let unanswered = 0;
    for (const p of payments) {
        const back = p.refunds.reduce((s, r) => s + r.amountCents, 0);
        if (p.providerIntentId) leftCents += Math.max(0, p.amountCents - back);
        unanswered += p.refunds.filter(
            (r) => r.status === "PENDING" && !r.providerRefundId,
        ).length;
    }
    return { leftCents, unanswered };
}

/**
 * Finish a cancel whose money went back online, once it can be: a cancel
 * asked for it (a refund row with its key, not failed), nothing taken
 * online is left, and the provider has answered for every refund in
 * flight. Called under the order's row lock by each path that learns of a
 * refund — the cancel itself, a try-again, the send job and the refund
 * webhook — so whichever comes last finishes it, once. Returns whether
 * this call cancelled the order.
 */
export async function finishCancelInTx(
    tx: Tx,
    orderId: string,
    actorUserId: string | null,
): Promise<boolean> {
    const asked = await tx.paymentRefund.findFirst({
        where: {
            idempotencyKey: { startsWith: cancelKeyPrefix(orderId) },
            status: { not: "FAILED" },
            paymentIntent: orderMoneyIntents(orderId),
        },
        orderBy: { createdAt: "asc" },
        select: { reason: true, idempotencyKey: true },
    });
    if (!asked?.idempotencyKey?.startsWith(cancelKeyPrefix(orderId))) {
        return false;
    }
    const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
    });
    if (!order || order.status === "CANCELLED") return false;
    const { leftCents, unanswered } = await onlineRefundableInTx(tx, orderId);
    if (leftCents > 0 || unanswered > 0) return false;
    return completeCancelInTx(tx, {
        orderId,
        actorUserId,
        reason: asked.reason,
        releaseStock: false,
    });
}

/**
 * Whether a cancel is waiting on its refund: asked, and the order not yet
 * cancelled. Order Detail says so instead of offering Cancel again.
 */
export async function cancelPendingInTx(
    db: Pick<Tx, "paymentRefund">,
    orderId: string,
): Promise<boolean> {
    const asked = await db.paymentRefund.count({
        where: {
            idempotencyKey: { startsWith: cancelKeyPrefix(orderId) },
            status: { not: "FAILED" },
            paymentIntent: orderMoneyIntents(orderId),
        },
    });
    return asked > 0;
}
