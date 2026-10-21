import type { Prisma } from "@saroh/database";

import { BookingEventType } from "../../bookings/booking-event-type";
import type { CustomerNotifyPayload } from "../customer-notify-queue";
import type { NoticeSubject } from "./notice";
import {
    businessName,
    defineNotice,
    firstWord,
    noticeWhen,
    safeLink,
} from "./notice";

/**
 * A booking confirmed, moved or cancelled (round-2 A14, R15), or an unpaid
 * hold lapsed (#1137): the customer's own booking, told to them in the
 * business's voice.
 */

export type BookingNoticeKind =
    | "BOOKING_CONFIRMED"
    | "BOOKING_MOVED"
    | "BOOKING_CANCELLED"
    | "BOOKING_LAPSED";

export interface BookingNoticeVars {
    business: string;
    /** "Asha", or null when the booker gave no name. */
    firstName: string | null;
    service: string;
    /** The person it is with, when it has one. */
    staff: string | null;
    startAt: Date;
    /** Where a move took it from. */
    fromStartAt: Date | null;
    timeZone: string;
    /** The customer did it themselves, from their account or the site. */
    byCustomer: boolean;
    /**
     * Given to someone else (#1157): "now with Meera", and the time only
     * when it moved too (`fromStartAt` differs from `startAt`).
     */
    reassigned?: boolean;
    /**
     * Their bookings on the business's own site, where they can move or
     * cancel it, or for a lapsed hold the booking page to book again
     * (`notice-link.ts`); null or absent: the email has no link.
     */
    link?: string | null;
}

export interface BookingNotice {
    kind: BookingNoticeKind;
    booking: BookingNoticeVars;
}

type Tx = Prisma.TransactionClient;

export const bookingNotice = defineNotice<BookingNotice>({
    setting: null,
    load: (tx, organizationId, payload) =>
        loadBooking(tx, organizationId, payload),
    sentence: ({ kind, booking }) => bookingSentence(kind, booking),
    subject: ({ kind, booking: b }) => {
        switch (kind) {
            case "BOOKING_CONFIRMED":
                return `You're booked with ${b.business}`;
            case "BOOKING_MOVED":
                return b.reassigned && b.staff
                    ? `Your booking with ${b.business} is now with ${b.staff}`
                    : `Your booking with ${b.business} has moved`;
            case "BOOKING_CANCELLED":
                return `Your booking with ${b.business} is cancelled`;
            case "BOOKING_LAPSED":
                return `Your hold with ${b.business} has lapsed`;
        }
    },
    names: ({ booking }) => ({
        business: booking.business,
        firstName: booking.firstName,
    }),
    // A cancelled booking has nothing left to see, move or cancel; a
    // lapsed hold offers to book again.
    backLink: ({ kind, booking }) =>
        kind === "BOOKING_CANCELLED"
            ? null
            : {
                  lead:
                      kind === "BOOKING_LAPSED"
                          ? "Book again:"
                          : "See, move or cancel your booking:",
                  url: safeLink(booking.link),
              },
    withLink: (vars, link) =>
        vars.kind === "BOOKING_CANCELLED"
            ? vars
            : { ...vars, booking: { ...vars.booking, link } },
});

function bookingSentence(kind: BookingNoticeKind, b: BookingNoticeVars) {
    const when = noticeWhen(b.startAt, b.timeZone);
    const withWhom = b.staff ? ` with ${b.staff}` : "";
    switch (kind) {
        case "BOOKING_CONFIRMED":
            return `Your ${b.service}${withWhom} on ${when} is booked.`;
        case "BOOKING_MOVED": {
            if (b.reassigned && b.staff) return reassignedSentence(b, when);
            if (b.byCustomer) return `You moved your ${b.service} to ${when}.`;
            const was = b.fromStartAt
                ? ` It was ${noticeWhen(b.fromStartAt, b.timeZone)}.`
                : "";
            return `Your ${b.service}${withWhom} has moved to ${when}.${was}`;
        }
        case "BOOKING_CANCELLED":
            return b.byCustomer
                ? `You cancelled your ${b.service} on ${when}.`
                : `Your ${b.service} on ${when} has been cancelled.`;
        case "BOOKING_LAPSED":
            // An unpaid hold whose time ran out (#1137); the email adds
            // "Book again:" and the booking page.
            return `Your hold on ${b.service}, ${when} has lapsed because it wasn't paid.`;
    }
}

/**
 * "Your booking is now with Meera" (#1157): "Your Physio assessment on Tue
 * 20 Oct at 10:00 am is now with Meera Iyer.", or, moved too, "… is now
 * with Meera Iyer on Wed 21 Oct at 11:00 am. It was Tue 20 Oct at 10:00 am."
 */
function reassignedSentence(b: BookingNoticeVars, when: string): string {
    const moved =
        b.fromStartAt !== null &&
        b.fromStartAt.getTime() !== b.startAt.getTime();
    if (!moved) return `Your ${b.service} on ${when} is now with ${b.staff}.`;
    const was = b.fromStartAt
        ? ` It was ${noticeWhen(b.fromStartAt, b.timeZone)}.`
        : "";
    return `Your ${b.service} is now with ${b.staff} on ${when}.${was}`;
}

function isBookingKind(kind: string): kind is BookingNoticeKind {
    return (
        kind === "BOOKING_CONFIRMED" ||
        kind === "BOOKING_MOVED" ||
        kind === "BOOKING_CANCELLED" ||
        kind === "BOOKING_LAPSED"
    );
}

async function loadBooking(
    tx: Tx,
    organizationId: string,
    payload: CustomerNotifyPayload,
): Promise<NoticeSubject<BookingNotice> | null> {
    const kind = payload.kind;
    if (!isBookingKind(kind) || !payload.bookingId) return null;
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
            serviceId: true,
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
    // A lapse (#1137) is a released hold: cancelled, never confirmed.
    if (
        (kind === "BOOKING_CANCELLED" || kind === "BOOKING_LAPSED") &&
        booking.status !== "CANCELLED"
    ) {
        return null;
    }
    const event = payload.bookingEventId
        ? await tx.bookingEvent.findFirst({
              where: { id: payload.bookingEventId, bookingId: booking.id },
              select: {
                  type: true,
                  actorUserId: true,
                  fromStartAt: true,
                  toStartAt: true,
                  fromStaffId: true,
                  toStaff: { select: { name: true } },
              },
          })
        : null;
    // Given to someone else (#1157): who it is with now is the news, and
    // the time only when it moved too.
    const reassigned =
        kind === "BOOKING_MOVED" && event?.type === BookingEventType.Reassigned;
    const startAt =
        kind === "BOOKING_CANCELLED" || kind === "BOOKING_LAPSED"
            ? (event?.fromStartAt ?? booking.startAt)
            : kind === "BOOKING_MOVED"
              ? (event?.toStartAt ?? booking.startAt)
              : booking.startAt;
    return {
        contactId: booking.contactId,
        bookingId: booking.id,
        ...(kind === "BOOKING_LAPSED" ? { serviceId: booking.serviceId } : {}),
        vars: {
            kind,
            booking: {
                business: await businessName(tx, organizationId),
                firstName:
                    firstWord(booking.contact?.firstName) ??
                    firstWord(booking.bookerName),
                service: booking.service.name,
                staff: reassigned
                    ? (event.toStaff?.name ?? booking.staff?.name ?? null)
                    : (booking.staff?.name ?? null),
                startAt,
                fromStartAt:
                    kind === "BOOKING_MOVED"
                        ? (event?.fromStartAt ?? null)
                        : null,
                ...(reassigned ? { reassigned: true } : {}),
                timeZone: booking.timezone,
                byCustomer: event ? event.actorUserId === null : false,
            },
        },
    };
}
