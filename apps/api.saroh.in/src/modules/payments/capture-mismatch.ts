import type { Prisma } from "@saroh/database";

import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";

/**
 * A captured payment whose amount or currency is not what Saroh asked for
 * (PAY-06, #106). The provider order is made at the intent's amount and the
 * provider enforces it, so this is defence in depth: a capture that differs
 * never marks an order or invoice paid. It is recorded as money owed back —
 * a `CAPTURED_NEEDS_REFUND` attempt whose `rawResponse.invoiceStatus` (the
 * reason field Home reads) is {@link AMOUNT_MISMATCH} — and the intent is
 * failed as a declined payment is.
 */
export const AMOUNT_MISMATCH = "AMOUNT_MISMATCH";

type Tx = Prisma.TransactionClient;

/** What Saroh asked for: the intent's amount, in minor units (paise). */
export interface ExpectedAmount {
    amountCents: number;
    currency: string;
}

/**
 * What the provider says it captured, in minor units (paise). Null or
 * absent: the provider didn't report it.
 */
export interface CapturedAmount {
    amountCents?: number | null;
    currency?: string | null;
}

/**
 * Whether a capture differs from what was asked. Exact match only: a
 * partial capture (less) and an over-capture (more) both differ.
 *
 * `strict` decides a capture that doesn't report its amount: a look-up
 * reads the payment from the provider and must find one (strict); a
 * signed webhook that carries no amount is settled on the provider's own
 * order amount, as before (not strict). A currency that isn't reported is
 * compared only when strict.
 */
export function captureDiffers(
    expected: ExpectedAmount,
    captured: CapturedAmount,
    opts: { strict: boolean },
): boolean {
    const amount = captured.amountCents;
    const currency = captured.currency?.trim();
    if (amount == null) return opts.strict;
    if (amount !== expected.amountCents) return true;
    if (!currency) return opts.strict;
    return currency.toUpperCase() !== expected.currency.trim().toUpperCase();
}

/** A capture's figures beside the intent's, for a log line. */
export function describeMismatch(
    expected: ExpectedAmount,
    captured: CapturedAmount,
): string {
    return `captured ${String(captured.amountCents ?? "?")} ${String(
        captured.currency ?? "?",
    )}, asked ${expected.amountCents} ${expected.currency} (minor units)`;
}

/**
 * Record a mismatched capture on its intent as owed back, once per
 * provider payment: Razorpay sends `payment.captured` and `order.paid` for
 * one payment, a look-up may find it too, and a replay repeats them.
 * Returns whether this call wrote it. The caller holds the intent's row
 * lock.
 */
export async function recordCaptureMismatchInTx(
    tx: Tx,
    intent: {
        id: string;
        organizationId: string;
        provider: string;
        amountCents: number;
        currency: string;
    },
    providerPaymentRef: string | null,
    captured: CapturedAmount,
): Promise<boolean> {
    const recorded = await tx.paymentAttempt.findFirst({
        where: {
            paymentIntentId: intent.id,
            status: CAPTURED_NEEDS_REFUND,
            providerRef: providerPaymentRef,
        },
        select: { id: true },
    });
    if (recorded) return false;
    await tx.paymentAttempt.create({
        data: {
            organizationId: intent.organizationId,
            paymentIntentId: intent.id,
            provider: intent.provider,
            providerRef: providerPaymentRef,
            status: CAPTURED_NEEDS_REFUND,
            rawResponse: {
                invoiceStatus: AMOUNT_MISMATCH,
                reason: AMOUNT_MISMATCH,
                askedAmountCents: intent.amountCents,
                askedCurrency: intent.currency,
                capturedAmountCents: captured.amountCents ?? null,
                capturedCurrency: captured.currency ?? null,
            },
        },
    });
    return true;
}
