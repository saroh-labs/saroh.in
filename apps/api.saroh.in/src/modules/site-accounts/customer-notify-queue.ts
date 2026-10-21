import type { Prisma } from "@saroh/database";

import { noticeOn } from "../communications/notice-settings";
import { orderNoticeKind, orderNoticeSetting } from "./notices/order";
import type { NoticeKind } from "./notify-templates";

/**
 * Enqueueing and cancelling `customer.notify` (round-2 A14, R15): the one
 * job that tells a customer about their own booking, order or waitlist
 * place. Plain functions on the caller's transaction (the outbox, DEC-008),
 * so the order and booking writers need no Nest wiring to call them. The
 * handler is `customer-notify.handler.ts`.
 *
 * Every notice is keyed to the event it is about (`eventKey`, unique per
 * business in `CustomerNotice`), so a job run twice, or enqueued twice for
 * one event, tells the customer once.
 */

/** The `type` the handler is registered under. */
export const CUSTOMER_NOTIFY_TYPE = "customer.notify";

/**
 * How long a held notice waits before it goes (plan A14; B6's Undo): long
 * enough for an Undo to take it back unsent.
 */
export const HELD_NOTICE_DELAY_MS = 10_000;

/** An order step's hold: {@link HELD_NOTICE_DELAY_MS}. */
export const ORDER_NOTICE_DELAY_MS = HELD_NOTICE_DELAY_MS;

/** What `customer.notify` carries: ids and the event, never the words. */
export interface CustomerNotifyPayload {
    kind: NoticeKind;
    /** Unique per business: what makes the notice once-only. */
    eventKey: string;
    bookingId?: string;
    /** The BookingEvent it is about (booked, moved, cancelled). */
    bookingEventId?: string | null;
    orderId?: string;
    /** The OrderEvent it is about: the step an Undo names. */
    orderEventId?: string;
    /** The place in line a freed place is offered to (A12). */
    waitlistEntryId?: string;
    /** The enquiry a "we got your message" answers (U15). */
    submissionId?: string;
    /** The membership a MEMBERSHIP_* notice is about (U11). */
    subscriptionId?: string;
    /** The SubscriptionEvent it is about: joined, paused, cancelled… */
    subscriptionEventId?: string;
    /** The end a MEMBERSHIP_ENDING names, as ISO (U19). */
    periodEnd?: string;
    /** The team's reply in the Messages thread a THREAD_REPLY is for (U14). */
    threadMessageId?: string;
    /** The invoice a failed autopay charge was for (U10). */
    invoiceId?: string;
    /** The online refund the customer is told is on its way (U12). */
    refundId?: string;
    /** The course enrolment a COURSE_* notice is about (U17). */
    courseEnrollmentId?: string;
    /**
     * A BOOKING_CANCELLED for a place in a class the business cancelled
     * as a whole (U17): "‹Business› cancelled this class".
     */
    classCancelled?: boolean;
    /** The "Tell me when it's back" a BACK_IN_STOCK notice tells (U23). */
    stockWatchId?: string;
}

type Tx = Pick<Prisma.TransactionClient, "job">;

/** A booking notice's key: its BookingEvent, which is once per change. */
export function bookingNoticeKey(bookingEventId: string): string {
    return `booking:${bookingEventId}`;
}

/** An order step's key: the step's OrderEvent, the id an Undo names. */
export function orderNoticeKey(orderEventId: string): string {
    return `order:${orderEventId}`;
}

/** A placed order's key: once per order, however it came to be placed. */
export function orderPlacedNoticeKey(orderId: string): string {
    return `order-placed:${orderId}`;
}

/** An enquiry's auto-reply key: once per submission (U15). */
export function enquiryReceivedNoticeKey(submissionId: string): string {
    return `enquiry-received:${submissionId}`;
}

/** An online refund's key: once per refund, however it was sent (U12). */
export function refundNoticeKey(refundId: string): string {
    return `refund:${refundId}`;
}

/** Queue one notice on the caller's transaction. */
export async function enqueueCustomerNotice(
    tx: Tx,
    organizationId: string,
    payload: CustomerNotifyPayload,
    runAt?: Date,
): Promise<void> {
    await tx.job.create({
        data: {
            organizationId,
            type: CUSTOMER_NOTIFY_TYPE,
            payload: payload as unknown as Prisma.InputJsonObject,
            ...(runAt ? { runAt } : {}),
        },
        select: { id: true },
    });
}

/**
 * Queue a notice held a few seconds, so the Undo beside the change that
 * caused it can take it back unsent ({@link cancelHeldCustomerNotice}).
 * Any notice whose change has an Undo uses this; the hold is
 * {@link HELD_NOTICE_DELAY_MS} unless the caller's Undo lasts longer.
 */
export async function enqueueHeldCustomerNotice(
    tx: Tx,
    organizationId: string,
    payload: CustomerNotifyPayload,
    hold: { now: Date; ms?: number },
): Promise<void> {
    await enqueueCustomerNotice(
        tx,
        organizationId,
        payload,
        new Date(hold.now.getTime() + (hold.ms ?? HELD_NOTICE_DELAY_MS)),
    );
}

/**
 * An Undo: take back a held notice if it hasn't gone. `told` says whether
 * the customer had already been told (a thread message or an email was
 * written for it), which is when the Undo says "They've already been told".
 */
export async function cancelHeldCustomerNotice(
    tx: Pick<Prisma.TransactionClient, "job" | "customerNotice">,
    organizationId: string,
    eventKey: string,
): Promise<{ cancelled: boolean; told: boolean }> {
    const { count } = await tx.job.deleteMany({
        where: {
            organizationId,
            type: CUSTOMER_NOTIFY_TYPE,
            status: "PENDING",
            payload: { path: ["eventKey"], equals: eventKey },
        },
    });
    const notice = await tx.customerNotice.findUnique({
        where: { organizationId_eventKey: { organizationId, eventKey } },
        select: { threadMessageId: true, messageId: true },
    });
    return {
        cancelled: count > 0,
        told: Boolean(notice?.threadMessageId ?? notice?.messageId),
    };
}

/**
 * An order moved to a step the customer is told about (Ready, handed to
 * the courier, out for delivery; Delivered and a digital order's Sent while
 * the business sends delivery updates, U16): queue its notice, held for
 * {@link ORDER_NOTICE_DELAY_MS} so an Undo can take it back. Any other
 * step queues nothing. Returns whether one was queued.
 */
export async function enqueueOrderStepNotice(
    tx: Pick<Prisma.TransactionClient, "job" | "customerNoticeSetting">,
    input: {
        organizationId: string;
        orderId: string;
        orderEventId: string;
        stage: string;
        now: Date;
    },
): Promise<boolean> {
    const kind = orderNoticeKind(input.stage);
    if (!kind) return false;
    // A switched-off kind isn't queued; the handler asks again when it runs.
    const setting = orderNoticeSetting(kind);
    if (setting && !(await noticeOn(tx, input.organizationId, setting))) {
        return false;
    }
    await enqueueHeldCustomerNotice(
        tx,
        input.organizationId,
        {
            kind,
            eventKey: orderNoticeKey(input.orderEventId),
            orderId: input.orderId,
            orderEventId: input.orderEventId,
        },
        { now: input.now, ms: ORDER_NOTICE_DELAY_MS },
    );
    return true;
}

/** Tracking added after the handover: keyed to the edit's OrderEvent (U16). */
export function orderTrackingNoticeKey(orderEventId: string): string {
    return `order-tracking:${orderEventId}`;
}

/**
 * The courier's tracking added or changed after the handover (DEC-174 U16,
 * #1147): tell the customer once, keyed to the edit's OrderEvent. No Undo,
 * so not held.
 *
 * While the handover's own notice is still held nothing more is queued:
 * that one is read when it goes, so it carries the new tracking already.
 * Otherwise nothing is queued while the business has delivery updates off.
 * Returns whether a notice will carry it (queued now, or the held one).
 */
export async function enqueueOrderTrackingNotice(
    tx: Pick<Prisma.TransactionClient, "job" | "customerNoticeSetting">,
    input: { organizationId: string; orderId: string; orderEventId: string },
): Promise<boolean> {
    const handoverWaiting = await tx.job.count({
        where: {
            organizationId: input.organizationId,
            type: CUSTOMER_NOTIFY_TYPE,
            status: "PENDING",
            AND: [
                { payload: { path: ["kind"], equals: "ORDER_HANDED_OVER" } },
                { payload: { path: ["orderId"], equals: input.orderId } },
            ],
        },
    });
    if (handoverWaiting > 0) return true;
    if (!(await noticeOn(tx, input.organizationId, "ORDER_DELIVERY"))) {
        return false;
    }
    await enqueueCustomerNotice(tx, input.organizationId, {
        kind: "ORDER_TRACKING",
        eventKey: orderTrackingNoticeKey(input.orderEventId),
        orderId: input.orderId,
        orderEventId: input.orderEventId,
    });
    return true;
}

/**
 * A website order placed (UX-042): to pay on handover, when it is made; paid
 * online, once its payment holds. The customer hears it is in, in their
 * account thread and by email where the business's own provider sends.
 * Once per order (`orderPlacedNoticeKey`).
 */
export async function enqueueOrderPlacedNotice(
    tx: Tx,
    organizationId: string,
    orderId: string,
): Promise<void> {
    await enqueueCustomerNotice(tx, organizationId, {
        kind: "ORDER_PLACED",
        eventKey: orderPlacedNoticeKey(orderId),
        orderId,
    });
}

/** An order step undone (B6): {@link cancelHeldCustomerNotice} for it. */
export async function cancelOrderStepNotice(
    tx: Pick<Prisma.TransactionClient, "job" | "customerNotice">,
    organizationId: string,
    orderEventId: string,
): Promise<{ cancelled: boolean; told: boolean }> {
    return cancelHeldCustomerNotice(
        tx,
        organizationId,
        orderNoticeKey(orderEventId),
    );
}
