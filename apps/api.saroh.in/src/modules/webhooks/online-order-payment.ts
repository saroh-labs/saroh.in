import type { Prisma } from "@saroh/database";

import { ensureOrderInvoice } from "../invoices/order-invoicing";
import type { PaymentStatus } from "../orders/dto";
import {
    CHECKOUT_PAID_LATE,
    CHECKOUT_SOLD_OUT,
    closeCheckoutInTx,
} from "../orders/online-checkout";
import { reserveOnPayment } from "../stock/reserve";
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
 *   order. The caller sends the refund after its transaction commits
 *   (`PaymentsService.sendAutomaticRefund`), with DEC-032's words.
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
): Promise<{ applied: boolean; refundId: string | null }> {
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
        return { applied, refundId: null };
    }

    // Refused: the checkout closes (a no-op when it had closed already), and
    // the refund goes out after commit. A repeat sends the same refund row,
    // which the provider makes once.
    const closed = await closeCheckoutInTx(
        tx,
        orderId,
        result.refusal ? CHECKOUT_SOLD_OUT : CHECKOUT_PAID_LATE,
    );
    return {
        applied: applied || closed || result.created,
        refundId: result.refundId,
    };
}
