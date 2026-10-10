import { Logger } from "@nestjs/common";
import type { Prisma, prisma } from "@saroh/database";

import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";
import type { NormalizedWebhookEvent } from "../webhooks/providers/webhook-provider.port";
import { AMOUNT_MISMATCH } from "./capture-mismatch";

/**
 * Handing back a capture taken at the wrong amount (PAY-06 follow-up, owner
 * decision 9 Oct). A mismatched capture is recorded as a
 * `CAPTURED_NEEDS_REFUND` attempt with reason {@link AMOUNT_MISMATCH}, and
 * its intent usually FAILED: the order or invoice was never paid by it. So
 * its refund is the attempt's, not the order's — it goes back at exactly
 * what was captured, against that payment, and touches no order, invoice,
 * credit note or stock.
 *
 * The refund is an ordinary `PaymentRefund` on the attempt's intent, keyed
 * to the attempt ({@link mismatchRefundKey}), so the send, the look-first
 * try-again and the provider's reference (DEC-026) are the shared ones.
 * The money readers count refunds of SUCCEEDED intents only, and a
 * mismatch's intent is not one — an open intent fails on a mismatch, and a
 * superseded one stays superseded — so the row never reads as the order's
 * money going back. Only a second capture on an intent that had already
 * succeeded would (one provider order paid twice, which neither Razorpay
 * nor Cashfree takes); its refund would then read as part of that
 * payment going back.
 */

type Tx = Prisma.TransactionClient;
type Db = typeof prisma;

const logger = new Logger("MismatchRefund");

/** Every mismatch refund's key starts with this. */
export const MISMATCH_REFUND_PREFIX = "amount-mismatch:";

/** The reason a mismatch refund carries, as the payments list shows it. */
export const MISMATCH_REFUND_REASON = "Paid at a different amount than asked";

/**
 * The key of a mismatch's refund: one per attempt, and a fresh one for each
 * try after the provider definitely refused (`…:2`, `…:3`): the row id is
 * the provider's reference, and a refused reference can't be sent again.
 */
export function mismatchRefundKey(attemptId: string, nth = 1): string {
    return nth <= 1
        ? `${MISMATCH_REFUND_PREFIX}${attemptId}`
        : `${MISMATCH_REFUND_PREFIX}${attemptId}:${nth}`;
}

/** The attempt a mismatch refund's key names, or null for any other key. */
export function attemptOfRefundKey(
    key: string | null | undefined,
): string | null {
    if (!key?.startsWith(MISMATCH_REFUND_PREFIX)) return null;
    const rest = key.slice(MISMATCH_REFUND_PREFIX.length);
    const id = rest.split(":")[0];
    return id.length > 0 ? id : null;
}

/** The where of a capture recorded as taken at the wrong amount. */
export const MISMATCH_ATTEMPT_WHERE = {
    status: CAPTURED_NEEDS_REFUND,
    rawResponse: { path: ["invoiceStatus"], equals: AMOUNT_MISMATCH },
} satisfies Prisma.PaymentAttemptWhereInput;

/** A refund that holds the money: on its way, or gone back. */
const HOLDING = ["PENDING", "SUCCEEDED"];

/** What a mismatch owes back: exactly what the provider captured. */
export interface MismatchOwed {
    amountCents: number;
    currency: string;
}

/**
 * The captured figures the mismatch recorded, or null when it recorded no
 * whole positive amount (a look-up must report one, so only a signed
 * webhook that named none — never recorded as a mismatch — could lack it).
 */
export function owedOf(
    rawResponse: unknown,
    intentCurrency: string,
): MismatchOwed | null {
    if (typeof rawResponse !== "object" || rawResponse === null) return null;
    const raw = rawResponse as {
        capturedAmountCents?: unknown;
        capturedCurrency?: unknown;
    };
    const amount = raw.capturedAmountCents;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0)
        return null;
    const currency =
        typeof raw.capturedCurrency === "string" &&
        raw.capturedCurrency.trim().length > 0
            ? raw.capturedCurrency.trim().toUpperCase()
            : intentCurrency;
    return { amountCents: amount, currency };
}

/**
 * Which of these mismatch attempts already have a refund on its way or
 * done — off Home's list. A FAILED one leaves the money owed.
 */
export async function refundedAttempts(
    db: Pick<Db, "paymentRefund">,
    organizationId: string,
): Promise<Set<string>> {
    const rows = await db.paymentRefund.findMany({
        where: {
            organizationId,
            status: { in: HOLDING },
            idempotencyKey: { startsWith: MISMATCH_REFUND_PREFIX },
        },
        select: { idempotencyKey: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
        const id = attemptOfRefundKey(r.idempotencyKey);
        if (id) ids.add(id);
    }
    return ids;
}

/** The refund rows already made for one mismatch, newest last. */
export function refundsOfAttemptInTx(
    tx: Pick<Tx, "paymentRefund">,
    organizationId: string,
    paymentIntentId: string,
    attemptId: string,
) {
    return tx.paymentRefund
        .findMany({
            where: {
                organizationId,
                paymentIntentId,
                idempotencyKey: { startsWith: mismatchRefundKey(attemptId) },
            },
            orderBy: { createdAt: "asc" },
            select: { id: true, status: true, idempotencyKey: true },
        })
        .then((rows) =>
            rows.filter(
                (r) => attemptOfRefundKey(r.idempotencyKey) === attemptId,
            ),
        );
}

/**
 * A refund event about a mismatch's payment, settled on its own row
 * (PAY-06): the order or invoice it was taken for was never paid by it, so
 * it is never refused as a refund of an unpaid (FAILED) order, and moves
 * nothing but the refund row.
 *
 * - A row Saroh sent (matched by the provider's refund id, or Saroh's
 *   reference) whose key is a mismatch's: settled, or failed, here.
 * - No row at all, and the refunded payment is a mismatch's (a refund made
 *   in the provider's dashboard): recorded as that mismatch's refund, at
 *   the provider's amount, so Home stops asking for it.
 *
 * `handled: false` leaves the event to the order or invoice's own refund
 * path, unchanged. Runs inside the webhook's transaction.
 */
export async function settleMismatchRefundInTx(
    tx: Tx,
    organizationId: string,
    provider: string,
    event: NormalizedWebhookEvent,
): Promise<{ handled: boolean; applied: boolean }> {
    const no = { handled: false, applied: false };
    if (event.outcome !== "REFUNDED" && event.outcome !== "REFUND_FAILED") {
        return no;
    }
    const row = await matchedRow(tx, organizationId, event);
    if (row) {
        if (!attemptOfRefundKey(row.idempotencyKey)) return no;
        return { handled: true, applied: await settleRow(tx, row.id, event) };
    }
    if (
        event.outcome !== "REFUNDED" ||
        !event.providerRefundId ||
        !event.providerPaymentRef
    ) {
        return no;
    }
    const attempt = await tx.paymentAttempt.findFirst({
        where: {
            organizationId,
            provider,
            providerRef: event.providerPaymentRef,
            ...MISMATCH_ATTEMPT_WHERE,
        },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            rawResponse: true,
            paymentIntent: { select: { id: true, currency: true } },
        },
    });
    if (!attempt) return no;
    // The intent's lock, as Saroh's own refund of it takes it: the two
    // never both pick the next key.
    await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE id = ${attempt.paymentIntent.id} FOR NO KEY UPDATE`;
    const made = await refundsOfAttemptInTx(
        tx,
        organizationId,
        attempt.paymentIntent.id,
        attempt.id,
    );
    const owed = owedOf(attempt.rawResponse, attempt.paymentIntent.currency);
    const amountCents = event.refundAmountCents ?? owed?.amountCents;
    if (amountCents === undefined) {
        logger.warn(
            `Refund ${event.providerRefundId} of mismatched payment ${event.providerPaymentRef} came with no amount, and none was recorded; left to its look-up`,
        );
        return { handled: true, applied: false };
    }
    await tx.paymentRefund.create({
        data: {
            organizationId,
            paymentIntentId: attempt.paymentIntent.id,
            amountCents,
            currency: owed?.currency ?? attempt.paymentIntent.currency,
            status: "SUCCEEDED",
            providerRefundId: event.providerRefundId,
            reason: MISMATCH_REFUND_REASON,
            idempotencyKey: mismatchRefundKey(attempt.id, made.length + 1),
        },
    });
    return { handled: true, applied: true };
}

/** The refund row an event names: by the provider's id, else Saroh's reference. */
async function matchedRow(
    tx: Tx,
    organizationId: string,
    event: NormalizedWebhookEvent,
): Promise<{ id: string; idempotencyKey: string | null } | null> {
    if (event.providerRefundId) {
        const byProvider = await tx.paymentRefund.findFirst({
            where: { organizationId, providerRefundId: event.providerRefundId },
            select: { id: true, idempotencyKey: true },
        });
        if (byProvider) return byProvider;
    }
    if (!event.refundReference) return null;
    const byReference = await tx.paymentRefund.findFirst({
        where: { id: event.refundReference, organizationId },
        select: { id: true, idempotencyKey: true, providerRefundId: true },
    });
    // A row already carrying another provider refund is not this one.
    if (
        !byReference ||
        (byReference.providerRefundId &&
            event.providerRefundId &&
            byReference.providerRefundId !== event.providerRefundId)
    ) {
        return null;
    }
    return byReference;
}

/** Settle (or fail) one mismatch refund row under its lock. */
async function settleRow(
    tx: Tx,
    id: string,
    event: NormalizedWebhookEvent,
): Promise<boolean> {
    await tx.$queryRaw`SELECT id FROM "PaymentRefund" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.paymentRefund.findUniqueOrThrow({
        where: { id },
        select: { status: true, providerRefundId: true, amountCents: true },
    });
    const providerRefundId =
        row.providerRefundId ?? event.providerRefundId ?? null;
    if (event.outcome === "REFUND_FAILED") {
        if (row.status !== "PENDING") {
            logger.warn(
                `Mismatch refund ${id} reported failed while ${row.status}; left as it is`,
            );
            return false;
        }
        await tx.paymentRefund.update({
            where: { id },
            data: { status: "FAILED", providerRefundId },
        });
        return true;
    }
    if (row.status === "SUCCEEDED") return false;
    if (
        event.refundAmountCents !== undefined &&
        event.refundAmountCents !== row.amountCents
    ) {
        logger.warn(
            `Mismatch refund ${id}: the provider refunded ${event.refundAmountCents}, Saroh asked ${row.amountCents}`,
        );
    }
    await tx.paymentRefund.update({
        where: { id },
        data: { status: "SUCCEEDED", providerRefundId },
    });
    return true;
}
