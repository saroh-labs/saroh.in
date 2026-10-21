import type { Prisma } from "@saroh/database";

/*
 * Money paid online for a booking going back when it is cancelled in time
 * (round 2, E8; DEC-051, DEC-026). Plain functions on the cancel's own
 * transaction, like `booking-hold.ts`: the cancel and one PENDING refund are
 * written together under the booking's locks, and the provider is called
 * after commit (`PaymentsService.sendAutomaticRefund`), with the refund
 * row's id as Saroh's reference.
 *
 * Only the booking's own invoice (source BOOKING) is refunded here: the
 * deposit or full price taken at booking, or a pay link it was sent. A
 * visit of a treatment has no invoice of its own — its money is on the
 * order and goes back only through the order's refund (DEC-050, B9). Visit
 * 1 of a treatment booked online paid the order's invoice (it names the
 * order, E9), so {@link bookingPaymentInTx} never finds that payment.
 */

type Tx = Prisma.TransactionClient;

/**
 * The refund's idempotency key: one per booking. With
 * `@@unique([paymentIntentId, idempotencyKey])` a second cancel, however it
 * races, can't reserve a second refund of the same payment.
 */
export function bookingRefundKey(bookingId: string): string {
    return `deposit-refund:${bookingId}`;
}

/**
 * Lock the payments on a booking's invoice — the first of the documented
 * order (intent → invoice → booking; `lockBookingInTx` takes the other
 * two). The payment webhook takes the intent's lock before the invoice's,
 * so a cancel that may refund takes them in the same order.
 */
export async function lockBookingIntentsInTx(
    tx: Tx,
    bookingId: string,
): Promise<void> {
    await tx.$queryRaw`
        SELECT pi.id FROM "PaymentIntent" pi
        JOIN "Invoice" i ON i.id = pi."invoiceId"
        WHERE i."bookingId" = ${bookingId} AND i.source = 'BOOKING'
        ORDER BY pi.id
        FOR NO KEY UPDATE OF pi`;
}

/** What was paid online for a booking and not yet handed back. */
export interface BookingPayment {
    paymentIntentId: string;
    /** Taken, less every refund not failed. */
    leftCents: number;
    currency: string;
}

/**
 * The booking's payment through the provider that still has money left:
 * a SUCCEEDED intent on its PAID invoice. Null when nothing was paid online
 * (the desk, a pack, a membership), or it has all gone back already.
 */
export async function bookingPaymentInTx(
    tx: Pick<Tx, "paymentIntent">,
    organizationId: string,
    bookingId: string,
): Promise<BookingPayment | null> {
    const payments = await tx.paymentIntent.findMany({
        where: {
            organizationId,
            status: "SUCCEEDED",
            providerIntentId: { not: null },
            invoice: {
                bookingId,
                source: "BOOKING",
                kind: "INVOICE",
                status: "PAID",
                // A treatment's visit 1 paid its order's invoice (E9): that
                // money is the order's, refunded only through the order.
                orderId: null,
            },
        },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            amountCents: true,
            currency: true,
            refunds: {
                where: { status: { not: "FAILED" } },
                select: { amountCents: true },
            },
        },
    });
    for (const p of payments) {
        const left =
            p.amountCents - p.refunds.reduce((s, r) => s + r.amountCents, 0);
        if (left > 0) {
            return {
                paymentIntentId: p.id,
                leftCents: left,
                currency: p.currency,
            };
        }
    }
    return null;
}

/** A refund reserved by a cancel, to send once the cancel commits. */
export interface ReservedBookingRefund {
    refundId: string;
    amountCents: number;
    currency: string;
    /** False when the row was already there: nothing new to send. */
    reservedNow: boolean;
}

/**
 * Reserve the one refund a booking's cancel makes: a PENDING
 * `PaymentRefund` for what is left of its online payment, keyed per
 * booking. Call it under the booking's locks, after re-reading the
 * booking. A row already reserved for this booking is handed back as it
 * is, never doubled.
 */
export async function reserveBookingRefundInTx(
    tx: Tx,
    input: { organizationId: string; bookingId: string; reason: string },
): Promise<ReservedBookingRefund | null> {
    const key = bookingRefundKey(input.bookingId);
    const made = await tx.paymentRefund.findFirst({
        where: {
            organizationId: input.organizationId,
            idempotencyKey: key,
        },
        select: { id: true, amountCents: true, currency: true },
    });
    if (made) {
        return {
            refundId: made.id,
            amountCents: made.amountCents,
            currency: made.currency,
            reservedNow: false,
        };
    }
    const payment = await bookingPaymentInTx(
        tx,
        input.organizationId,
        input.bookingId,
    );
    if (!payment) return null;
    const row = await tx.paymentRefund.create({
        data: {
            organizationId: input.organizationId,
            paymentIntentId: payment.paymentIntentId,
            amountCents: payment.leftCents,
            currency: payment.currency,
            status: "PENDING",
            reason: input.reason,
            idempotencyKey: key,
        },
        select: { id: true },
    });
    return {
        refundId: row.id,
        amountCents: payment.leftCents,
        currency: payment.currency,
        reservedNow: true,
    };
}

/**
 * Where a booking's refund stood when its history line was written
 * (#1137): the cancel's answer from the provider (SENT, CONFIRMING,
 * REFUSED), or the refund webhook's final word (SETTLED, FAILED).
 */
export type BookingRefundOutcome =
    "SENT" | "CONFIRMING" | "REFUSED" | "SETTLED" | "FAILED";

/** What a REFUNDED or REFUND_FAILED line carries in `BookingEvent.data`. */
export interface BookingRefundData {
    amountCents: number;
    currency: string;
    refundId: string;
    outcome: BookingRefundOutcome;
}

/**
 * Put a booking's refund in its history (#1137): "Refunded ₹500 to how
 * they paid" while the refund stands (sent, or awaiting the provider's
 * answer with the money held), "Refund failed" once the provider refused
 * it. The refund row's own status decides which, so a line written late
 * never contradicts one the webhook wrote first; and a line already the
 * newest for this refund is not written twice. A FAILED refund the
 * provider later says went back gets a REFUNDED line after it.
 *
 * Only a booking's own invoice (source BOOKING, no order): a treatment's
 * money is its order's, and the order's history tells it. Returns whether
 * a line was written. Call it under the refund row's lock.
 */
export async function recordBookingRefundInTx(
    tx: Tx,
    refundId: string,
    outcome: BookingRefundOutcome,
): Promise<boolean> {
    const refund = await tx.paymentRefund.findUnique({
        where: { id: refundId },
        select: {
            id: true,
            organizationId: true,
            amountCents: true,
            currency: true,
            status: true,
            paymentIntent: {
                select: {
                    invoice: {
                        select: {
                            bookingId: true,
                            source: true,
                            orderId: true,
                        },
                    },
                },
            },
        },
    });
    const invoice = refund?.paymentIntent.invoice;
    if (!refund || invoice?.source !== "BOOKING" || invoice.orderId) {
        return false;
    }
    const bookingId = invoice.bookingId;
    if (!bookingId) return false;
    const type = refund.status === "FAILED" ? "REFUND_FAILED" : "REFUNDED";
    const last = await tx.bookingEvent.findFirst({
        where: {
            bookingId,
            organizationId: refund.organizationId,
            type: { in: ["REFUNDED", "REFUND_FAILED"] },
            data: { path: ["refundId"], equals: refund.id },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { type: true },
    });
    if (last?.type === type) return false;
    const data: BookingRefundData = {
        amountCents: refund.amountCents,
        currency: refund.currency,
        refundId: refund.id,
        outcome,
    };
    await tx.bookingEvent.create({
        data: {
            bookingId,
            organizationId: refund.organizationId,
            type,
            // Nobody's hand: the refund follows the cancel, or the
            // provider's answer.
            actorUserId: null,
            data: { ...data },
        },
        select: { id: true },
    });
    return true;
}
