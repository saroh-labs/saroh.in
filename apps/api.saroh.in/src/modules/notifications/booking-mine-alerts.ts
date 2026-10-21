import type { Prisma } from "@saroh/database";

import { noticeWhen } from "../site-accounts/notify-templates";
import { cleanBusinessName } from "../site-accounts/sender-name";
import { noticeOf } from "./notice-target";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * "Bookings with you" (DEC-174 D7, #1138): the person a booking is with
 * hears that it was made, moved or cancelled, in their own alerts and by
 * email, bell and email on by default.
 *
 * - **Who.** Only someone on the diary with a login
 *   (`StaffMember.membershipId`): there is no address for anyone else.
 *   Never the person who made the change (`booking.notify` doesn't queue
 *   it, `bookings/booking-mine.ts`).
 * - **The bell** is a personal notice (`userId`): nobody else sees it,
 *   owners included, and the business-wide `booking.*` notices stay as
 *   they are. A booking given to someone else (#1157) already put "now
 *   with you" and "now with Meera" in the two people's alerts on the
 *   reassigning write, so those are email only here.
 * - **The email** comes from Saroh in fixed words (DEC-011 amended): the
 *   service and the time, never the customer's name, which the bell keeps.
 *
 * Re-read when it runs: a person no longer on the diary for it, no longer
 * on the team, or a new or moved booking cancelled since, says nothing.
 */

type Tx = Prisma.TransactionClient;
type MinePayload = Extract<TeamAlertPayload, { event: "booking-mine" }>;

/** The personal notices' types (`notice-target.ts`). */
export const BOOKING_MINE_NEW_NOTIFICATION_TYPE = "booking.mine.new" as const;
export const BOOKING_MINE_MOVED_NOTIFICATION_TYPE =
    "booking.mine.moved" as const;
export const BOOKING_MINE_CANCELLED_NOTIFICATION_TYPE =
    "booking.mine.cancelled" as const;

const REASSIGNED = "REASSIGNED";

/** The alert, worded; null when it no longer stands. */
export async function wordBookingMine(
    tx: Tx,
    organizationId: string,
    p: MinePayload,
): Promise<WordedAlert | null> {
    const [booking, event] = await Promise.all([
        tx.booking.findFirst({
            where: { id: p.bookingId, organizationId },
            select: {
                id: true,
                status: true,
                startAt: true,
                timezone: true,
                staffId: true,
                bookerName: true,
                service: { select: { name: true } },
                contact: { select: { firstName: true, lastName: true } },
            },
        }),
        tx.bookingEvent.findFirst({
            where: { id: p.eventId, bookingId: p.bookingId, organizationId },
            select: {
                id: true,
                type: true,
                fromStartAt: true,
                toStartAt: true,
                fromStaffId: true,
                toStaffId: true,
                toStaff: { select: { name: true } },
            },
        }),
    ]);
    if (!booking || !event) return null;
    const reassigned = event.type === REASSIGNED;

    // The person this is about, as it stands now: the one it was given to
    // or taken from, for a reassignment; else whoever it is with.
    const staffId =
        p.change === "moved-away"
            ? event.fromStaffId
            : reassigned
              ? event.toStaffId
              : booking.staffId;
    if (!staffId) return null;
    const person = await tx.staffMember.findFirst({
        where: { id: staffId, organizationId },
        select: { membership: { select: { userId: true } } },
    });
    // Unlinked, someone else now, or off the team: nobody to tell.
    if (person?.membership?.userId !== p.userId) return null;
    // A new or moved booking cancelled since: its cancel tells them.
    if (p.change !== "cancelled" && booking.status === "CANCELLED") {
        return null;
    }

    const who = customerName(booking);
    const service = booking.service.name;
    const serviceMail = cleanBusinessName(service, "A booking");
    const zone = booking.timezone;
    const base = {
        event: "mine" as const,
        eventKey: `team:booking-mine:${event.id}:${p.userId}`,
        notificationId: null,
        path: `/bookings/${booking.id}`,
        skipUserId: null,
        forUserId: p.userId,
        cta: "Open the booking",
    };

    if (p.change === "cancelled") {
        const when = noticeWhen(event.fromStartAt ?? booking.startAt, zone);
        return {
            ...base,
            ...noticeOf(BOOKING_MINE_CANCELLED_NOTIFICATION_TYPE, {
                bookingId: booking.id,
            }),
            title: `${who}'s ${service} with you was cancelled`,
            body: `It was ${when}. It's off your diary.`,
            mail: {
                heading: "A booking with you was cancelled",
                body: `${serviceMail}, ${when}. It's off your diary.`,
            },
        };
    }

    if (p.change === "moved-away") {
        const when = noticeWhen(event.toStartAt ?? booking.startAt, zone);
        const to = cleanBusinessName(event.toStaff?.name ?? "", "someone else");
        return {
            ...base,
            // The reassigning write put it in their alerts (#1157).
            type: "booking.reassigned",
            noBell: true,
            title: `${who}'s ${service} is now with ${event.toStaff?.name ?? "someone else"}`,
            body: `${when}. It's off your diary.`,
            mail: {
                heading: "A booking was given to someone else",
                body: `${serviceMail}, ${when}, is now with ${to}. It's off your diary.`,
            },
        };
    }

    if (p.change === "moved") {
        const when = noticeWhen(event.toStartAt ?? booking.startAt, zone);
        const was = event.fromStartAt
            ? ` It was ${noticeWhen(event.fromStartAt, zone)}.`
            : "";
        return {
            ...base,
            ...noticeOf(BOOKING_MINE_MOVED_NOTIFICATION_TYPE, {
                bookingId: booking.id,
            }),
            title: `${who}'s ${service} with you was moved`,
            body: `Now ${when}.${was}`,
            mail: {
                heading: "A booking with you was moved",
                body: `${serviceMail}, now ${when}.${was}`,
            },
        };
    }

    const when = noticeWhen(event.toStartAt ?? booking.startAt, zone);
    return {
        ...base,
        ...(reassigned
            ? // "Now with you" is in their alerts already (#1157).
              { type: "booking.reassigned", noBell: true }
            : noticeOf(BOOKING_MINE_NEW_NOTIFICATION_TYPE, {
                  bookingId: booking.id,
              })),
        title: `${who} booked ${service} with you`,
        body: `${when}.`,
        mail: {
            heading: `A booking with you: ${serviceMail}`,
            body: `${serviceMail}, ${when}. Open it in Saroh to see who.`,
        },
    };
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
