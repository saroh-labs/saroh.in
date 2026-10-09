import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { issueCreditNote, loadTaxProfile } from "../invoices/order-invoicing";
import { MAX_CENTS } from "../invoices/totals";
import type { SubscriptionEventLog } from "./subscription-events";

/**
 * An early renewal invoice dropped before its period begins (round-2 D13B,
 * DEC-065).
 *
 * Under "Charge on the renewal date" the renewal invoice, and the bank's
 * notice, go out a couple of days before the period starts. If the
 * subscription is then cancelled (now or at period end), paused, or its
 * plan changed for that renewal, that period will not be billed as
 * invoiced, so the early invoice is dropped and its autopay charge
 * cancelled before any debit:
 *
 * - its open charge (CREATED or REQUIRES_PAYMENT) is CANCELLED, so the job
 *   lets it go and nothing is debited. One whose debit was already asked
 *   for (PROCESSING) can't be taken back: then nothing is dropped, and the
 *   payment settles as any other (logged). It can't normally happen — the
 *   debit is planned for the renewal date, after the period begins.
 * - the invoice is voided, or, for a GST-registered business, which never
 *   voids an issued invoice (DEC-023), credited in full with a credit note.
 *   Either way it no longer counts as the period's invoice, so if the
 *   subscription carries on (Keep, a resume) the renewal invoices the
 *   period on the renewal date.
 * - EARLY_INVOICE_CANCELLED is written to the subscription's log.
 *
 * A PAID early invoice (paid another way) is left alone. Called under the
 * subscription's row lock, in the caller's transaction.
 */

export const EARLY_DROP_REASONS = [
    "CANCELLED",
    "PAUSED",
    "PLAN_CHANGED",
] as const;
export type EarlyDropReason = (typeof EARLY_DROP_REASONS)[number];

const VOID_REASON: Record<EarlyDropReason, string> = {
    CANCELLED: "The subscription was cancelled before this period began.",
    PAUSED: "The subscription was paused before this period began.",
    PLAN_CHANGED:
        "The plan changed before this period began. The renewal invoices the new plan.",
};

const logger = new Logger("EarlyRenewal");

type Tx = Prisma.TransactionClient;

export async function dropEarlyRenewalInTx(
    tx: Tx,
    input: {
        organizationId: string;
        subscriptionId: string;
        /** The next period's start: the subscription's `currentPeriodEnd`. */
        periodStart: Date;
        reason: EarlyDropReason;
        now: Date;
        log: SubscriptionEventLog;
    },
): Promise<"VOIDED" | "CREDITED" | null> {
    const { organizationId, subscriptionId, periodStart, reason, now } = input;
    // Only an invoice for a period still to come is early.
    if (periodStart <= now) return null;
    const invoice = await tx.invoice.findFirst({
        where: {
            organizationId,
            subscriptionId,
            periodStart,
            kind: "INVOICE",
            source: "SUBSCRIPTION",
            status: "ISSUED",
        },
        select: { id: true, sellerGstin: true },
    });
    if (!invoice) return null;
    const asked = await tx.paymentIntent.count({
        where: {
            organizationId,
            invoiceId: invoice.id,
            status: "PROCESSING",
        },
    });
    if (asked > 0) {
        logger.warn(
            `Subscription ${subscriptionId}: its early renewal invoice ${invoice.id} has a debit under way; left to settle`,
        );
        return null;
    }
    await tx.paymentIntent.updateMany({
        where: {
            organizationId,
            invoiceId: invoice.id,
            status: { in: ["CREATED", "REQUIRES_PAYMENT"] },
        },
        data: { status: "CANCELLED" },
    });
    const note = VOID_REASON[reason];
    const profile = await loadTaxProfile(tx, organizationId);
    let by: "VOIDED" | "CREDITED";
    if (invoice.sellerGstin || profile.registered) {
        const credit = await issueCreditNote(tx, {
            invoiceId: invoice.id,
            amountCents: MAX_CENTS,
            note,
            createdByUserId: null,
            at: now,
        });
        if (!credit) return null;
        by = "CREDITED";
    } else {
        const { count } = await tx.invoice.updateMany({
            where: { id: invoice.id, organizationId, status: "ISSUED" },
            data: {
                status: "VOID",
                voidedAt: now,
                voidReason: note,
                payTokenHash: null,
                payLinkCreatedAt: null,
            },
        });
        if (count === 0) return null;
        by = "VOIDED";
    }
    await input.log("EARLY_INVOICE_CANCELLED", {
        invoiceId: invoice.id,
        data: { reason, by },
    });
    logger.log(
        `Subscription ${subscriptionId}: early renewal invoice ${invoice.id} ${by.toLowerCase()} (${reason}); its autopay charge cancelled`,
    );
    return by;
}
