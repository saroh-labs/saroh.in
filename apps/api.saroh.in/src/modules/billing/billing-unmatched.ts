import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { raiseBillingActionInTx } from "./billing-actions";
import { recordRefundInTx } from "./billing-refunds";
import { providerName } from "./double-charge";
import type { ParsedBillingEvent } from "./providers/billing-provider.port";

type Tx = Prisma.TransactionClient;

/**
 * A verified billing webhook that matches no Saroh subscription or
 * checkout (DEC-166). Until 17 Oct 2026 every one was marked processed as
 * "ignored", so a payment Saroh never matched appeared nowhere.
 *
 * - A `refund.*` or `payment.dispute.*` event is kept as a `BillingRefund`
 *   (`billing-refunds.ts`), matched to the invoice by its payment: applied.
 * - An event naming a subscription or order Saroh has no row for, or a
 *   charge with a payment, is an ERROR log and a Needs-action row, once per
 *   event, and is left **not applied** (no `processedAt`), so Admin ›
 *   Billing › Provider events lists it under "Not applied".
 * - Anything else (a `payment.*` event Saroh doesn't use) is ignored, as
 *   before.
 *
 * Returns whether the event counts as applied.
 */
export async function unmatchedEventInTx(
    tx: Tx,
    logger: Pick<Logger, "error" | "warn">,
    provider: string,
    event: ParsedBillingEvent,
): Promise<{ applied: boolean }> {
    if (event.refund) {
        await recordRefundInTx(tx, logger, {
            provider,
            kind: "REFUND",
            providerRefundId: event.refund.providerRefundId,
            providerPaymentId: event.refund.providerPaymentId,
            amountPaise: event.refund.amountPaise,
            status: event.refund.status,
            source: "PROVIDER",
        });
        return { applied: true };
    }
    if (event.dispute) {
        await recordRefundInTx(tx, logger, {
            provider,
            kind: "DISPUTE",
            providerRefundId: event.dispute.providerDisputeId,
            providerPaymentId: event.dispute.providerPaymentId,
            amountPaise: event.dispute.amountPaise,
            status: event.dispute.status,
            reason: event.dispute.reason,
            source: "PROVIDER",
        });
        return { applied: true };
    }
    const charged =
        (event.phase === "charged" || event.phase === "activated") &&
        Boolean(event.providerPaymentId);
    if (!event.providerSubscriptionId && !charged) return { applied: true };

    const where = providerName(provider);
    const ref = event.providerSubscriptionId ?? "none";
    logger.error(
        `billing_webhook_unmatched provider=${provider} event=${event.providerEventId} type=${event.type} ref=${ref} payment=${event.providerPaymentId ?? "none"}`,
    );
    await raiseBillingActionInTx(tx, {
        organizationId: null,
        code: "billing_webhook_unmatched",
        refs: {
            provider,
            event: event.providerEventId,
            subscription: event.providerSubscriptionId,
            payment: event.providerPaymentId,
            customer: event.providerCustomerId,
        },
        note: `${where} sent ${event.type} for ${event.providerSubscriptionId ? `${event.providerSubscriptionId}, which no Saroh business or checkout has` : "a payment Saroh can't match"}${event.providerPaymentId ? ` (payment ${event.providerPaymentId})` : ""}. Find who it belongs to in ${where}'s dashboard (its notes carry Saroh's ids). If money was taken, refund it there or tell the owner.`,
        dedupeKey: `webhook-unmatched:${provider}:${event.providerEventId}`,
    });
    return { applied: false };
}
