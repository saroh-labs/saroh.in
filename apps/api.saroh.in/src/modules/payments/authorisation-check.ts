import type { Prisma } from "@saroh/database";

import { fromMinor } from "../../common/money";
import type {
    MandateCapability,
    MandateMethod,
} from "./providers/provider.port";
import { enqueueRefundSendInTx } from "./send-refund.handler";

/**
 * The ₹1 autopay check (round-2 D12B, DEC-064). Turning autopay on with
 * nothing owed, by a method whose authorisation must take a payment
 * (Razorpay UPI and card: at least ₹1), takes the provider's minimum and
 * hands it straight back:
 *
 * - **Not a sale.** The check is a PaymentIntent on no order and no invoice,
 *   `purpose` AUTHORISATION, tied to the mandate set-up it authorised
 *   (`checkForMandateId`). Every money reader counts orders, invoices and
 *   credit notes, so it is never revenue, takings, Home money or a
 *   customer's "Spent"; the calendar's fees leave it out by `purpose`.
 * - **Refunded automatically.** Its capture (the webhook, or the page's
 *   read-back when the webhook is lost) marks it SUCCEEDED and reserves one
 *   refund of what was taken, keyed per payment (`CHECK_REFUND_KEY`), with
 *   the send job on the same transaction (G13's outbox). The job looks
 *   before it sends and sends under the refund's own id (DEC-026), so a
 *   duplicate webhook, a retry or an unsure answer never refunds twice.
 *   The refund webhooks settle it. The set-up failing afterwards changes
 *   nothing: the ₹1 goes back all the same.
 * - **Said to the customer** before (the method choice) and after (the
 *   page they land on, My plan), and to the merchant on Subscription
 *   Detail — as `CheckView`.
 */

type Tx = Prisma.TransactionClient;

/** `PaymentIntent.purpose` of an autopay check. Null on a sale. */
export const AUTHORISATION_PURPOSE = "AUTHORISATION";

/** The check's one automatic refund, per payment. */
export const CHECK_REFUND_KEY = "autopay-check";

/** What the refund row says it was for. */
export const CHECK_REFUND_REASON = "Autopay check refunded";

/**
 * The check a set-up by `method` takes when nothing is owed, in minor
 * units: the provider's minimum for it, or 0 (eMandate: no check).
 */
export function checkCentsFor(
    mandates: Pick<MandateCapability, "authorisationMinimumCents">,
    method: MandateMethod,
): number {
    const cents = mandates.authorisationMinimumCents?.[method] ?? 0;
    return Number.isInteger(cents) && cents > 0 ? cents : 0;
}

/**
 * Record a set-up's check before the customer can pay it: an intent under
 * the provider order its payment is made on, so the capture webhook finds
 * it as any payment's. The first attempt keeps the order for audit; it
 * names no payment, so a refund is sent against the captured one only.
 */
export async function recordCheckInTx(
    tx: Pick<Tx, "paymentIntent" | "paymentAttempt">,
    input: {
        organizationId: string;
        mandateId: string;
        provider: string;
        providerIntentId: string;
        amountCents: number;
        currency: string;
    },
): Promise<string> {
    const intent = await tx.paymentIntent.create({
        data: {
            organizationId: input.organizationId,
            provider: input.provider,
            providerIntentId: input.providerIntentId,
            amountCents: input.amountCents,
            currency: input.currency,
            status: "REQUIRES_PAYMENT",
            purpose: AUTHORISATION_PURPOSE,
            checkForMandateId: input.mandateId,
        },
        select: { id: true },
    });
    await tx.paymentAttempt.create({
        data: {
            organizationId: input.organizationId,
            paymentIntentId: intent.id,
            provider: input.provider,
            providerRef: null,
            status: "CREATED",
            rawResponse: {
                providerIntentId: input.providerIntentId,
                purpose: AUTHORISATION_PURPOSE,
            },
        },
    });
    return intent.id;
}

/**
 * The check's money arrived: the intent SUCCEEDED once, its capture
 * recorded with the provider's payment id (what the refund is sent
 * against), and one refund of what is left to hand back reserved with its
 * send job. Idempotent under the intent's row lock: a second capture (the
 * provider's `order.paid` for the same payment, a duplicate delivery, the
 * page's read-back) reserves nothing more. Never more than was taken.
 */
export async function captureCheckInTx(
    tx: Tx,
    intent: { id: string; organizationId: string },
    providerPaymentRef: string | null | undefined,
): Promise<{ applied: boolean }> {
    const locked = await tx.$queryRaw<
        {
            status: string;
            amountCents: number;
            currency: string;
            provider: string;
            purpose: string | null;
        }[]
    >`SELECT status, "amountCents", currency, provider, purpose FROM "PaymentIntent" WHERE id = ${intent.id} FOR NO KEY UPDATE`;
    const row = locked.length > 0 ? locked[0] : undefined;
    if (row?.purpose !== AUTHORISATION_PURPOSE) return { applied: false };

    let applied = false;
    if (row.status !== "SUCCEEDED") {
        await tx.paymentIntent.update({
            where: { id: intent.id },
            data: { status: "SUCCEEDED" },
        });
        await tx.paymentAttempt.create({
            data: {
                organizationId: intent.organizationId,
                paymentIntentId: intent.id,
                provider: row.provider,
                providerRef: providerPaymentRef ?? null,
                status: "CAPTURED",
                rawResponse: { purpose: AUTHORISATION_PURPOSE },
            },
        });
        applied = true;
    }

    const existing = await tx.paymentRefund.findUnique({
        where: {
            paymentIntentId_idempotencyKey: {
                paymentIntentId: intent.id,
                idempotencyKey: CHECK_REFUND_KEY,
            },
        },
        select: { id: true },
    });
    if (existing) return { applied };

    // What is left to hand back: never more than was taken, less anything
    // already refunded (a refund made in the provider's dashboard first).
    const handedBack = await tx.paymentRefund.aggregate({
        where: { paymentIntentId: intent.id, status: { not: "FAILED" } },
        _sum: { amountCents: true },
    });
    const left = row.amountCents - (handedBack._sum.amountCents ?? 0);
    if (left <= 0) return { applied };

    const refund = await tx.paymentRefund.create({
        data: {
            organizationId: intent.organizationId,
            paymentIntentId: intent.id,
            amountCents: left,
            currency: row.currency,
            status: "PENDING",
            reason: CHECK_REFUND_REASON,
            idempotencyKey: CHECK_REFUND_KEY,
        },
        select: { id: true },
    });
    await enqueueRefundSendInTx(tx, intent.organizationId, refund.id);
    return { applied: true };
}

/** The check's payment failed: nothing was taken, nothing to hand back. */
export async function failCheckInTx(
    tx: Tx,
    intent: { id: string },
): Promise<{ applied: boolean }> {
    const { count } = await tx.paymentIntent.updateMany({
        where: {
            id: intent.id,
            purpose: AUTHORISATION_PURPOSE,
            status: { in: ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"] },
        },
        data: { status: "FAILED" },
    });
    return { applied: count > 0 };
}

/**
 * The check, as the customer and the merchant are told it:
 * REFUNDING (the refund is on its way), REFUNDED (the provider says it went
 * back, on `refundedAt`) or NOT_REFUNDED (the provider refused it — the
 * business hands it back by hand). Null: no check was taken.
 */
export interface CheckView {
    /** "1.00" */
    amount: string;
    currency: string;
    state: "REFUNDING" | "REFUNDED" | "NOT_REFUNDED";
    refundedAt: string | null;
}

/** What {@link checkViewOf} reads from a mandate's checks. */
export const CHECK_VIEW_SELECT = {
    status: true,
    amountCents: true,
    currency: true,
    refunds: {
        select: { status: true, amountCents: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
    },
} as const satisfies Prisma.PaymentIntentSelect;

interface CheckRow {
    status: string;
    amountCents: number;
    currency: string;
    refunds: { status: string; amountCents: number; updatedAt: Date }[];
}

export function checkViewOf(
    row: CheckRow | null | undefined,
): CheckView | null {
    if (row?.status !== "SUCCEEDED") return null;
    const base = { amount: fromMinor(row.amountCents), currency: row.currency };
    const settled = row.refunds.filter((r) => r.status === "SUCCEEDED");
    const settledCents = settled.reduce((s, r) => s + r.amountCents, 0);
    if (settled.length > 0 && settledCents >= row.amountCents) {
        const last = settled.reduce((a, b) =>
            a.updatedAt >= b.updatedAt ? a : b,
        );
        return {
            ...base,
            state: "REFUNDED",
            refundedAt: last.updatedAt.toISOString(),
        };
    }
    const failedOnly =
        row.refunds.length > 0 &&
        row.refunds.every((r) => r.status === "FAILED");
    return {
        ...base,
        state: failedOnly ? "NOT_REFUNDED" : "REFUNDING",
        refundedAt: null,
    };
}
