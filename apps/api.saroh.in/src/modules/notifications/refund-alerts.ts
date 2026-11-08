import type { Prisma } from "@saroh/database";

import { moneyWordsMinor, whenWords } from "../../common/words-format";
import { orderPartyName } from "../orders/walk-in";
import { refundNoticeKey } from "../site-accounts/customer-notify-queue";
import { cleanBusinessName } from "../site-accounts/sender-name";
import { noticeOf } from "./notice-target";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * A refund that sent no money back (DEC-174 U12, #1143), on the Payment
 * failed row: "refused" when the provider said no to Saroh's call (a
 * booking's automatic refund, a refused checkout's, or part of one a
 * person asked for), "failed" when it took the refund and it failed later
 * (its webhook). Each opens the record the money belongs to: the order,
 * the booking (whose history says "Refund failed", U6), or the invoice.
 *
 * Worded from what stands when the job runs: a refund the provider says
 * went back after all, or money handed back since by another refund, says
 * nothing. Saroh's email carries the amount and the record's number, never
 * the customer's name (the bell has it).
 */

/** Refused by the provider, on an order: opens the order. */
export const REFUND_REFUSED_NOTIFICATION_TYPE = "refund.refused";
/** Refused, on a booking's payment: opens the booking. */
export const REFUND_REFUSED_BOOKING_NOTIFICATION_TYPE =
    "refund.refused.booking";
/** Refused, on an invoice's payment: opens the invoice. */
export const REFUND_REFUSED_INVOICE_NOTIFICATION_TYPE =
    "refund.refused.invoice";
/** A late Stripe hold payment Saroh refunded on its own: opens the booking. */
export const REFUND_LATE_HOLD_NOTIFICATION_TYPE = "refund.late-hold.booking";
/** Taken, then failed at the provider, on an order: opens the order. */
export const REFUND_FAILED_NOTIFICATION_TYPE = "refund.failed";
/** Failed later, on a booking's payment: opens the booking. */
export const REFUND_FAILED_BOOKING_NOTIFICATION_TYPE = "refund.failed.booking";
/** Failed later, on an invoice's payment: opens the invoice. */
export const REFUND_FAILED_INVOICE_NOTIFICATION_TYPE = "refund.failed.invoice";

type Tx = Prisma.TransactionClient;

export async function wordRefund(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "refund" }>,
): Promise<WordedAlert | null> {
    if (p.change === "late-hold") {
        return wordLateHoldRefund(tx, organizationId, p.refundId);
    }
    const row = await tx.paymentRefund.findFirst({
        where: { id: p.refundId, organizationId },
        select: {
            id: true,
            status: true,
            amountCents: true,
            currency: true,
            paymentIntent: {
                select: {
                    amountCents: true,
                    purpose: true,
                    refunds: {
                        where: { status: { not: "FAILED" } },
                        select: { amountCents: true },
                    },
                    order: {
                        select: {
                            id: true,
                            orderId: true,
                            paymentStatus: true,
                            customerId: true,
                            walkInName: true,
                            customer: {
                                select: {
                                    firstName: true,
                                    lastName: true,
                                    email: true,
                                },
                            },
                        },
                    },
                    invoice: {
                        select: {
                            id: true,
                            number: true,
                            billToName: true,
                            contact: {
                                select: { firstName: true, lastName: true },
                            },
                            booking: {
                                select: {
                                    id: true,
                                    bookerName: true,
                                    service: { select: { name: true } },
                                    contact: {
                                        select: {
                                            firstName: true,
                                            lastName: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    // Went back after all (the provider's word is the ledger's), or gone.
    if (row?.status !== "FAILED") return null;
    const intent = row.paymentIntent;
    if (intent.purpose !== null) return null;
    // Handed back since by another refund of the same payment.
    const left =
        intent.amountCents -
        intent.refunds.reduce((s, r) => s + r.amountCents, 0);
    if (left <= 0) return null;
    if (intent.order?.paymentStatus === "REFUNDED") return null;

    const amount = moneyWordsMinor(row.amountCents, row.currency);
    const refused = p.change === "refused";
    const what = refused
        ? "was refused by your payment provider"
        : "failed at your payment provider after it was sent";
    const told = refused
        ? false
        : await customerTold(tx, organizationId, row.id);
    const after = told
        ? "No money went back, though the customer was told it was on its way."
        : "No money went back to the customer.";
    const base = {
        event: "failed" as const,
        eventKey: `team:refund:${p.change}:${row.id}`,
        notificationId: null,
        skipUserId: p.actorUserId ?? null,
    };
    const verb = refused ? "was refused" : "failed";

    if (intent.order) {
        const order = intent.order;
        const heading = `Refund on order ${order.orderId} ${verb}`;
        return {
            ...base,
            ...noticeOf(
                refused
                    ? REFUND_REFUSED_NOTIFICATION_TYPE
                    : REFUND_FAILED_NOTIFICATION_TYPE,
                { orderId: order.id },
            ),
            title: heading,
            body: `${orderPartyName(order)}'s refund of ${amount} ${what}. ${after} Open the order to refund it again.`,
            mail: {
                heading,
                body: `A refund of ${amount} ${what}. ${after} Open the order to refund it again.`,
            },
            path: `/commerce/orders/${order.id}`,
            cta: "Open the order",
        };
    }
    const invoice = intent.invoice;
    if (!invoice) return null;
    if (invoice.booking) {
        const booking = invoice.booking;
        const service = booking.service.name;
        const who =
            nameOf(booking.contact) ??
            blankToNull(booking.bookerName) ??
            "The customer";
        const heading = `Refund on a booking ${verb}`;
        const serviceMail = cleanBusinessName(service, "");
        return {
            ...base,
            ...noticeOf(
                refused
                    ? REFUND_REFUSED_BOOKING_NOTIFICATION_TYPE
                    : REFUND_FAILED_BOOKING_NOTIFICATION_TYPE,
                { bookingId: booking.id },
            ),
            title: `Refund for ${who}'s ${service} ${verb}`,
            body: `The refund of ${amount} ${what}. ${after}`,
            mail: {
                heading,
                body: `A refund of ${amount}${serviceMail ? ` on a ${serviceMail} booking` : ""} ${what}. ${after} Open the booking to see it.`,
            },
            path: `/bookings/${booking.id}`,
            cta: "Open the booking",
        };
    }
    const number = invoice.number ?? "(draft)";
    const who =
        blankToNull(invoice.billToName) ??
        nameOf(invoice.contact) ??
        "The customer";
    const heading = `Refund on invoice ${number} ${verb}`;
    return {
        ...base,
        ...noticeOf(
            refused
                ? REFUND_REFUSED_INVOICE_NOTIFICATION_TYPE
                : REFUND_FAILED_INVOICE_NOTIFICATION_TYPE,
            { invoiceId: invoice.id },
        ),
        title: heading,
        body: `${who}'s refund of ${amount} ${what}. ${after}`,
        mail: {
            heading,
            body: `A refund of ${amount} ${what}. ${after} Open the invoice to see it.`,
        },
        path: `/billing/invoices/${invoice.id}`,
        cta: "Open the invoice",
    };
}

/**
 * A Stripe payment for a booking hold came after the hold ended and its
 * place was let go; Saroh refunded it (plan 2026-11-07-002, U5). Said
 * while the refund is on its way or done: one the provider refused gets
 * its own "refused" alert instead.
 */
async function wordLateHoldRefund(
    tx: Tx,
    organizationId: string,
    refundId: string,
): Promise<WordedAlert | null> {
    const row = await tx.paymentRefund.findFirst({
        where: { id: refundId, organizationId },
        select: {
            id: true,
            status: true,
            amountCents: true,
            currency: true,
            paymentIntent: {
                select: {
                    invoice: {
                        select: {
                            booking: {
                                select: {
                                    id: true,
                                    startAt: true,
                                    timezone: true,
                                    bookerName: true,
                                    service: { select: { name: true } },
                                    contact: {
                                        select: {
                                            firstName: true,
                                            lastName: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (row?.status !== "PENDING" && row?.status !== "SUCCEEDED") return null;
    const booking = row.paymentIntent.invoice?.booking;
    if (!booking) return null;
    const amount = moneyWordsMinor(row.amountCents, row.currency);
    const what = `${booking.service.name}, ${whenWords(booking.startAt, booking.timezone, { weekday: true })}`;
    const who =
        nameOf(booking.contact) ??
        blankToNull(booking.bookerName) ??
        "A customer";
    const heading = "A late payment was refunded";
    return {
        event: "failed",
        eventKey: `team:refund:late-hold:${row.id}`,
        notificationId: null,
        skipUserId: null,
        ...noticeOf(REFUND_LATE_HOLD_NOTIFICATION_TYPE, {
            bookingId: booking.id,
        }),
        title: heading,
        body: `${who}'s payment of ${amount} for ${what} came after its hold ended. Saroh refunded it.`,
        mail: {
            heading,
            body: `A payment of ${amount} for ${cleanBusinessName(booking.service.name, "a booking")} came after its hold ended, and the time was no longer held. Saroh refunded it. Open the booking to see it.`,
        },
        path: `/bookings/${booking.id}`,
        cta: "Open the booking",
    };
}

/** Whether the customer was told this refund was on its way (U12). */
async function customerTold(
    tx: Pick<Tx, "customerNotice">,
    organizationId: string,
    refundId: string,
): Promise<boolean> {
    const notice = await tx.customerNotice.findUnique({
        where: {
            organizationId_eventKey: {
                organizationId,
                eventKey: refundNoticeKey(refundId),
            },
        },
        select: { threadMessageId: true, messageId: true },
    });
    return Boolean(notice?.threadMessageId ?? notice?.messageId);
}

/** A name as typed, or null when there is none. */
function blankToNull(name: string | null | undefined): string | null {
    const trimmed = name?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

function nameOf(
    c: { firstName: string | null; lastName: string | null } | null,
): string | null {
    const name = [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim();
    return name === "" ? null : name;
}
