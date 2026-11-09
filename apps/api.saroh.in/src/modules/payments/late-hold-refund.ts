import type { Prisma } from "@saroh/database";

import { holdState } from "../bookings/booking-hold";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { lateHoldRefundKey } from "./mismatch-refund";
import { enqueueRefundSendInTx } from "./send-refund.handler";

type Tx = Prisma.TransactionClient;

/** The reason a late hold payment's refund carries. */
export const LATE_HOLD_REFUND_REASON = "Paid after its booking's hold ran out";

/**
 * Whether money captured for a booking hold's invoice came after the hold
 * was let go, at Stripe: `confirmHoldInTx` found its place gone
 * (`released`), or the hold had already been released and its draft
 * voided (the sweep, or the customer's cancel, beat the payment).
 */
export async function isLateStripeHoldInTx(
    tx: Pick<Tx, "booking">,
    provider: string,
    invoice: {
        status: string;
        source: string;
        bookingId: string | null;
    } | null,
    held: string | null,
): Promise<boolean> {
    if (provider !== "STRIPE") return false;
    if (held === "released") return true;
    if (
        invoice?.status !== "VOID" ||
        invoice.source !== "BOOKING" ||
        !invoice.bookingId
    ) {
        return false;
    }
    const booking = await tx.booking.findUnique({
        where: { id: invoice.bookingId },
        select: { status: true, holdExpiresAt: true },
    });
    return booking !== null && holdState(booking, new Date()) === "RELEASED";
}

/**
 * A Stripe payment for a booking hold that was released, its place gone
 * (plan 2026-11-07-002, U5, KTD-10): refunded in full on its own, never
 * left on Home for someone to notice. Reserved on the webhook's
 * transaction (the outbox, DEC-008) beside the `CAPTURED_NEEDS_REFUND`
 * attempt the caller records, keyed `late-hold:<intentId>` so a
 * redelivery reserves nothing new, then sent by the refund job and told
 * to the team. The customer hears through the existing REFUND_SENT notice
 * once Stripe takes it. Touches no invoice or credit note: the hold's
 * draft was voided. A Stripe hold's session lives 30 minutes, as long as
 * the hold, so a payment can still land after the release closed it.
 *
 * Stripe only (owner, 7 Nov): Razorpay and Cashfree late payments stay
 * owed back by hand on Home. Returns whether a refund was reserved.
 */
export async function refundLateHoldInTx(
    tx: Tx,
    intent: {
        id: string;
        organizationId: string;
        provider: string;
        amountCents: number;
        currency: string;
    },
): Promise<boolean> {
    if (intent.provider !== "STRIPE") return false;
    const idempotencyKey = lateHoldRefundKey(intent.id);
    const existing = await tx.paymentRefund.findFirst({
        where: {
            organizationId: intent.organizationId,
            paymentIntentId: intent.id,
            idempotencyKey,
        },
        select: { id: true },
    });
    if (existing) return false;
    // The amount Saroh asked for is what was captured: a capture at any
    // other amount never reaches here (PAY-06 records it as a mismatch).
    const refund = await tx.paymentRefund.create({
        data: {
            organizationId: intent.organizationId,
            paymentIntentId: intent.id,
            amountCents: intent.amountCents,
            currency: intent.currency,
            status: "PENDING",
            reason: LATE_HOLD_REFUND_REASON,
            idempotencyKey,
        },
        select: { id: true },
    });
    await enqueueRefundSendInTx(tx, intent.organizationId, refund.id);
    await enqueueTeamAlert(tx, intent.organizationId, {
        event: "refund",
        refundId: refund.id,
        change: "late-hold",
    });
    return true;
}
