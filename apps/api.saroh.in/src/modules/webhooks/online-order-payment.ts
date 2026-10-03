import type { Prisma } from "@saroh/database";

import { ensureOrderInvoice } from "../invoices/order-invoicing";
import type { PaymentStatus } from "../orders/dto";
import {
    CHECKOUT_PAID_LATE,
    CHECKOUT_SOLD_OUT,
    closeCheckoutInTx,
} from "../orders/online-checkout";
import { reserveOnPayment, STOCK_HELD } from "../stock/reserve";
import type { NormalizedWebhookEvent } from "./providers/webhook-provider.port";

type Tx = Prisma.TransactionClient;

/** The intent as the webhook loaded it, with its status under its lock. */
export interface OnlineIntent {
    id: string;
    organizationId: string;
    provider: string;
    providerIntentId?: string | null;
    status: string;
}

/**
 * Whether another payment of the order already held its units — so this
 * one is the balance of a site checkout's order that costs more since it
 * was paid (B9: a dearer way to fulfil it, or an edit), taken by its pay
 * link. It holds nothing: the units are held once, by the payment that
 * made it an order. The caller settles it as any order's second payment.
 */
export async function heldByAnotherPayment(
    tx: Tx,
    orderId: string,
    paymentIntentId: string,
): Promise<boolean> {
    const held = await tx.paymentAttempt.findFirst({
        where: {
            status: STOCK_HELD,
            paymentIntentId: { not: paymentIntentId },
            paymentIntent: { orderId },
        },
        select: { id: true },
    });
    return held !== null;
}

/**
 * A payment for an order the site's checkout started (round-2 G13; R5).
 *
 * The order held nothing while it waited. Now, first — in reserve.ts's lock
 * order: the intent (already locked by the caller), then the order, then
 * the rows — `reserveOnPayment` holds its units:
 *
 * - **HELD:** the order moves to PAID, `paidAt` is set and its invoice is
 *   made (DEC-023). From then on it shows in Orders.
 * - **REFUSED** (another payment took the last unit, or the checkout had
 *   closed): the money is recorded as received and owed back, the refund
 *   row waits PENDING, and the checkout closes. It is never shown as a paid
 *   order. The caller writes the job that sends the refund on this
 *   transaction (`send-refund.handler.ts`), with DEC-032's words.
 *
 * Idempotent: a repeat of the payment's webhook reads the same answer from
 * `reserveOnPayment`, and every write below checks the state it moves from.
 */
export async function applyOnlineOrderSuccess(
    tx: Tx,
    intent: OnlineIntent,
    orderId: string,
    event: NormalizedWebhookEvent,
    moveOrderPayment: (target: PaymentStatus) => Promise<boolean>,
): Promise<{
    applied: boolean;
    refundId: string | null;
    /** This call recorded the refusal and its refund (not a repeat). */
    refundCreated: boolean;
}> {
    const result = await reserveOnPayment(tx, {
        organizationId: intent.organizationId,
        orderId,
        paymentIntentId: intent.id,
    });

    let applied = false;
    if (intent.status !== "SUCCEEDED") {
        await tx.paymentIntent.update({
            where: { id: intent.id },
            data: { status: "SUCCEEDED" },
        });
        applied = true;
        // The provider's payment id, so a refund can name it.
        if (event.providerPaymentRef) {
            await tx.paymentAttempt.create({
                data: {
                    organizationId: intent.organizationId,
                    paymentIntentId: intent.id,
                    provider: intent.provider,
                    providerRef: event.providerPaymentRef,
                    status: "CAPTURED",
                },
            });
        }
    }

    if (result.kind === "HELD") {
        if (await moveOrderPayment("PAID")) {
            await tx.order.update({
                where: { id: orderId },
                data: { paidAt: new Date() },
            });
            await ensureOrderInvoice(tx, orderId, {
                method: "ONLINE",
                reference:
                    event.providerPaymentRef ?? intent.providerIntentId ?? null,
            });
            applied = true;
        }
        return { applied, refundId: null, refundCreated: false };
    }

    // Refused: the checkout closes (a no-op when it had closed already), and
    // the refund goes out from its job. A repeat finds the same refund row
    // and writes no second job.
    const closed = await closeCheckoutInTx(
        tx,
        orderId,
        result.refusal ? CHECKOUT_SOLD_OUT : CHECKOUT_PAID_LATE,
    );
    return {
        applied: applied || closed || result.created,
        refundId: result.refundId,
        refundCreated: result.created,
    };
}
