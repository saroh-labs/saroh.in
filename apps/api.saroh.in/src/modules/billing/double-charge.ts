import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type { BillingEventPhase } from "./providers/billing-provider.port";

import {
    BILLING_NOTE_AUTHOR,
    raiseBillingOpsNoticeInTx,
} from "./billing-ops-notice";

type Tx = Prisma.TransactionClient;

/**
 * A double charge is refunded automatically, through the provider (DEC-164,
 * owner 17 Oct 2026: "for double charge we can make the payment automatic
 * refund"). A payment that would have the business pay twice for one
 * period — a checkout it dropped approved while another paid plan runs, a
 * charge on a subscription Saroh ended or left while another plan bills it
 * — has its autopay stopped (the caller's `enqueueProviderCancel`), no
 * Saroh invoice written, and a `billing.refund.double-charge` job queued
 * that gives the payment back in full (`double-charge-refund.job.ts`).
 * Every other refund (a discretionary one a business asks for) stays the
 * owner's, by hand in the provider's dashboard; a cancel mid-period is
 * never refunded.
 *
 * Once per payment however often the provider repeats the event: the
 * platform audit row (`AdminAuditEvent.idempotencyKey`
 * `saroh-refund:<provider>:<payment>`) is the claim, on the webhook's
 * transaction, and the job is queued only by the event that wrote it.
 */
export const BILLING_REFUND_TYPE = "billing.refund.double-charge";

/** Tries before the queue gives up (its backoff: 1 s doubling, 5 min cap). */
export const REFUND_MAX_ATTEMPTS = 10;

/** The claim: a refund is owed and queued. */
export const REFUND_AUDIT_ACTION = "billing.double_charge.refund";
/** Written once the provider refunded. */
export const REFUNDED_AUDIT_ACTION = "billing.double_charge.refunded";

export interface DoubleChargeRefundPayload {
    provider: string;
    providerPaymentId: string;
    providerSubscriptionId: string;
    /** The payment's amount from the webhook, when it carried one. */
    amountPaise: number | null;
    /** Why it is a double charge, in an operator's words. */
    reason: string;
}

export const refundClaimKey = (provider: string, paymentId: string) =>
    `saroh-refund:${provider}:${paymentId}`;
export const refundDoneKey = (provider: string, paymentId: string) =>
    `saroh-refunded:${provider}:${paymentId}`;

export const providerName = (provider: string) =>
    provider.toLowerCase() === "razorpay" ? "Razorpay" : provider;

/** "₹1,180" from paise. */
export const rupees = (paise: number) =>
    `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * A double charge, on the caller's transaction: claimed once per payment,
 * then a job asks the provider to refund it. With no payment id on the
 * event (nothing to refund by), the owner is told to find it and refund it
 * by hand.
 */
export async function recordDoubleChargeInTx(
    tx: Tx,
    logger: Pick<Logger, "error" | "warn">,
    input: {
        organizationId: string;
        provider: string;
        providerSubscriptionId: string;
        providerPaymentId: string | null | undefined;
        amountPaise?: number | null;
        reason: string;
        /** What the event said happened; see below. */
        phase?: BillingEventPhase;
    },
): Promise<void> {
    const where = providerName(input.provider);
    const paymentId = input.providerPaymentId;
    // Razorpay's `subscription.activated` names no payment; the
    // `subscription.charged` that follows it does, and that one claims and
    // refunds it. A note now would tell the owner to refund by hand a
    // payment Saroh refunds itself a moment later. An authorisation
    // (`authenticated`) with an upfront charge is still noted: no charge
    // event may follow it once its autopay is cancelled.
    if (!paymentId && input.phase === "activated") {
        logger.warn(
            `billing_double_charge_awaits_payment org=${input.organizationId} sub=${input.providerSubscriptionId}: the charge event that names the payment settles it`,
        );
        return;
    }
    if (!paymentId) {
        await raiseBillingOpsNoticeInTx(tx, logger, {
            code: "billing_double_charge_refund_owed",
            organizationId: input.organizationId,
            refs: {
                provider: input.provider,
                subscription: input.providerSubscriptionId,
            },
            note: `A payment charged the business twice (${input.reason}), but ${where}'s event named no payment, so Saroh couldn't refund it. Find it in the ${where} dashboard under subscription ${input.providerSubscriptionId} and refund it there by hand. Its autopay has been stopped.`,
        });
        return;
    }
    const amountPaise =
        typeof input.amountPaise === "number" ? input.amountPaise : null;
    const claimed = await tx.adminAuditEvent.createMany({
        data: [
            {
                actorUserId: BILLING_NOTE_AUTHOR,
                permission: "system",
                action: REFUND_AUDIT_ACTION,
                targetType: "payment",
                targetId: paymentId,
                organizationId: input.organizationId,
                reason: input.reason,
                // The claim itself succeeded; its action says a refund is
                // owed. A migration's check allows only SUCCESS, FAILURE or
                // DENIED here, which `db push` (the integration suite)
                // doesn't build, so a test can't catch another value.
                outcome: "SUCCESS",
                idempotencyKey: refundClaimKey(input.provider, paymentId),
                metadata: {
                    provider: input.provider,
                    providerSubscriptionId: input.providerSubscriptionId,
                    amountPaise,
                },
            },
        ],
        skipDuplicates: true,
    });
    if (claimed.count === 0) return;
    const payload: DoubleChargeRefundPayload = {
        provider: input.provider,
        providerPaymentId: paymentId,
        providerSubscriptionId: input.providerSubscriptionId,
        amountPaise,
        reason: input.reason,
    };
    await tx.job.create({
        data: {
            type: BILLING_REFUND_TYPE,
            organizationId: input.organizationId,
            maxAttempts: REFUND_MAX_ATTEMPTS,
            payload: { ...payload },
        },
    });
    logger.warn(
        `billing_double_charge_refund_queued org=${input.organizationId} payment=${paymentId}: ${input.reason}`,
    );
}
