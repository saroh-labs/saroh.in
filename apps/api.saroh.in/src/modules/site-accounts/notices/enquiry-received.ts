import type { Prisma } from "@saroh/database";

import { contactNoticeAddress } from "../../communications/contact-address";
import { enquiryMessage, quotableMessage } from "../../enquiry/enquiry-words";
import type { FormField } from "../../forms/dto";
import { businessName, defineNotice, firstWord } from "./notice";

/**
 * "We got your message" (DEC-174 U15, #1146): the business's automatic
 * answer to someone who sent an enquiry from its site, so they hear back
 * straight away. Queued by the enquiry's submit (`enquiry/enquiry-reply.ts`)
 * only while the ENQUIRY_REPLY switch is on and the business's own email
 * provider is connected; email only, never the account thread.
 *
 * Read again when the job runs, and sent only when:
 * - the submission is still there, with a contact that has an address;
 * - nothing has been emailed to that address as an enquiry reply by this
 *   business in the last {@link REPLY_WINDOW_MS} (A8): a form sent fifty
 *   times with one address answers once. Two runs at once for one address
 *   wait for each other on a lock, so the second sees the first's email;
 * - no email from this business to that address has bounced.
 *
 * It promises no time to reply: the business has never said one.
 */

/** One auto-reply per address per business in this long (A8). */
export const REPLY_WINDOW_MS = 24 * 3600_000;

export interface EnquiryReceivedVars {
    business: string;
    firstName: string | null;
    /** Their message as quoted back, or null: none, or not quotable. */
    message: string | null;
}

export interface EnquiryReceivedNotice {
    kind: "ENQUIRY_RECEIVED";
    enquiry: EnquiryReceivedVars;
}

type Tx = Prisma.TransactionClient;

/**
 * Whether this address may get an auto-reply now: none in the window, and
 * no bounce. Holds a lock on the address until the transaction ends.
 */
export async function replyAllowed(
    tx: Tx,
    organizationId: string,
    address: string,
    now: Date,
): Promise<boolean> {
    const lock = `enquiry-reply:${organizationId}:${address.toLowerCase()}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
    const toAddress = { equals: address, mode: "insensitive" as const };
    const recent = await tx.message.count({
        where: {
            organizationId,
            template: "ENQUIRY_RECEIVED",
            toAddress,
            createdAt: { gte: new Date(now.getTime() - REPLY_WINDOW_MS) },
        },
    });
    if (recent > 0) return false;
    const bounced = await tx.delivery.count({
        where: {
            organizationId,
            status: "BOUNCED",
            message: { channel: "EMAIL", toAddress },
        },
    });
    return bounced === 0;
}

export const enquiryReceivedNotice = defineNotice<EnquiryReceivedNotice>({
    setting: "ENQUIRY_REPLY",
    emailOnly: true,
    load: async (tx, organizationId, payload, now) => {
        if (payload.kind !== "ENQUIRY_RECEIVED" || !payload.submissionId) {
            return null;
        }
        const submission = await tx.submission.findFirst({
            where: { id: payload.submissionId, organizationId },
            select: {
                contactId: true,
                data: true,
                form: { select: { fields: true } },
                contact: { select: { firstName: true } },
            },
        });
        if (!submission?.contactId) return null;
        const address = await contactNoticeAddress(
            tx,
            organizationId,
            submission.contactId,
        );
        if (address === null) return null;
        if (!(await replyAllowed(tx, organizationId, address, now))) {
            return null;
        }
        const fields = (Array.isArray(submission.form.fields)
            ? submission.form.fields
            : []) as unknown as FormField[];
        const data =
            typeof submission.data === "object" &&
            submission.data !== null &&
            !Array.isArray(submission.data)
                ? (submission.data as Record<string, unknown>)
                : {};
        return {
            contactId: submission.contactId,
            vars: {
                kind: "ENQUIRY_RECEIVED",
                enquiry: {
                    business: await businessName(tx, organizationId),
                    firstName: firstWord(submission.contact?.firstName),
                    message: quotableMessage(enquiryMessage(fields, data)),
                },
            },
        };
    },
    sentence: ({ enquiry }) =>
        `Thanks for getting in touch. ${enquiry.business} got your message and will reply soon.`,
    subject: ({ enquiry }) => `${enquiry.business} got your message`,
    names: ({ enquiry }) => ({
        business: enquiry.business,
        firstName: enquiry.firstName,
    }),
    quote: ({ enquiry }) =>
        enquiry.message ? { lead: "You wrote:", text: enquiry.message } : null,
});
