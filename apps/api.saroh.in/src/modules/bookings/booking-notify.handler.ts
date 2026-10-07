import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { enqueueTeamAlert } from "../notifications/team-alerts";
import { bookingNoticeKey } from "../site-accounts/customer-notify-queue";
import { CustomerNotifyService } from "../site-accounts/customer-notify.handler";
import type { NoticeKind } from "../site-accounts/notify-templates";
import { teamNotice } from "../site-accounts/notify-templates";
import { BookingEventType } from "./booking-event-type";

/** The `type` this handler is registered under. */
export const BOOKING_NOTIFY_TYPE = "booking.notify";

/** The team inbox's notice types for what a customer did themselves. */
export const BOOKING_MOVED_NOTIFICATION_TYPE = "booking.moved";
export const BOOKING_CANCELLED_NOTIFICATION_TYPE = "booking.cancelled";
/** A booking the customer made themselves (F14's "New booking"). */
export const BOOKING_NEW_NOTIFICATION_TYPE = "booking.new";

/**
 * What a booking, a move, a cancel or a payment that confirms a hold
 * enqueues, on its own transaction. `eventId` is the BookingEvent it is
 * about; jobs enqueued before A14 carry none, and are read from the
 * booking's latest event.
 */
export interface BookingNotifyPayload {
    bookingId: string;
    serviceId?: string;
    contactId?: string | null;
    reason?: "booked" | "rescheduled" | "cancelled" | "confirmed";
    eventId?: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Consumer for `booking.notify` (round-2 A14), enqueued on every booking,
 * move and cancel since S4-002 and dead-lettered until now.
 *
 * On one transaction, in the business's RLS context:
 * - **The team** is told when the customer booked, moved or cancelled it
 *   themselves (on the site, or from their account): a `Notification` in
 *   the workspace inbox, once per event. It is what the account's
 *   "‹Business› has been told" stands on. F14 added the booking itself
 *   ("New booking") and the email to whoever chose it (`team.alert`).
 * - **The customer** is told through `customer.notify`'s service
 *   ({@link CustomerNotifyService}): their thread when it is live, and
 *   email to a verified account through the business's own provider.
 *
 * Idempotent per event: both sides claim a `CustomerNotice` row first.
 */
@Injectable()
export class BookingNotifyHandler {
    private readonly logger = new Logger(BookingNotifyHandler.name);

    constructor(private readonly notices: CustomerNotifyService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const payload = payloadOf(job.payload);
        if (!payload || !job.organizationId) {
            this.logger.warn(
                `${BOOKING_NOTIFY_TYPE} job ${job.id} names no booking; nothing to tell`,
            );
            return;
        }
        const organizationId = job.organizationId;
        await runInOrgContext(organizationId, () =>
            prisma.$transaction((tx) =>
                tellAboutBooking(tx, this.notices, {
                    organizationId,
                    jobId: job.id,
                    payload,
                    now: new Date(),
                }),
            ),
        );
    };
}

/** What a booking event is, as a customer notice. */
function noticeKind(
    eventType: string | null,
    reason: BookingNotifyPayload["reason"],
): Extract<
    NoticeKind,
    "BOOKING_CONFIRMED" | "BOOKING_MOVED" | "BOOKING_CANCELLED"
> {
    if (eventType === BookingEventType.Rescheduled) return "BOOKING_MOVED";
    if (eventType === BookingEventType.Cancelled) return "BOOKING_CANCELLED";
    if (eventType === BookingEventType.Booked) return "BOOKING_CONFIRMED";
    if (reason === "rescheduled") return "BOOKING_MOVED";
    if (reason === "cancelled") return "BOOKING_CANCELLED";
    return "BOOKING_CONFIRMED";
}

/** Tell the team (when the customer did it) and the customer. */
export async function tellAboutBooking(
    tx: Tx,
    notices: Pick<CustomerNotifyService, "notify">,
    input: {
        organizationId: string;
        jobId: string;
        payload: BookingNotifyPayload;
        now: Date;
    },
): Promise<void> {
    const { organizationId, payload } = input;
    const booking = await tx.booking.findFirst({
        where: { id: payload.bookingId, organizationId },
        select: {
            id: true,
            status: true,
            startAt: true,
            timezone: true,
            bookerName: true,
            service: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true } },
        },
    });
    if (!booking) return;

    const event = await tx.bookingEvent.findFirst({
        where: payload.eventId
            ? { id: payload.eventId, bookingId: booking.id }
            : { bookingId: booking.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
            id: true,
            type: true,
            actorUserId: true,
            fromStartAt: true,
            toStartAt: true,
        },
    });
    const kind = noticeKind(event?.type ?? null, payload.reason);
    const key = event?.id ?? `job:${input.jobId}`;

    // The customer's notice first: it takes the plan-meter lock when Saroh
    // emails it (DEC-086), and that lock comes before any row this
    // transaction writes, the team's notice included (`backend-jobs.md`).
    await notices.notify(
        tx,
        organizationId,
        {
            kind,
            eventKey: bookingNoticeKey(key),
            bookingId: booking.id,
            bookingEventId: event?.id ?? null,
        },
        input.now,
    );

    // The customer did it themselves: no team member behind the event. A
    // booking they made is the team's "New booking" (F14), as a move or a
    // cancel always was.
    if (event?.actorUserId === null) {
        await tellTeam(tx, organizationId, {
            key,
            kind,
            bookingId: booking.id,
            who: customerName(booking),
            service: booking.service.name,
            startAt:
                kind === "BOOKING_CANCELLED"
                    ? (event.fromStartAt ?? booking.startAt)
                    : (event.toStartAt ?? booking.startAt),
            fromStartAt: kind === "BOOKING_MOVED" ? event.fromStartAt : null,
            timeZone: booking.timezone,
        });
    }
}

/** "Asha Rao", the booker's name, or "A customer". */
function customerName(booking: {
    bookerName: string | null;
    contact: { firstName: string | null; lastName: string | null } | null;
}): string {
    const contact = [booking.contact?.firstName, booking.contact?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    // `||`, not `??`: an empty name falls through too.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return contact || booking.bookerName?.trim() || "A customer";
}

/** The team's inbox notice, once per event. */
async function tellTeam(
    tx: Tx,
    organizationId: string,
    input: {
        key: string;
        kind: "BOOKING_CONFIRMED" | "BOOKING_MOVED" | "BOOKING_CANCELLED";
        bookingId: string;
        who: string;
        service: string;
        startAt: Date;
        fromStartAt: Date | null;
        timeZone: string;
    },
): Promise<void> {
    const eventKey = `team:${bookingNoticeKey(input.key)}`;
    const claimed = await tx.customerNotice.createMany({
        data: [
            {
                organizationId,
                eventKey,
                kind: "TEAM_TOLD",
                bookingId: input.bookingId,
            },
        ],
        skipDuplicates: true,
    });
    if (claimed.count === 0) return;
    const words = teamNotice(input.kind, input.who, input);
    const notification = await tx.notification.create({
        data: {
            organizationId,
            type: TEAM_NOTICE_TYPE[input.kind],
            title: words.title,
            body: words.body,
        },
        select: { id: true },
    });
    await tx.customerNotice.update({
        where: { organizationId_eventKey: { organizationId, eventKey } },
        data: { notificationId: notification.id },
    });
    // The email to whoever chose it (F14) is its own job: telling the team
    // and telling the customer are two things.
    await enqueueTeamAlert(tx, organizationId, {
        event: "booking",
        notificationId: notification.id,
    });
}

const TEAM_NOTICE_TYPE = {
    BOOKING_CONFIRMED: BOOKING_NEW_NOTIFICATION_TYPE,
    BOOKING_MOVED: BOOKING_MOVED_NOTIFICATION_TYPE,
    BOOKING_CANCELLED: BOOKING_CANCELLED_NOTIFICATION_TYPE,
} as const;

function payloadOf(value: unknown): BookingNotifyPayload | null {
    if (typeof value !== "object" || value === null) return null;
    const p = value as Partial<BookingNotifyPayload>;
    return typeof p.bookingId === "string" && p.bookingId.length > 0
        ? (p as BookingNotifyPayload)
        : null;
}
