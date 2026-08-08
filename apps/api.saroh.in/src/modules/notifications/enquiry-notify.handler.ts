import { Injectable, Logger } from "@nestjs/common";
import type { Contact, Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { sendEnquiryNotificationEmail } from "../../common/email";
import { env } from "../../env";

/** The `type` this handler is registered under (matches the enquiry producer). */
export const ENQUIRY_NOTIFY_TYPE = "enquiry.notify";

/** The notification `type` written for a new enquiry (see schema comment). */
export const ENQUIRY_NEW_NOTIFICATION_TYPE = "enquiry.new";

/**
 * Payload the enquiry submit (S3-002) enqueues inside the lead's transaction.
 * Only `leadId` is load-bearing here — the rest are provenance the handler
 * re-derives from the Lead so it never trusts stale ids.
 */
export interface EnquiryNotifyPayload {
    leadId: string;
    contactId: string;
    formId: string;
    submissionId: string;
}

/**
 * Consumer for the `enquiry.notify` job (S3-006): turn a committed enquiry Lead
 * into ONE durable in-app {@link Notification} for the org's owners/admins, plus
 * a best-effort email to each.
 *
 * Delivery is AT-LEAST-ONCE (the job worker may run this more than once), so the
 * handler is idempotent by construction:
 *
 *  1. The durable Notification is created FIRST, guarded by the
 *     `@@unique([leadId, type])` index. A retry re-attempts the create, hits
 *     P2002, and is treated as "already notified" — so the owner is notified
 *     EXACTLY ONCE no matter how many times the job runs.
 *  2. Email is sent AFTER the durable row. If email throws, the error
 *     propagates so the worker retries the whole job; the unique guard above
 *     makes that retry a no-op for the Notification (never a duplicate inbox
 *     row) while still re-attempting delivery. Email is therefore best-effort
 *     at-least-once, layered on top of the exactly-once in-app record.
 */
@Injectable()
export class EnquiryNotifyHandler {
    private readonly logger = new Logger(EnquiryNotifyHandler.name);

    /** Bound {@link JobHandler} to register with the {@link JobHandlerRegistry}. */
    readonly handle = async (job: Job): Promise<void> => {
        const { leadId } = job.payload as unknown as EnquiryNotifyPayload;

        const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            include: { contact: true, form: true },
        });

        // The lead vanished (deleted before the job ran). Nothing to notify —
        // complete as a no-op rather than retrying a job that can never succeed.
        if (!lead) {
            this.logger.warn(
                `enquiry.notify: lead ${leadId} not found; completing as no-op.`,
            );
            return;
        }

        const contactName = this.contactName(lead.contact);
        const formName = lead.form?.name ?? "your enquiry form";
        const title = `New enquiry from ${contactName}`;
        const body = `${contactName} submitted "${formName}".`;

        // (1) Durable notification, guarded by the (leadId, type) unique so the
        // at-least-once worker delivers it EXACTLY once.
        try {
            await prisma.notification.create({
                data: {
                    organizationId: lead.organizationId,
                    type: ENQUIRY_NEW_NOTIFICATION_TYPE,
                    title,
                    body,
                    leadId: lead.id,
                },
            });
        } catch (err) {
            // P2002 = unique violation on (leadId, type): a previous attempt
            // already created the durable row. Idempotent no-op — fall through
            // so email is still (re-)attempted on a retry.
            if ((err as { code?: string }).code !== "P2002") {
                throw err;
            }
            this.logger.log(
                `enquiry.notify: lead ${leadId} already notified; skipping create.`,
            );
        }

        // (2) Best-effort email to the org's owners/admins. Throwing here lets
        // the worker retry the whole job; the unique above keeps that retry from
        // duplicating the Notification.
        const recipients = await this.ownerAdminEmails(lead.organizationId);
        const leadUrl = `${this.appBaseUrl()}/leads/${lead.id}`;
        for (const to of recipients) {
            await sendEnquiryNotificationEmail(to, {
                contactName,
                formName,
                leadUrl,
            });
        }
    };

    /** A human name for the contact, falling back to the email/"someone". */
    private contactName(contact: Contact | null): string {
        if (!contact) return "someone";
        const full = [contact.firstName, contact.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        // `||` (not `??`) is intentional: fall through on EMPTY strings too.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        return full || contact.company || contact.email || "someone";
    }

    /** Distinct OWNER/ADMIN member emails for the org (the notify recipients). */
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

    /** The app dashboard origin the lead link points at. */
    private appBaseUrl(): string {
        return (env.APP_URL ?? "https://app.saroh.in").replace(/\/$/, "");
    }
}
