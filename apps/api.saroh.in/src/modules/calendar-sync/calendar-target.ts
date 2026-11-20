import { prisma } from "@saroh/database";

import type { SealedConnection } from "./calendar-access";
import { SEALED_CONNECTION } from "./calendar-access";
import { businessPause, syncingMembers } from "./calendar-allowed";
import { grantedParts } from "./google/google-calendar.port";

/**
 * Where a person's bookings go in Google (DEC-233): the one "bookings go
 * to" calendar across their Google accounts, on a connected account that
 * lets Saroh add events, while they may sync (GC-03). Null when there is
 * none: they aren't connected, chose none, or are paused.
 */
export interface Target {
    connection: SealedConnection & { scopes: string[]; membershipId: string };
    calendarId: string;
}

export async function targetFor(
    organizationId: string,
    staffId: string,
    syncing: ReadonlySet<string>,
): Promise<Target | null> {
    const link = await prisma.googleCalendarLink.findFirst({
        where: {
            organizationId,
            writeTo: true,
            connection: {
                status: "CONNECTED",
                membership: { staffMember: { id: staffId } },
            },
        },
        select: {
            calendarId: true,
            connection: {
                select: {
                    ...SEALED_CONNECTION,
                    scopes: true,
                    membershipId: true,
                },
            },
        },
    });
    if (!link || !syncing.has(link.connection.membershipId)) return null;
    if (!grantedParts(link.connection.scopes).events) return null;
    return { connection: link.connection, calendarId: link.calendarId };
}

/**
 * Whether this person's bookings reach Google now: the flag and the plan
 * on, and {@link targetFor} finds their calendar. For the answers that
 * say so before a job runs (a reassign, Google Meet on a booking).
 */
export async function hasTarget(
    organizationId: string,
    staffId: string | null,
): Promise<boolean> {
    if (!staffId || (await businessPause(organizationId))) return false;
    const syncing = await syncingMembers(organizationId);
    return (await targetFor(organizationId, staffId, syncing)) !== null;
}

/** Everyone here on the diary whose bookings reach Google now, by staff id. */
export async function staffWithTargets(
    organizationId: string,
): Promise<Set<string>> {
    if (await businessPause(organizationId)) return new Set();
    const syncing = await syncingMembers(organizationId);
    const links = await prisma.googleCalendarLink.findMany({
        where: {
            organizationId,
            writeTo: true,
            connection: {
                status: "CONNECTED",
                membershipId: { in: [...syncing] },
            },
        },
        select: {
            connection: {
                select: {
                    scopes: true,
                    membership: {
                        select: { staffMember: { select: { id: true } } },
                    },
                },
            },
        },
    });
    return new Set(
        links
            .filter((l) => grantedParts(l.connection.scopes).events)
            .map((l) => l.connection.membership.staffMember?.id)
            .filter((id): id is string => !!id),
    );
}

/** What a reassign does in Google (DEC-233), said before the job runs. */
export interface ReassignCalendarNote {
    /**
     * MOVES: a new event on the new person's calendar (a new Meet link
     * where it has one; the customer gets Google's invitation, not a
     * cancellation). REMOVED: they haven't connected Google Calendar, so
     * the booking comes off Google and has no Meet link.
     */
    event: "MOVES" | "REMOVED";
    newMeetLink: boolean;
    /**
     * Its event now is on an account Saroh no longer reaches: that one
     * stays in Google as it was, no longer updated (DEC-233).
     */
    oldEventLeft: boolean;
    message: string;
}

/**
 * The note for handing a booking to `toStaffId`; null when Google has no
 * part in it (no event now and none to make).
 */
export async function reassignNote(
    organizationId: string,
    bookingId: string,
    to: { id: string; name: string },
): Promise<ReassignCalendarNote | null> {
    const [event, connected] = await Promise.all([
        prisma.googleCalendarEvent.findUnique({
            where: { bookingId },
            select: { meetUrl: true, connection: { select: { status: true } } },
        }),
        hasTarget(organizationId, to.id),
    ]);
    const oldEventLeft = !!event && event.connection.status !== "CONNECTED";
    const left = oldEventLeft
        ? " Its old event stays on a Google account Saroh no longer reaches, and isn't updated any more."
        : "";
    if (connected) {
        const meet = !!event?.meetUrl;
        return {
            event: "MOVES",
            newMeetLink: meet,
            oldEventLeft,
            message: `It goes on ${to.name}'s Google Calendar${meet ? " with a new Meet link" : ""}, and the customer gets Google's invitation.${left}`,
        };
    }
    if (!event) return null;
    if (oldEventLeft) {
        return {
            event: "REMOVED",
            newMeetLink: false,
            oldEventLeft,
            message: `${to.name} hasn't connected Google Calendar.${left}`,
        };
    }
    return {
        event: "REMOVED",
        newMeetLink: false,
        oldEventLeft,
        message: `${to.name} hasn't connected Google Calendar, so it comes off Google${event.meetUrl ? " and its Meet link stops being the booking's" : ""}.`,
    };
}

/**
 * Whether a booking is waiting for the Meet link its new person's Google
 * Calendar is making (DEC-233): it wants a Meet, whoever takes it now has
 * a calendar it goes to, and its event there has no link yet. A reassign's
 * notice waits on it, so the customer is told the new link, not the old.
 */
export async function meetLinkPending(
    organizationId: string,
    bookingId: string,
): Promise<boolean> {
    const b = await prisma.booking.findFirst({
        where: { id: bookingId, organizationId },
        select: {
            staffId: true,
            status: true,
            locationType: true,
            meetingLink: true,
            service: { select: { locationType: true, meetingLink: true } },
            googleCalendarEvent: {
                select: { meetUrl: true, connectionId: true },
            },
        },
    });
    if (b?.status !== "CONFIRMED" || !b.staffId) return false;
    const online = b.locationType
        ? b.locationType === "ONLINE"
        : b.service.locationType === "ONLINE";
    const wantsMeet = b.meetingLink
        ? b.meetingLink === "GOOGLE_MEET"
        : online && b.service.meetingLink === "GOOGLE_MEET";
    if (!wantsMeet || (await businessPause(organizationId))) return false;
    const target = await targetFor(
        organizationId,
        b.staffId,
        await syncingMembers(organizationId),
    );
    if (!target) return false;
    const event = b.googleCalendarEvent;
    return !event?.meetUrl || event.connectionId !== target.connection.id;
}
