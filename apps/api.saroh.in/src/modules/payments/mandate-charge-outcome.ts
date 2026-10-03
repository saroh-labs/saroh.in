import type { Prisma } from "@saroh/database";

import {
    CAPTURED_NEEDS_REFUND,
    ONLINE_PAYMENT_METHOD,
} from "../invoices/invoice-state";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import type { SubscriptionEventKind } from "../subscriptions/subscription-events";
import {
    JOB,
    recordSubscriptionEvent,
} from "../subscriptions/subscription-events";

import { providerName } from "./mandate-rules";

/**
 * What a renewal's autopay charge came to (round-2 D13), written on the
 * caller's transaction: the payment webhook (`webhooks.service.ts`), the
 * charge job, and Retry's look-up all end here, so a lost webhook and a
 * late one settle the same way.
 *
 * - **Charged:** CHARGED on the subscription's log (actor JOB).
 * - **Failed:** RENEWAL_FAILED (`data.reason`); Home's failed-renewal
 *   source reads it ("Payment failed"), the pay link opens again, and a
 *   decline tells the team as a failed pay link does (F14). Saroh sends
 *   the customer nothing.
 * - **Limit too low:** MANDATE_LIMIT_LOW (`data.limit`, `data.amount`), and
 *   nothing is charged.
 */

type Tx = Prisma.TransactionClient;

/** Why an autopay charge came to nothing, as RENEWAL_FAILED says it. */
export type ChargeFailure =
    /** The bank or the provider declined the debit. */
    | "DECLINED"
    /** The provider's pre-debit notice didn't reach the customer. */
    | "NOTICE_FAILED"
    /** The notice never came back delivered, so no debit could be asked. */
    | "NOTICE_NOT_DELIVERED"
    /** The provider refused to prepare or take the charge. */
    | "PROVIDER_REFUSED"
    /**
     * Not asked: the customer had a pay-link checkout open on the invoice
     * (`checkoutOpenOn`), so autopay stood aside. Nothing was declined.
     */
    | "CHECKOUT_OPEN";

/** Write one charge event on the invoice's subscription; false when it has none. */
export async function recordChargeEventInTx(
    tx: Tx,
    organizationId: string,
    invoiceId: string,
    kind: Extract<
        SubscriptionEventKind,
        "CHARGED" | "RENEWAL_FAILED" | "MANDATE_LIMIT_LOW"
    >,
    data?: Record<string, string | number>,
): Promise<boolean> {
    const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, organizationId },
        select: { subscriptionId: true },
    });
    if (!invoice?.subscriptionId) return false;
    await recordSubscriptionEvent(
        tx,
        organizationId,
        invoice.subscriptionId,
        kind,
        JOB,
        { invoiceId, ...(data ? { data } : {}) },
    );
    return true;
}

/**
 * A charge's debit was declined: the intent moves to FAILED (only from an
 * open state, so a capture committed meanwhile stands), RENEWAL_FAILED is
 * written and the team is told. Returns whether it moved.
 */
export async function failMandateChargeInTx(
    tx: Tx,
    organizationId: string,
    intentId: string,
    reason: ChargeFailure = "DECLINED",
): Promise<boolean> {
    const intent = await tx.paymentIntent.findFirst({
        where: { id: intentId, organizationId },
        select: { invoiceId: true },
    });
    if (!intent?.invoiceId) return false;
    const { count } = await tx.paymentIntent.updateMany({
        where: {
            id: intentId,
            status: { in: ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"] },
        },
        data: { status: "FAILED" },
    });
    if (count === 0) return false;
    await recordChargeEventInTx(
        tx,
        organizationId,
        intent.invoiceId,
        "RENEWAL_FAILED",
        { reason },
    );
    await enqueueTeamAlert(tx, organizationId, {
        event: "failed",
        invoiceId: intent.invoiceId,
        paymentIntentId: intentId,
    });
    return true;
}

/**
 * A charge the provider says was captured, found by a look-up rather than
 * its webhook (Retry, or the job's last look): settled as the webhook
 * would — intent, then invoice (the lock order) — so the webhook arriving
 * later finds it done. An invoice no longer ISSUED keeps the money as owed
 * back (CAPTURED_NEEDS_REFUND), exactly as the webhook records it.
 */
export async function settleCapturedChargeInTx(
    tx: Tx,
    organizationId: string,
    intentId: string,
    providerPaymentRef: string | null,
    now: Date = new Date(),
): Promise<"PAID" | "OWED_BACK" | "ALREADY"> {
    const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM "PaymentIntent" WHERE id = ${intentId} AND "organizationId" = ${organizationId} FOR NO KEY UPDATE`;
    const intent = await tx.paymentIntent.findFirst({
        where: { id: intentId, organizationId },
        select: {
            invoiceId: true,
            provider: true,
            providerIntentId: true,
        },
    });
    if (!intent?.invoiceId || locked[0]?.status === "SUCCEEDED") {
        return "ALREADY";
    }
    const invoiceId = intent.invoiceId;
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, organizationId },
        select: { status: true },
    });
    await tx.paymentIntent.update({
        where: { id: intentId },
        data: { status: "SUCCEEDED" },
    });
    if (invoice?.status === "ISSUED") {
        await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                status: "PAID",
                paidAt: now,
                paymentMethod: ONLINE_PAYMENT_METHOD,
                paymentReference:
                    providerPaymentRef ?? intent.providerIntentId ?? null,
                paymentNote: `Paid online through ${providerName(intent.provider)}`,
            },
        });
        await tx.paymentAttempt.create({
            data: {
                organizationId,
                paymentIntentId: intentId,
                provider: intent.provider,
                providerRef: providerPaymentRef,
                status: "CAPTURED",
            },
        });
        await recordChargeEventInTx(tx, organizationId, invoiceId, "CHARGED");
        return "PAID";
    }
    await tx.paymentAttempt.create({
        data: {
            organizationId,
            paymentIntentId: intentId,
            provider: intent.provider,
            providerRef: providerPaymentRef,
            status: CAPTURED_NEEDS_REFUND,
            rawResponse: { invoiceStatus: invoice?.status ?? "MISSING" },
        },
    });
    return "OWED_BACK";
}
