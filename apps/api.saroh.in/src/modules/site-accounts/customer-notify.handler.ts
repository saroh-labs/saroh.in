import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { lockMeter } from "../billing/metering.service";
import { CommunicationsService } from "../communications/communications.service";
import { SAROH_EMAILS_KEY } from "../communications/saroh-delivery";
import { emailRoute } from "../communications/saroh-may-send";
import { isNoticeTemplate } from "../communications/transactional";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { holdsOnPayment } from "../orders/online-checkout";
import type { CustomerNotifyPayload } from "./customer-notify-queue";
import { CUSTOMER_NOTIFY_TYPE } from "./customer-notify-queue";
import { hasLiveAccount, threadLive } from "./notice-reach";
import type { NoticeVars } from "./notify-templates";
import { noticeSentence } from "./notify-templates";
import { appendMessage } from "./thread-store";
import { loadWaitlistOffer } from "./waitlist-notice";

export { CUSTOMER_NOTIFY_TYPE } from "./customer-notify-queue";

type Tx = Prisma.TransactionClient;

/** What a notice is about, read fresh when it runs. */
export interface NoticeSubject {
    contactId: string;
    vars: NoticeVars;
    bookingId?: string;
    orderId?: string;
}

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
 * On one transaction, in the business's RLS context:
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
 *  4. A live site account with a verified email, at a business whose own
 *     email provider is connected, is also emailed through D17's one
 *     transactional path (`CommunicationsService.queueTransactional`): a
 *     `Message` and `Delivery` sent by `message.send`, which retries a
 *     failed send and leaves the thread message standing. A booking notice
 *     at a business with no provider goes through Saroh instead when
 *     the one rule says so (`emailRoute`, DEC-086). Who emails is decided
 *     here, once and first, and handed to the call, so the path's "connect
 *     an email provider" 409 can never roll this transaction back.
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
        // Who would email it, decided once (DEC-086). Saroh's route is
        // counted against its email allowance, so only then is the
        // plan-meter lock taken — here, the one place it is, before any
        // row this transaction writes (`backend-jobs.md`, advisory lock
        // registry; `booking.notify` writes nothing before calling this).
        const route = await emailRoute(tx, organizationId, payload.kind, now);
        if (route.route === "SAROH") {
            await lockMeter(tx, organizationId, SAROH_EMAILS_KEY);
        }
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

        const subject = await loadSubject(tx, organizationId, payload, now);
        if (!subject) return NOTHING;
        const contact = await resolveContact(
            tx,
            subject.contactId,
            organizationId,
        );
        if (!contact || contact.removed) return NOTHING;

        const [thread, account] = await Promise.all([
            threadLive(organizationId),
            hasLiveAccount(tx, organizationId, contact.id),
        ]);

        let threadMessageId: string | null = null;
        if (thread) {
            const message = await appendMessage(tx, {
                organizationId,
                contactId: contact.id,
                author: "SYSTEM",
                body: noticeSentence(subject.vars),
                event: payload.kind,
                now,
            });
            threadMessageId = message.id;
        }

        let messageId: string | null = null;
        if (account && route.route !== null) {
            const queued = await this.comms.queueTransactional(
                tx,
                organizationId,
                {
                    template: payload.kind,
                    notice: subject.vars,
                    route,
                    // Saroh's cap per booking counts by it (DEC-086).
                    ...(subject.bookingId
                        ? { bookingId: subject.bookingId }
                        : {}),
                    recipient: { kind: "SITE_ACCOUNT", contactId: contact.id },
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

// ---- What each notice is about ---------------------------------------------

/** Read the booking, order or place the notice is about; null to skip. */
export async function loadSubject(
    tx: Tx,
    organizationId: string,
    payload: CustomerNotifyPayload,
    now: Date = new Date(),
): Promise<NoticeSubject | null> {
    switch (payload.kind) {
        case "BOOKING_CONFIRMED":
        case "BOOKING_MOVED":
        case "BOOKING_CANCELLED":
            return loadBooking(tx, organizationId, payload.kind, payload);
        case "ORDER_PLACED":
            return loadPlacedOrder(tx, organizationId, payload);
        case "ORDER_READY":
        case "ORDER_HANDED_OVER":
            return loadOrderStep(tx, organizationId, payload.kind, payload);
        case "WAITLIST_OFFER":
            // A place held for them (A12), while it still is.
            return loadWaitlistOffer(tx, organizationId, payload, now);
    }
}

async function businessName(tx: Tx, organizationId: string): Promise<string> {
    const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
    });
    return org?.name ?? "";
}

function firstWord(name: string | null | undefined): string | null {
    const first = name?.trim().split(/\s+/)[0] ?? "";
    return first === "" ? null : first;
}

async function loadBooking(
    tx: Tx,
    organizationId: string,
    kind: "BOOKING_CONFIRMED" | "BOOKING_MOVED" | "BOOKING_CANCELLED",
    payload: CustomerNotifyPayload,
): Promise<NoticeSubject | null> {
    if (!payload.bookingId) return null;
    const booking = await tx.booking.findFirst({
        where: { id: payload.bookingId, organizationId },
        select: {
            id: true,
            status: true,
            startAt: true,
            timezone: true,
            contactId: true,
            bookerName: true,
            courseEnrollmentId: true,
            service: { select: { name: true } },
            staff: { select: { name: true } },
            contact: { select: { firstName: true } },
        },
    });
    if (!booking?.contactId) return null;
    // A course's sessions are told about as the course, not one by one.
    if (booking.courseEnrollmentId) return null;
    // Where it stands now: a booking cancelled since isn't confirmed or
    // moved any more, and one not cancelled isn't cancelled.
    if (kind === "BOOKING_CONFIRMED" && booking.status !== "CONFIRMED") {
        return null;
    }
    if (kind === "BOOKING_MOVED" && booking.status === "CANCELLED") {
        return null;
    }
    if (kind === "BOOKING_CANCELLED" && booking.status !== "CANCELLED") {
        return null;
    }
    const event = payload.bookingEventId
        ? await tx.bookingEvent.findFirst({
              where: { id: payload.bookingEventId, bookingId: booking.id },
              select: {
                  actorUserId: true,
                  fromStartAt: true,
                  toStartAt: true,
              },
          })
        : null;
    const startAt =
        kind === "BOOKING_CANCELLED"
            ? (event?.fromStartAt ?? booking.startAt)
            : kind === "BOOKING_MOVED"
              ? (event?.toStartAt ?? booking.startAt)
              : booking.startAt;
    return {
        contactId: booking.contactId,
        bookingId: booking.id,
        vars: {
            kind,
            booking: {
                business: await businessName(tx, organizationId),
                firstName:
                    firstWord(booking.contact?.firstName) ??
                    firstWord(booking.bookerName),
                service: booking.service.name,
                staff: booking.staff?.name ?? null,
                startAt,
                fromStartAt:
                    kind === "BOOKING_MOVED"
                        ? (event?.fromStartAt ?? null)
                        : null,
                timeZone: booking.timezone,
                byCustomer: event ? event.actorUserId === null : false,
            },
        },
    };
}

async function loadOrderStep(
    tx: Tx,
    organizationId: string,
    kind: "ORDER_READY" | "ORDER_HANDED_OVER",
    payload: CustomerNotifyPayload,
): Promise<NoticeSubject | null> {
    if (!payload.orderId || !payload.orderEventId) return null;
    const [order, event] = await Promise.all([
        tx.order.findFirst({
            where: { id: payload.orderId, organizationId },
            select: {
                id: true,
                orderId: true,
                status: true,
                fulfilment: true,
                customerId: true,
                customerAccountId: true,
                courierName: true,
                trackingNumber: true,
                trackingUrl: true,
                customer: { select: { firstName: true } },
            },
        }),
        tx.orderEvent.findFirst({
            where: { id: payload.orderEventId, orderId: payload.orderId },
            select: { toStage: true, undoneAt: true },
        }),
    ]);
    // Undone before it went (B6), or the order cancelled meanwhile.
    if (!order || !event || event.undoneAt) return null;
    if (order.status === "CANCELLED") return null;
    const stage = event.toStage;
    if (
        stage !== "READY" &&
        stage !== "HANDED_TO_COURIER" &&
        stage !== "OUT_FOR_DELIVERY"
    ) {
        return null;
    }
    const contactId = await orderContactId(tx, organizationId, order);
    if (!contactId) return null;
    return {
        contactId,
        orderId: order.id,
        vars: {
            kind,
            order: {
                business: await businessName(tx, organizationId),
                firstName: firstWord(order.customer?.firstName ?? null),
                number: order.orderId,
                stage,
                pickup: order.fulfilment === "PICKUP",
                courier: order.courierName,
                trackingNumber: order.trackingNumber,
                trackingUrl: order.trackingUrl,
            },
        },
    };
}

/**
 * A website order just placed (UX-042), while it still stands: not
 * cancelled, and an online checkout only once it is paid (G13).
 */
async function loadPlacedOrder(
    tx: Tx,
    organizationId: string,
    payload: CustomerNotifyPayload,
): Promise<NoticeSubject | null> {
    if (!payload.orderId) return null;
    const order = await tx.order.findFirst({
        where: { id: payload.orderId, organizationId },
        select: {
            id: true,
            orderId: true,
            status: true,
            paymentStatus: true,
            placedOnline: true,
            payOnHandover: true,
            fulfilment: true,
            customerId: true,
            customerAccountId: true,
            customer: { select: { firstName: true } },
        },
    });
    if (!order?.placedOnline || order.status === "CANCELLED") return null;
    if (holdsOnPayment(order) && order.paymentStatus !== "PAID") return null;
    const contactId = await orderContactId(tx, organizationId, order);
    if (!contactId) return null;
    return {
        contactId,
        orderId: order.id,
        vars: {
            kind: "ORDER_PLACED",
            placed: {
                business: await businessName(tx, organizationId),
                firstName: firstWord(order.customer?.firstName ?? null),
                number: order.orderId,
                fulfilment: order.fulfilment,
                payOnHandover: order.payOnHandover,
            },
        },
    };
}

/**
 * The contact an order is told to: the site account that placed it, or
 * else the contact its store customer is linked to (C2's identity links,
 * the oldest first), as the account's Orders tab reads them (A7).
 */
export async function orderContactId(
    tx: Pick<Tx, "customerAccount" | "customerIdentityLink">,
    organizationId: string,
    order: { customerId: string | null; customerAccountId: string | null },
): Promise<string | null> {
    if (order.customerAccountId) {
        const account = await tx.customerAccount.findFirst({
            where: { id: order.customerAccountId, organizationId },
            select: { contactId: true },
        });
        if (account) return account.contactId;
    }
    // A walk-in (B13) has no customer record, so no one to tell.
    if (!order.customerId) return null;
    const link = await tx.customerIdentityLink.findFirst({
        where: { organizationId, customerId: order.customerId },
        orderBy: { createdAt: "asc" },
        select: { contactId: true },
    });
    return link?.contactId ?? null;
}
