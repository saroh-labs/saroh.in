import type { Prisma } from "@saroh/database";

import { moneyWordsMinor } from "../../common/words-format";
import { holdsOnPayment } from "../orders/online-checkout";
import { orderPartyName } from "../orders/walk-in";
import {
    MISMATCH_ATTEMPT_WHERE,
    owedOf,
    refundsOfAttemptInTx,
} from "../payments/mismatch-refund";
import { noticeOf } from "./notice-target";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * The team's money alerts (DEC-174, #1139): an order's payment that didn't
 * go through, money captured at an amount Saroh didn't ask for, and an
 * order the team made that the customer paid online. Each is worded from
 * what stands when the job runs, never from the webhook that queued it:
 * a payment that went through after all, an order cancelled since, or a
 * mismatch already refunded says nothing.
 *
 * The first two are on the Payment failed row; paid by link is good news,
 * on the New order row. Saroh's email carries fixed words and the amounts,
 * never the customer's name (the bell has it), as `failed` does.
 */

/** An order's online payment didn't go through: opens the order. */
export const ORDER_PAYMENT_FAILED_NOTIFICATION_TYPE = "order.payment_failed";
/** Money captured at the wrong amount on an order: opens the order. */
export const PAYMENT_MISMATCH_NOTIFICATION_TYPE = "payment.mismatch";
/**
 * The same on an invoice's payment (a booking paid at booking, a renewal,
 * a pay link): opens the invoice. Its own type, since a notice type opens
 * one kind of record.
 */
export const INVOICE_PAYMENT_MISMATCH_NOTIFICATION_TYPE =
    "payment.mismatch.invoice";
/** A team-made order paid online by the customer: opens the order. */
export const ORDER_PAID_BY_LINK_NOTIFICATION_TYPE = "order.paid_by_link";

type Tx = Prisma.TransactionClient;

const ORDER_SELECT = {
    id: true,
    orderId: true,
    status: true,
    paymentStatus: true,
    placedOnline: true,
    payOnHandover: true,
    customerId: true,
    walkInName: true,
    customer: { select: { firstName: true, lastName: true, email: true } },
} as const;

/**
 * Whether a capture on this intent was recorded as taken at the wrong
 * amount (PAY-06). Such a payment also fails its intent; the mismatch
 * alert tells it, with both figures, so "didn't go through" says nothing.
 */
export async function hasMismatch(
    tx: Pick<Tx, "paymentAttempt">,
    paymentIntentId: string,
): Promise<boolean> {
    const found = await tx.paymentAttempt.findFirst({
        where: { paymentIntentId, ...MISMATCH_ATTEMPT_WHERE },
        select: { id: true },
    });
    return found !== null;
}

/**
 * An order's payment that didn't go through. Only an order the business
 * has: a site checkout never paid is an abandoned checkout, not an order
 * (G13, B1), so its failed attempts say nothing.
 */
export async function wordOrderPaymentFailed(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "order-failed" }>,
): Promise<WordedAlert | null> {
    const [intent, order] = await Promise.all([
        tx.paymentIntent.findFirst({
            where: { id: p.paymentIntentId, organizationId },
            select: { status: true, amountCents: true, currency: true },
        }),
        tx.order.findFirst({
            where: { id: p.orderId, organizationId },
            select: ORDER_SELECT,
        }),
    ]);
    if (intent?.status !== "FAILED" || !order) return null;
    if (holdsOnPayment(order)) return null;
    // Paid since (another payment, or at the counter), or cancelled.
    if (order.paymentStatus === "PAID" || order.status === "CANCELLED") {
        return null;
    }
    if (await hasMismatch(tx, p.paymentIntentId)) return null;
    const amount = moneyWordsMinor(intent.amountCents, intent.currency);
    const heading = `Payment for order ${order.orderId} didn't go through`;
    return {
        event: "failed",
        eventKey: `team:order-failed:${p.paymentIntentId}`,
        notificationId: null,
        ...noticeOf(ORDER_PAYMENT_FAILED_NOTIFICATION_TYPE, {
            orderId: order.id,
        }),
        title: heading,
        // A pay link is shown once (DEC-110): the customer needs a new one.
        body: `${orderPartyName(order)}'s payment of ${amount} didn't go through. They'll need a new link: open the order to share one.`,
        mail: {
            heading,
            body: `A payment of ${amount} didn't go through. The customer will need a new link: open the order to share one.`,
        },
        path: `/commerce/orders/${order.id}`,
        skipUserId: null,
        cta: "Open the order",
    };
}

/**
 * Money captured at an amount or currency Saroh didn't ask for (PAY-06),
 * with both figures. Said once per captured payment, and not once a
 * refund of it is on its way or done.
 */
export async function wordPaymentMismatch(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "mismatch" }>,
): Promise<WordedAlert | null> {
    const attempt = await tx.paymentAttempt.findFirst({
        where: {
            id: p.attemptId,
            organizationId,
            paymentIntentId: p.paymentIntentId,
            ...MISMATCH_ATTEMPT_WHERE,
        },
        select: {
            rawResponse: true,
            paymentIntent: {
                select: {
                    amountCents: true,
                    currency: true,
                    invoice: {
                        select: {
                            id: true,
                            number: true,
                            billToName: true,
                            contact: {
                                select: { firstName: true, lastName: true },
                            },
                        },
                    },
                    order: { select: ORDER_SELECT },
                },
            },
        },
    });
    if (!attempt) return null;
    const refunds = await refundsOfAttemptInTx(
        tx,
        organizationId,
        p.paymentIntentId,
        p.attemptId,
    );
    if (
        refunds.some((r) => r.status === "PENDING" || r.status === "SUCCEEDED")
    ) {
        return null;
    }
    const intent = attempt.paymentIntent;
    const asked = askedOf(attempt.rawResponse) ?? {
        amountCents: intent.amountCents,
        currency: intent.currency,
    };
    const owed = owedOf(attempt.rawResponse, intent.currency);
    const askedWords = moneyWordsMinor(asked.amountCents, asked.currency);
    const tookWords = owed
        ? moneyWordsMinor(owed.amountCents, owed.currency)
        : "a different amount";
    const figures = `${tookWords} was taken against ${askedWords} due`;
    const after =
        "It isn't counted as paid, and it's owed back to the customer: refund it from Home.";

    if (intent.order) {
        const order = intent.order;
        const heading = `Payment for order ${order.orderId} didn't match`;
        return {
            event: "failed",
            eventKey: `team:mismatch:${p.paymentIntentId}:${p.attemptId}`,
            notificationId: null,
            ...noticeOf(PAYMENT_MISMATCH_NOTIFICATION_TYPE, {
                orderId: order.id,
            }),
            title: heading,
            body: `${orderPartyName(order)} paid, but ${figures}. ${after}`,
            mail: { heading, body: `${capitalise(figures)}. ${after}` },
            path: `/commerce/orders/${order.id}`,
            skipUserId: null,
        };
    }
    if (intent.invoice) {
        const invoice = intent.invoice;
        const number = invoice.number ?? "(draft)";
        const heading = `Payment on invoice ${number} didn't match`;
        const contact = [invoice.contact?.firstName, invoice.contact?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const who = invoice.billToName?.trim() || contact || "The customer";
        return {
            event: "failed",
            eventKey: `team:mismatch:${p.paymentIntentId}:${p.attemptId}`,
            notificationId: null,
            ...noticeOf(INVOICE_PAYMENT_MISMATCH_NOTIFICATION_TYPE, {
                invoiceId: invoice.id,
            }),
            title: heading,
            body: `${who} paid, but ${figures}. ${after}`,
            mail: { heading, body: `${capitalise(figures)}. ${after}` },
            path: `/billing/invoices/${invoice.id}`,
            skipUserId: null,
        };
    }
    // The ₹1 autopay check (D12B) is refunded on its own: no sale to tell.
    return null;
}

/**
 * An order the team made, paid online by the customer (its pay link):
 * good news, on the New order row. Not for a site order, which has its own
 * New order alert, and only while it stands paid.
 */
export async function wordOrderPaidByLink(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "paid-by-link" }>,
): Promise<WordedAlert | null> {
    const [intent, order] = await Promise.all([
        tx.paymentIntent.findFirst({
            where: { id: p.paymentIntentId, organizationId },
            select: { status: true, amountCents: true, currency: true },
        }),
        tx.order.findFirst({
            where: { id: p.orderId, organizationId },
            select: ORDER_SELECT,
        }),
    ]);
    if (intent?.status !== "SUCCEEDED" || !order) return null;
    if (order.placedOnline) return null;
    if (order.paymentStatus !== "PAID" || order.status === "CANCELLED") {
        return null;
    }
    const amount = moneyWordsMinor(intent.amountCents, intent.currency);
    const heading = `Order ${order.orderId} was paid online`;
    return {
        event: "order",
        eventKey: `team:paid-by-link:${p.paymentIntentId}`,
        notificationId: null,
        ...noticeOf(ORDER_PAID_BY_LINK_NOTIFICATION_TYPE, {
            orderId: order.id,
        }),
        title: heading,
        body: `${orderPartyName(order)} paid ${amount} online.`,
        mail: { heading, body: `The customer paid ${amount} online.` },
        path: `/commerce/orders/${order.id}`,
        skipUserId: null,
        cta: "Open the order",
    };
}

/** What the mismatch record says was asked, when it says. */
function askedOf(
    raw: unknown,
): { amountCents: number; currency: string } | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as { askedAmountCents?: unknown; askedCurrency?: unknown };
    if (
        typeof r.askedAmountCents !== "number" ||
        !Number.isInteger(r.askedAmountCents) ||
        typeof r.askedCurrency !== "string" ||
        r.askedCurrency.trim() === ""
    ) {
        return null;
    }
    return { amountCents: r.askedAmountCents, currency: r.askedCurrency };
}

function capitalise(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
