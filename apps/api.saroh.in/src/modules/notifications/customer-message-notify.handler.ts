import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { appBase } from "../../common/app-url";
import { sendCustomerMessageNotificationEmail } from "../../common/email";
import { contactEmailForDisplay } from "../contacts/contact-email";
import type { CustomerMessageNotifyPayload } from "./customer-message-notify";
import {
    CUSTOMER_MESSAGE_NOTIFY_TYPE,
    MESSAGE_NEW_NOTIFICATION_TYPE,
} from "./customer-message-notify";

export {
    CUSTOMER_MESSAGE_NOTIFY_TYPE,
    MESSAGE_NEW_NOTIFICATION_TYPE,
} from "./customer-message-notify";

/** How much of the customer's words the notice quotes. */
export const MESSAGE_QUOTE_MAX = 140;

/** The customer's words on one line, cut to {@link MESSAGE_QUOTE_MAX}. */
export function messageQuote(body: string): string {
    const line = body.replace(/\s+/g, " ").trim();
    return line.length > MESSAGE_QUOTE_MAX
        ? `${line.slice(0, MESSAGE_QUOTE_MAX - 1).trimEnd()}…`
        : line;
}

/**
 * Who wrote, as the team knows them: the contact's name, else a real
 * email on the contact, else the email their site account signs in with
 * (a separate contact holds only a reserved placeholder, DEC-049), else
 * "A customer". Never a placeholder address.
 */
export function writerName(input: {
    firstName: string | null;
    lastName: string | null;
    contactEmail: string | null;
    accountEmail: string | null;
}): string {
    const name = [input.firstName, input.lastName]
        .map((part) => part?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    if (name) return name;
    return (
        contactEmailForDisplay(input.contactEmail, input.accountEmail) ??
        "A customer"
    );
}

/**
 * Consumer for `customer-message.notify` (UX-014): a customer wrote from
 * their account on the business's site, and the team must hear of it —
 * before, the message sat on Customer Detail › Messages and nobody knew.
 *
 * The enquiry notice's shape (`enquiry-notify.handler.ts`, UX-002):
 *  1. One durable notice in the business's inbox (the bell), opening on the
 *     customer's thread, unique on (messageId, type): a job run twice
 *     notifies once.
 *  2. Then a best-effort email to each owner and admin, through Saroh's
 *     own mail, as an enquiry's is. A failed send throws so the worker
 *     retries; the unique above keeps the retry from a second notice.
 *
 * A message that has gone (the contact removed for privacy, C11) is a
 * successful no-op. Home's Needs you lists the customer too once their wait
 * passes an hour (`home-people-sources.ts`, `CRM_UNANSWERED_MESSAGES`).
 */
@Injectable()
export class CustomerMessageNotifyHandler {
    private readonly logger = new Logger(CustomerMessageNotifyHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const { messageId } =
            job.payload as unknown as CustomerMessageNotifyPayload;

        const message = await prisma.customerThreadMessage.findUnique({
            where: { id: messageId },
            select: {
                id: true,
                organizationId: true,
                author: true,
                body: true,
                customerAccount: { select: { email: true } },
                thread: {
                    select: {
                        contact: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                mergedIntoId: true,
                            },
                        },
                    },
                },
            },
        });
        if (message?.author !== "CUSTOMER") {
            this.logger.warn(
                `${CUSTOMER_MESSAGE_NOTIFY_TYPE}: message ${messageId} not found or not a customer's; completing as no-op.`,
            );
            return;
        }

        const contact = message.thread.contact;
        const who = writerName({
            firstName: contact.firstName,
            lastName: contact.lastName,
            contactEmail: contact.email,
            accountEmail: message.customerAccount?.email ?? null,
        });
        const quote = messageQuote(message.body);
        // A merge since (C9) moved the thread to the survivor: open that.
        const contactId = contact.mergedIntoId ?? contact.id;

        try {
            await prisma.notification.create({
                data: {
                    organizationId: message.organizationId,
                    type: MESSAGE_NEW_NOTIFICATION_TYPE,
                    title: `${who} sent you a message`,
                    body: quote,
                    contactId,
                    messageId: message.id,
                },
            });
        } catch (err) {
            if ((err as { code?: string }).code !== "P2002") throw err;
            this.logger.log(
                `${CUSTOMER_MESSAGE_NOTIFY_TYPE}: message ${messageId} already notified; skipping create.`,
            );
        }

        const recipients = await this.ownerAdminEmails(message.organizationId);
        const threadUrl = `${appBase()}/customers/${contactId}?tab=msg`;
        for (const to of recipients) {
            await sendCustomerMessageNotificationEmail(to, {
                customerName: who,
                message: quote,
                threadUrl,
            });
        }
    };

    /** Distinct OWNER/ADMIN member emails, as the enquiry notice reaches. */
    private async ownerAdminEmails(organizationId: string): Promise<string[]> {
        const memberships = await prisma.membership.findMany({
            where: { organizationId, role: { in: ["OWNER", "ADMIN"] } },
            include: { user: true },
        });
        const emails = memberships
            .map((m) => m.user.email)
            .filter((e): e is string => Boolean(e));
        return Array.from(new Set(emails));
    }
}
