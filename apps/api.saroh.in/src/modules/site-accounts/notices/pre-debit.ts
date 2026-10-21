import type { Prisma } from "@saroh/database";

import { dayWords, moneyWordsMinor } from "../../../common/words-format";
import { businessTimezone } from "../../bookings/staff-availability";
import { contactNoticeAddress } from "../../communications/contact-address";
import { emailRoute } from "../../communications/email-route";
import { resolveContact } from "../../customer-workspace/resolve-contact";
import {
    CUSTOMER_NOTIFY_TYPE,
    enqueueCustomerNotice,
} from "../customer-notify-queue";
import { defineNotice, firstWord } from "./notice";

/**
 * Saroh's pre-debit notice for eMandate autopay (DEC-180, #1175): about a
 * day before each eMandate debit the customer is emailed "₹1,200.00 will
 * be taken from your bank account on Tue 6 Oct for Monthly yoga", through
 * the business's own provider, with who to ask. For a card the bank sends
 * it and for UPI Razorpay does (DEC-174 D6); for an eMandate nobody does,
 * so Saroh must, and **no notice, no debit**: the charge job reads
 * {@link preDebitNoticeState} before it asks for the debit, and a notice
 * that didn't go means that period isn't taken by autopay.
 *
 * - **Keyed to the charge** (`pre-debit:<paymentIntentId>`): one email per
 *   charge, however often its step runs. A Retry is a new charge with its
 *   own notice.
 * - **No switch.** Turning it off couldn't skip the notice, only the
 *   debit; the customer's own "no email" (consent) is honoured, and then
 *   autopay doesn't take that period.
 * - **Read again when it runs.** A charge no longer waiting (paid another
 *   way, cancelled, given up) or a mandate no longer an active eMandate
 *   tells nobody.
 * - The amount is the charge's own, in integer paise; the date is the
 *   planned debit's, in the business's time zone.
 */

type Tx = Prisma.TransactionClient;

export interface PreDebitVars {
    business: string;
    firstName: string | null;
    plan: string;
    /** "₹1,200.00": what the debit takes. */
    amount: string;
    /** "Tue 6 Oct": the debit's day in the business's zone. */
    day: string;
}

export interface PreDebitNotice {
    kind: "AUTOPAY_PRE_DEBIT";
    debit: PreDebitVars;
}

/** Once per charge. */
export function preDebitNoticeKey(paymentIntentId: string): string {
    return `pre-debit:${paymentIntentId}`;
}

/** A charge still to be debited: the notice is about it. */
const WAITING = ["CREATED", "REQUIRES_PAYMENT"];

/**
 * Queue the notice for an eMandate charge on the caller's transaction, to
 * run at `runAt`. A charge whose notice is already queued or handled
 * queues nothing more, so a step run twice writes one job.
 */
export async function enqueuePreDebitNoticeInTx(
    tx: Pick<Tx, "job" | "customerNotice">,
    organizationId: string,
    input: { invoiceId: string; paymentIntentId: string; runAt: Date },
): Promise<boolean> {
    const eventKey = preDebitNoticeKey(input.paymentIntentId);
    const [handled, waiting] = await Promise.all([
        tx.customerNotice.count({ where: { organizationId, eventKey } }),
        tx.job.count({
            where: {
                organizationId,
                type: CUSTOMER_NOTIFY_TYPE,
                status: "PENDING",
                payload: { path: ["eventKey"], equals: eventKey },
            },
        }),
    ]);
    if (handled + waiting > 0) return false;
    await enqueueCustomerNotice(
        tx,
        organizationId,
        {
            kind: "AUTOPAY_PRE_DEBIT",
            eventKey,
            invoiceId: input.invoiceId,
            paymentIntentId: input.paymentIntentId,
        },
        input.runAt,
    );
    return true;
}

/** Take back a notice not yet run: its charge won't be debited. */
export async function cancelPreDebitNoticeInTx(
    tx: Pick<Tx, "job">,
    organizationId: string,
    paymentIntentId: string,
): Promise<void> {
    await tx.job.deleteMany({
        where: {
            organizationId,
            type: CUSTOMER_NOTIFY_TYPE,
            status: "PENDING",
            payload: {
                path: ["eventKey"],
                equals: preDebitNoticeKey(paymentIntentId),
            },
        },
    });
}

/** Why the notice didn't go, in the codes the subscription's history keeps. */
export type PreDebitMissing =
    /** The business has no email provider connected. */
    | "NO_EMAIL_PROVIDER"
    /** The customer has no email address. */
    | "NO_EMAIL_ADDRESS"
    /** The customer turned email off (consent revoked: SUPPRESSED). */
    | "EMAIL_OFF"
    /** It hasn't gone: not yet run, still being tried, or refused. */
    | "NOT_SENT";

export type PreDebitNoticeState =
    { went: true; sentAt: Date } | { went: false; why: PreDebitMissing };

/**
 * Whether the charge's notice went: its email handed to the business's
 * provider (the Message SENT), and when. Otherwise why not, as the team
 * can be told: the email was suppressed, or else what stands in its way
 * now (no provider, no address, email turned off), or simply not sent.
 */
export async function preDebitNoticeState(
    db: Pick<
        Tx,
        | "customerNotice"
        | "message"
        | "paymentIntent"
        | "communicationProvider"
        | "customerAccount"
        | "contact"
        | "consent"
        | "$queryRaw"
    >,
    organizationId: string,
    paymentIntentId: string,
): Promise<PreDebitNoticeState> {
    const notice = await db.customerNotice.findUnique({
        where: {
            organizationId_eventKey: {
                organizationId,
                eventKey: preDebitNoticeKey(paymentIntentId),
            },
        },
        select: { messageId: true },
    });
    const message = notice?.messageId
        ? await db.message.findFirst({
              where: { id: notice.messageId, organizationId },
              select: { status: true, updatedAt: true },
          })
        : null;
    if (message?.status === "SENT") {
        // The send writes SENT once, as it hands the email over.
        return { went: true, sentAt: message.updatedAt };
    }
    if (message?.status === "SUPPRESSED") {
        return { went: false, why: "EMAIL_OFF" };
    }
    return {
        went: false,
        why: await whyNot(db, organizationId, paymentIntentId),
    };
}

async function whyNot(
    db: Parameters<typeof preDebitNoticeState>[0],
    organizationId: string,
    paymentIntentId: string,
): Promise<PreDebitMissing> {
    if ((await emailRoute(db, organizationId)) === null) {
        return "NO_EMAIL_PROVIDER";
    }
    const intent = await db.paymentIntent.findFirst({
        where: { id: paymentIntentId, organizationId },
        select: { invoice: { select: { contactId: true } } },
    });
    const contactId = intent?.invoice?.contactId;
    const contact = contactId
        ? await resolveContact(db, contactId, organizationId)
        : null;
    if (!contact || contact.removed) return "NO_EMAIL_ADDRESS";
    if ((await contactNoticeAddress(db, organizationId, contact.id)) === null) {
        return "NO_EMAIL_ADDRESS";
    }
    const consent = await db.consent.findUnique({
        where: {
            contactId_channel: { contactId: contact.id, channel: "EMAIL" },
        },
        select: { status: true },
    });
    return consent?.status === "REVOKED" ? "EMAIL_OFF" : "NOT_SENT";
}

export const preDebitNotice = defineNotice<PreDebitNotice>({
    setting: null,
    load: async (tx, organizationId, payload) => {
        if (payload.kind !== "AUTOPAY_PRE_DEBIT" || !payload.paymentIntentId) {
            return null;
        }
        const intent = await tx.paymentIntent.findFirst({
            where: {
                id: payload.paymentIntentId,
                organizationId,
                purpose: null,
                status: { in: WAITING },
                viaMandate: { is: { method: "EMANDATE", status: "ACTIVE" } },
            },
            select: {
                amountCents: true,
                currency: true,
                debitAfter: true,
                invoice: {
                    select: {
                        id: true,
                        status: true,
                        contactId: true,
                        subscription: {
                            select: { plan: { select: { name: true } } },
                        },
                        contact: { select: { firstName: true } },
                        organization: { select: { name: true } },
                    },
                },
            },
        });
        const invoice = intent?.invoice;
        if (
            !intent?.debitAfter ||
            invoice?.status !== "ISSUED" ||
            !invoice.contactId ||
            !invoice.subscription ||
            intent.amountCents <= 0
        ) {
            return null;
        }
        const zone = await businessTimezone(tx, organizationId);
        return {
            contactId: invoice.contactId,
            invoiceId: invoice.id,
            vars: {
                kind: "AUTOPAY_PRE_DEBIT",
                debit: {
                    business: invoice.organization.name,
                    firstName: firstWord(invoice.contact?.firstName),
                    plan: invoice.subscription.plan.name,
                    amount: moneyWordsMinor(
                        intent.amountCents,
                        intent.currency,
                    ),
                    day: dayWords(intent.debitAfter, zone, { weekday: true }),
                },
            },
        };
    },
    sentence: ({ debit: d }) =>
        `${d.amount} will be taken from your bank account on ${d.day} for ${d.plan}: your membership's renewal, by the autopay you set up. If anything about it looks wrong, ask ${d.business} before then.`,
    subject: ({ debit: d }) =>
        `${d.amount} will be taken from your bank account on ${d.day}`,
    names: ({ debit }) => ({
        business: debit.business,
        firstName: debit.firstName,
    }),
});
