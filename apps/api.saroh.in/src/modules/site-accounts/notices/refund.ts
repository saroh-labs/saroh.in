import type { Prisma } from "@saroh/database";

import { moneyWordsMinor } from "../../../common/words-format";
import { businessName, defineNotice, firstWord } from "./notice";
import { orderContactId } from "./order";

/**
 * "₹X is on its way back to how you paid" (DEC-174 U12, #1143): an online
 * refund the payment provider took, told to the customer once
 * (`refund:<PaymentRefund id>`), behind the REFUND switch.
 *
 * Queued where Saroh learns the provider took it (`payments/refund-notices.ts`):
 * the refund call's answer, a look-up of a lost answer, or the refund
 * webhook settling a refund Saroh made. A refund recorded by hand (cash at
 * the counter) is no `PaymentRefund` and tells nobody.
 *
 * Read again when the job runs: a refund that failed since says nothing
 * (the team hears of it, and chooses what to tell the customer); one made
 * in the provider's own dashboard, or the ₹1 autopay check's, is not sent
 * from here.
 */

export interface RefundSentVars {
    business: string;
    firstName: string | null;
    /** Integer paise (minor units), as the refund row holds it. */
    amountCents: number;
    currency: string;
    /**
     * What the money was for, in the customer's words ("your order
     * ORD-1019", "your Haircut booking", "invoice INV-0012"), or null.
     */
    about: string | null;
    /** How they paid, when Saroh knows it (an autopay charge's method). */
    method: string | null;
}

export interface RefundSentNotice {
    kind: "REFUND_SENT";
    refund: RefundSentVars;
}

type Tx = Prisma.TransactionClient;

/** A mandate's method as the customer knows it. */
const METHOD_WORDS: Record<string, string> = {
    UPI: "UPI",
    CARD: "card",
    EMANDATE: "bank account",
};

/** Whether the provider has taken this refund: settled, or on its way. */
export function refundTaken(row: {
    status: string;
    providerRefundId: string | null;
}): boolean {
    return (
        row.status === "SUCCEEDED" ||
        (row.status === "PENDING" && row.providerRefundId !== null)
    );
}

export const refundSentNotice = defineNotice<RefundSentNotice>({
    setting: "REFUND",
    load: async (tx, organizationId, payload) => {
        if (payload.kind !== "REFUND_SENT" || !payload.refundId) return null;
        const row = await loadRefund(tx, organizationId, payload.refundId);
        if (!row || !refundTaken(row)) return null;
        const intent = row.paymentIntent;
        // The ₹1 autopay check (D12B) goes back on its own: no sale to tell.
        if (intent.purpose !== null) return null;

        let contactId: string | null = null;
        let about: string | null = null;
        let firstName: string | null = null;
        let orderId: string | undefined;
        let bookingId: string | undefined;
        if (intent.order) {
            const order = intent.order;
            contactId = await orderContactId(tx, organizationId, order);
            about = `your order ${order.orderId}`;
            firstName = firstWord(order.customer?.firstName);
            orderId = order.id;
        } else if (intent.invoice) {
            const invoice = intent.invoice;
            const booking = invoice.booking;
            contactId = invoice.contactId ?? booking?.contactId ?? null;
            firstName =
                firstWord(invoice.contact?.firstName) ??
                firstWord(booking?.contact?.firstName);
            if (booking) {
                about = `your ${booking.service.name} booking`;
                bookingId = booking.id;
            } else if (invoice.number) {
                about = `invoice ${invoice.number}`;
            }
        }
        if (!contactId) return null;
        const method = intent.viaMandate?.method ?? null;
        return {
            contactId,
            ...(orderId ? { orderId } : {}),
            ...(bookingId ? { bookingId } : {}),
            vars: {
                kind: "REFUND_SENT",
                refund: {
                    business: await businessName(tx, organizationId),
                    firstName,
                    amountCents: row.amountCents,
                    currency: row.currency,
                    about,
                    method: method ? (METHOD_WORDS[method] ?? null) : null,
                },
            },
        };
    },
    sentence: ({ refund: r }) => {
        const amount = moneyWordsMinor(r.amountCents, r.currency);
        const about = r.about ? ` for ${r.about}` : "";
        const how = r.method ? ` (${r.method})` : "";
        return `${amount}${about} is on its way back to how you paid${how}. It usually takes 5–7 working days.`;
    },
    subject: ({ refund }) => `Your refund from ${refund.business}`,
    names: ({ refund }) => ({
        business: refund.business,
        firstName: refund.firstName,
    }),
});

function loadRefund(tx: Tx, organizationId: string, refundId: string) {
    return tx.paymentRefund.findFirst({
        where: { id: refundId, organizationId },
        select: {
            status: true,
            providerRefundId: true,
            amountCents: true,
            currency: true,
            paymentIntent: {
                select: {
                    purpose: true,
                    viaMandate: { select: { method: true } },
                    order: {
                        select: {
                            id: true,
                            orderId: true,
                            customerId: true,
                            customerAccountId: true,
                            customer: { select: { firstName: true } },
                        },
                    },
                    invoice: {
                        select: {
                            number: true,
                            contactId: true,
                            contact: { select: { firstName: true } },
                            booking: {
                                select: {
                                    id: true,
                                    contactId: true,
                                    contact: { select: { firstName: true } },
                                    service: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            },
        },
    });
}
