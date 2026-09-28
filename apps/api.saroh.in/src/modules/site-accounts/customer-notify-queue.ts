import type { Prisma } from "@saroh/database";

import type { NoticeKind } from "./notify-templates";
import { orderNoticeKind } from "./notify-templates";

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
 * How long an order step's notice waits before it goes (plan A14; B6's
 * Undo): long enough for Undo to take it back unsent.
 */
export const ORDER_NOTICE_DELAY_MS = 10_000;

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
 * An order moved to a step the customer is told about (Ready, handed to
 * the courier, out for delivery): queue its notice, held for
 * {@link ORDER_NOTICE_DELAY_MS} so an Undo can take it back. Any other
 * step queues nothing. Returns whether one was queued.
 */
export async function enqueueOrderStepNotice(
    tx: Tx,
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
    await enqueueCustomerNotice(
        tx,
        input.organizationId,
        {
            kind,
            eventKey: orderNoticeKey(input.orderEventId),
            orderId: input.orderId,
            orderEventId: input.orderEventId,
        },
        new Date(input.now.getTime() + ORDER_NOTICE_DELAY_MS),
    );
    return true;
}

/**
 * An order step undone (B6): take back its notice if it hasn't gone.
 * `told` says whether the customer had already been told — a thread
 * message or an email was written for it — which is when Undo says
 * "They've already been told".
 */
export async function cancelOrderStepNotice(
    tx: Pick<Prisma.TransactionClient, "job" | "customerNotice">,
    organizationId: string,
    orderEventId: string,
): Promise<{ cancelled: boolean; told: boolean }> {
    const eventKey = orderNoticeKey(orderEventId);
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
