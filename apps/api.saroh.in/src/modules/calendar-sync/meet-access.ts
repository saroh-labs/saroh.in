import { prisma } from "@saroh/database";

import type { MeetAccess } from "./google/google-calendar.port";
import { MEET_ACCESS } from "./google/google-calendar.port";
import { queueCalendarSyncs } from "./queue-sync";

/** When nothing is chosen: only people invited join without knocking (KTD8). */
export const DEFAULT_MEET_ACCESS: MeetAccess = "RESTRICTED";

export const isMeetAccess = (v: unknown): v is MeetAccess =>
    typeof v === "string" && (MEET_ACCESS as readonly string[]).includes(v);

/** The business's own default (DEC-233). */
export async function businessMeetAccess(
    organizationId: string,
): Promise<MeetAccess> {
    const profile = await prisma.businessProfile.findUnique({
        where: { organizationId },
        select: { meetAccess: true },
    });
    return isMeetAccess(profile?.meetAccess)
        ? profile.meetAccess
        : DEFAULT_MEET_ACCESS;
}

/**
 * Who may join a booking's Meet without knocking (DEC-233): the booking's
 * choice, else its service's, else the business's.
 */
export async function meetAccessOf(
    organizationId: string,
    booking: {
        meetAccess: string | null;
        service: { meetAccess: string | null };
    },
): Promise<MeetAccess> {
    if (isMeetAccess(booking.meetAccess)) return booking.meetAccess;
    if (isMeetAccess(booking.service.meetAccess)) {
        return booking.service.meetAccess;
    }
    return businessMeetAccess(organizationId);
}

/**
 * A Meet access default changed (DEC-233): the upcoming bookings it
 * reaches are synced again, quietly, so their Meets follow. A service's:
 * its bookings with no choice of their own. The business's: every booking
 * whose service and itself have none.
 */
export async function resyncMeetAccess(
    organizationId: string,
    scope: { serviceId?: string } = {},
): Promise<number> {
    const rows = await prisma.googleCalendarEvent.findMany({
        where: {
            organizationId,
            meetUrl: { not: null },
            booking: {
                status: "CONFIRMED",
                endAt: { gt: new Date() },
                meetAccess: null,
                ...(scope.serviceId
                    ? { serviceId: scope.serviceId }
                    : { service: { meetAccess: null } }),
            },
        },
        select: { bookingId: true },
    });
    return queueCalendarSyncs(
        prisma,
        organizationId,
        rows.map((r) => r.bookingId),
        { quietUpdate: true },
    );
}
