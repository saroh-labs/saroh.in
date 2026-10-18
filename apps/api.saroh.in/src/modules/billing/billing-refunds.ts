import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { raiseBillingActionInTx } from "./billing-actions";
import { providerName, refundClaimKey, rupees } from "./double-charge";

type Tx = Pick<
    Prisma.TransactionClient,
    "billingRefund" | "billingAction" | "sarohInvoice" | "adminAuditEvent"
>;

export type BillingRefundKind = "REFUND" | "DISPUTE";
/** Who first told Saroh of it. */
export type BillingRefundSource = "AUTO" | "MANUAL" | "PROVIDER";

/**
 * How far along a refund or dispute is: a later word never goes back to an
 * earlier one, so a `refund.created` delivered after `refund.processed`
 * changes nothing.
 */
const STATUS_RANK: Record<string, number> = {
    PENDING: 0,
    PROCESSED: 2,
    FAILED: 2,
    OPEN: 0,
    UNDER_REVIEW: 1,
    ACTION_REQUIRED: 1,
    WON: 2,
    LOST: 2,
    CLOSED: 2,
};
const rank = (status: string) => STATUS_RANK[status] ?? 0;

export interface RefundRecordInput {
    provider: string;
    kind: BillingRefundKind;
    providerRefundId: string;
    providerPaymentId: string;
    amountPaise: number | null;
    status: string;
    reason?: string | null;
    source: BillingRefundSource;
    /** The operator who recorded a manual one. */
    recordedBy?: string | null;
    /** Known by the caller (the double-charge job, an admin's invoice). */
    organizationId?: string | null;
    invoiceId?: string | null;
}

/**
 * A refund or a dispute on a payment Saroh took for a plan (DEC-166), kept
 * as a `BillingRefund` by the provider's id, on the caller's transaction:
 * the automatic double-charge refund (`double-charge-refund.job.ts`), one
 * the owner made by hand and an operator recorded, or the provider's
 * `refund.*` / `payment.dispute.*` webhook. Whichever comes first makes the
 * row; the others fill in what it lacks (the invoice, the business, the
 * amount, the reason) and move its status on, never back.
 *
 * The invoice is found by the payment (`SarohInvoice.providerPaymentId`);
 * a double charge, which has none, by its refund claim.
 * What an operator must do is raised in Needs action, once each:
 *
 * - a refund (or a dispute) on a payment Saroh invoiced: Saroh issues no
 *   credit note, so "a credit note may be needed: ask the CA";
 * - a refund that failed: refund it by hand;
 * - a dispute opened: answer it in the provider's dashboard.
 *
 * Returns the row's id.
 */
export async function recordRefundInTx(
    tx: Tx,
    logger: Pick<Logger, "error" | "warn">,
    input: RefundRecordInput,
): Promise<string> {
    const invoice = await tx.sarohInvoice.findFirst({
        where: {
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
        },
        select: { id: true, organizationId: true, number: true },
    });
    // A double charge has no invoice: its claim names the business.
    const claim =
        input.organizationId || invoice
            ? null
            : await tx.adminAuditEvent.findUnique({
                  where: {
                      idempotencyKey: refundClaimKey(
                          input.provider,
                          input.providerPaymentId,
                      ),
                  },
                  select: { organizationId: true },
              });
    const organizationId =
        input.organizationId ??
        invoice?.organizationId ??
        claim?.organizationId ??
        null;
    const invoiceId = input.invoiceId ?? invoice?.id ?? null;
    const key = {
        provider_providerRefundId: {
            provider: input.provider,
            providerRefundId: input.providerRefundId,
        },
    };

    const had = await tx.billingRefund.findUnique({ where: key });
    if (!had) {
        await tx.billingRefund.createMany({
            data: [
                {
                    organizationId,
                    provider: input.provider,
                    kind: input.kind,
                    providerRefundId: input.providerRefundId,
                    providerPaymentId: input.providerPaymentId,
                    invoiceId,
                    amountPaise: input.amountPaise,
                    status: input.status,
                    reason: input.reason ?? null,
                    source: input.source,
                    recordedBy: input.recordedBy ?? null,
                },
            ],
            skipDuplicates: true,
        });
    } else {
        await tx.billingRefund.update({
            where: key,
            data: {
                ...(had.organizationId ? {} : { organizationId }),
                ...(had.invoiceId ? {} : { invoiceId }),
                ...(had.amountPaise === null && input.amountPaise !== null
                    ? { amountPaise: input.amountPaise }
                    : {}),
                ...(had.reason || !input.reason
                    ? {}
                    : { reason: input.reason }),
                ...(rank(input.status) > rank(had.status) ||
                (rank(input.status) === rank(had.status) &&
                    input.status !== had.status &&
                    rank(input.status) > 0)
                    ? { status: input.status }
                    : {}),
            },
        });
    }
    const row = await tx.billingRefund.findUniqueOrThrow({ where: key });

    const where = providerName(input.provider);
    const amount =
        row.amountPaise !== null ? ` (${rupees(row.amountPaise)})` : "";
    const refs = {
        provider: input.provider,
        payment: input.providerPaymentId,
        [input.kind === "DISPUTE" ? "dispute" : "refund"]:
            input.providerRefundId,
        invoice: invoice?.number ?? null,
    };

    if (row.invoiceId) {
        await raiseBillingActionInTx(tx, {
            organizationId: row.organizationId,
            code: "billing_credit_note_may_be_needed",
            refs,
            note:
                input.kind === "DISPUTE"
                    ? `Payment ${input.providerPaymentId}${amount} on Saroh invoice ${invoice?.number ?? row.invoiceId} is disputed in ${where}. If the money goes back, a credit note may be needed: Saroh doesn't issue one. Ask the CA.`
                    : `Payment ${input.providerPaymentId} on Saroh invoice ${invoice?.number ?? row.invoiceId} was refunded${amount} in ${where} (refund ${input.providerRefundId}). A credit note may be needed: Saroh doesn't issue one. Ask the CA.`,
            dedupeKey: `credit-note:${input.provider}:${input.providerRefundId}`,
        });
    }
    if (row.kind === "REFUND" && row.status === "FAILED") {
        logger.error(
            `billing_refund_failed org=${row.organizationId ?? "none"} payment=${input.providerPaymentId} refund=${input.providerRefundId}`,
        );
        await raiseBillingActionInTx(tx, {
            organizationId: row.organizationId,
            code: "billing_refund_failed",
            refs,
            note: `${where} says refund ${input.providerRefundId} of payment ${input.providerPaymentId}${amount} failed. Refund it by hand in ${where}, then record that refund here.`,
            dedupeKey: `refund-failed:${input.provider}:${input.providerRefundId}`,
        });
    }
    if (row.kind === "DISPUTE" && rank(row.status) < 2) {
        logger.error(
            `billing_dispute_open org=${row.organizationId ?? "none"} payment=${input.providerPaymentId} dispute=${input.providerRefundId}`,
        );
        await raiseBillingActionInTx(tx, {
            organizationId: row.organizationId,
            code: "billing_dispute_open",
            refs,
            note: `Payment ${input.providerPaymentId}${amount} is disputed in ${where} (dispute ${input.providerRefundId}${row.reason ? `, ${row.reason}` : ""}). Answer it in ${where}'s dashboard before its deadline.`,
            dedupeKey: `dispute:${input.provider}:${input.providerRefundId}`,
        });
    }
    if (!row.organizationId) {
        logger.warn(
            `billing_refund_unmatched payment=${input.providerPaymentId} ${input.kind.toLowerCase()}=${input.providerRefundId}`,
        );
    }
    return row.id;
}
