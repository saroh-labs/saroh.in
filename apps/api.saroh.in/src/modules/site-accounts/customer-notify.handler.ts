import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { CommunicationsService } from "../communications/communications.service";
import { contactNoticeAddress } from "../communications/contact-address";
import { emailRoute } from "../communications/email-route";
import { noticeOn } from "../communications/notice-settings";
import { isNoticeTemplate } from "../communications/transactional";
import { resolveContact } from "../customer-workspace/resolve-contact";
import type { CustomerNotifyPayload } from "./customer-notify-queue";
import { CUSTOMER_NOTIFY_TYPE } from "./customer-notify-queue";
import { noticeLink } from "./notice-link";
import { threadLive } from "./notice-reach";
import type { NoticeVars } from "./notices";
import { loadNotice, noticeDefinition, withLink } from "./notices";
import type { NoticeSubject as Subject } from "./notices/notice";
import { appendMessage } from "./thread-store";

export { CUSTOMER_NOTIFY_TYPE } from "./customer-notify-queue";
export { loadNotice as loadSubject, withLink } from "./notices";
export { orderContactId } from "./notices/order";

type Tx = Prisma.TransactionClient;

/** What a notice is about, read fresh when it runs. */
export type NoticeSubject = Subject<NoticeVars>;

/** What one notice became. */
export interface NoticeOutcome {
    /** Already handled for this event: nothing was written this time. */
    duplicate: boolean;
    threadMessageId: string | null;
    messageId: string | null;
}

const NOTHING: NoticeOutcome = {
    duplicate: false,
    threadMessageId: null,
    messageId: null,
};

/**
 * Tells a customer about their own booking, order or waitlist place
 * (round-2 A14, R15): the `customer.notify` job, and what `booking.notify`
 * delegates to.
 *
 * Each kind is a file under `notices/` (U2 #1133), registered in
 * `notices/index.ts`: what it is about, its words, its switch. This
 * handler is the same for every kind. On one transaction, in the
 * business's RLS context:
 *  0. A kind with a switch (U1, `noticeOn`) that the business turned off
 *     tells nobody, read on this transaction.
 *  1. The event's `CustomerNotice` row is claimed first (insert, skipping a
 *     duplicate), so a job run twice, or two jobs for one event, tell the
 *     customer once.
 *  2. What it is about is read again now: a booking cancelled since isn't
 *     confirmed, an order step undone isn't announced, a merged-away
 *     contact is its survivor (`resolveContact`), and a removed one hears
 *     nothing.
 *  3. The account thread gets a SYSTEM message when it is live
 *     (`notice-reach.ts`): the customer sees it in their account, or when
 *     they first sign in.
 *  4. The contact's own email (DEC-174 D1: a desk, phone or guest
 *     customer too; a live site account's verified address wins, A2,
 *     `contactNoticeAddress`), at a business whose own email provider is
 *     connected, is also emailed through D17's one transactional path (`CommunicationsService.queueTransactional`): a
 *     `Message` and `Delivery` sent by `message.send`, which retries a
 *     failed send and leaves the thread message standing. Saroh never
 *     emails it itself: with no provider, nothing is emailed. Who emails
 *     is read here, once and first (`emailRoute`), and handed to the call,
 *     so the path's "connect an email provider" 409 can never roll this
 *     transaction back.
 *
 * Nothing goes by SMS or WhatsApp: there is no verified phone this round.
 */
@Injectable()
export class CustomerNotifyService {
    constructor(private readonly comms: CommunicationsService) {}

    /** Handle one notice on the caller's transaction. */
    async notify(
        tx: Tx,
        organizationId: string,
        payload: CustomerNotifyPayload,
        now: Date,
    ): Promise<NoticeOutcome> {
        const definition = noticeDefinition(payload.kind);
        if (
            definition.setting !== null &&
            !(await noticeOn(tx, organizationId, definition.setting))
        ) {
            return NOTHING;
        }
        // Who would email it, read once: the business's own provider, or
        // nobody.
        const provider = await emailRoute(tx, organizationId);
        const claimed = await tx.customerNotice.createMany({
            data: [
                {
                    organizationId,
                    eventKey: payload.eventKey,
                    kind: payload.kind,
                    bookingId: payload.bookingId ?? null,
                    orderId: payload.orderId ?? null,
                },
            ],
            skipDuplicates: true,
        });
        if (claimed.count === 0) return { ...NOTHING, duplicate: true };

        const subject = await loadNotice(tx, organizationId, payload, now);
        if (!subject) return NOTHING;
        const contact = await resolveContact(
            tx,
            subject.contactId,
            organizationId,
        );
        if (!contact || contact.removed) return NOTHING;

        const [thread, address] = await Promise.all([
            threadLive(organizationId),
            provider === null
                ? Promise.resolve(null)
                : contactNoticeAddress(tx, organizationId, contact.id),
        ]);

        let threadMessageId: string | null = null;
        if (thread) {
            const message = await appendMessage(tx, {
                organizationId,
                contactId: contact.id,
                author: "SYSTEM",
                body: definition.sentence(subject.vars),
                event: payload.kind,
                now,
            });
            threadMessageId = message.id;
        }

        let messageId: string | null = null;
        if (address !== null && provider !== null) {
            // The email carries the way back to the order or the booking
            // on the business's own site; the thread's sentence doesn't
            // need one, since it is read there.
            const link = await noticeLink(tx, organizationId, {
                kind: payload.kind,
                contactId: contact.id,
                orderId: subject.orderId,
                bookingId: subject.bookingId,
                serviceId: subject.serviceId,
            });
            const queued = await this.comms.queueTransactional(
                tx,
                organizationId,
                {
                    template: payload.kind,
                    notice: withLink(subject.vars, link),
                    provider,
                    recipient: { kind: "CONTACT", contactId: contact.id },
                    createdByUserId: null,
                },
            );
            messageId = queued.id;
        }

        await tx.customerNotice.update({
            where: {
                organizationId_eventKey: {
                    organizationId,
                    eventKey: payload.eventKey,
                },
            },
            data: {
                contactId: contact.id,
                bookingId: subject.bookingId ?? null,
                orderId: subject.orderId ?? null,
                threadMessageId,
                messageId,
            },
        });
        return { duplicate: false, threadMessageId, messageId };
    }
}

/** The `customer.notify` job: {@link CustomerNotifyService} per event. */
@Injectable()
export class CustomerNotifyHandler {
    private readonly logger = new Logger(CustomerNotifyHandler.name);

    constructor(private readonly notices: CustomerNotifyService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const payload = payloadOf(job.payload);
        if (!payload || !job.organizationId) {
            this.logger.warn(
                `${CUSTOMER_NOTIFY_TYPE} job ${job.id} names no event; nothing to tell`,
            );
            return;
        }
        const organizationId = job.organizationId;
        await runInOrgContext(organizationId, () =>
            prisma.$transaction((tx) =>
                this.notices.notify(tx, organizationId, payload, new Date()),
            ),
        );
    };
}

function payloadOf(value: unknown): CustomerNotifyPayload | null {
    if (typeof value !== "object" || value === null) return null;
    const p = value as Partial<CustomerNotifyPayload>;
    if (!isNoticeTemplate(p.kind)) return null;
    if (typeof p.eventKey !== "string" || p.eventKey.length === 0) {
        return null;
    }
    return p as CustomerNotifyPayload;
}
