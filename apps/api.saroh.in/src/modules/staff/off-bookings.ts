import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { Interval } from "../bookings/availability";
import { overlaps } from "../bookings/availability";

/** The most kept bookings a save lists; more than this is a different talk. */
export const MAX_LISTED = 200;

/** A booking named in a warning: enough to find it, nothing more. */
export interface BookingBrief {
    id: string;
    startAt: Date;
    endAt: Date;
    serviceId: string;
    serviceName: string;
    bookerName: string | null;
}

/**
 * Confirmed bookings still to come, soonest first — one person's, or the
 * whole business's when `staffId` is null — narrowed to those overlapping
 * any of `spans` when given (in the query, so a busy stretch outside the
 * spans can't crowd out the ones in them).
 */
export async function upcomingBookings(
    organizationId: string,
    staffId: string | null,
    now: Date,
    spans?: Interval[],
): Promise<BookingBrief[]> {
    const where: Prisma.BookingWhereInput = {
        organizationId,
        ...(staffId ? { staffId } : {}),
        status: "CONFIRMED",
        endAt: { gt: now },
        ...(spans
            ? {
                  OR: spans.map((s) => ({
                      startAt: { lt: s.endAt },
                      endAt: { gt: s.startAt },
                  })),
              }
            : {}),
    };
    const rows = await prisma.booking.findMany({
        where,
        orderBy: { startAt: "asc" },
        take: spans ? MAX_LISTED : MAX_LISTED * 5,
        select: {
            id: true,
            startAt: true,
            endAt: true,
            serviceId: true,
            bookerName: true,
            service: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true } },
        },
    });
    return rows.map((r) => {
        const contactName = [r.contact?.firstName, r.contact?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        return {
            id: r.id,
            startAt: r.startAt,
            endAt: r.endAt,
            serviceId: r.serviceId,
            serviceName: r.service.name,
            bookerName: contactName || r.bookerName,
        };
    });
}

/**
 * The confirmed bookings still to come that fall in any of `spans` — what
 * time off or a closure would cover (E3). They are kept; this only names
 * them, so the merchant can move or cancel each.
 */
export async function bookingsInSpans(
    organizationId: string,
    staffId: string | null,
    spans: Interval[],
    now: Date,
): Promise<BookingBrief[]> {
    if (spans.length === 0) return [];
    const inSpans = await upcomingBookings(organizationId, staffId, now, spans);
    // The query already narrowed them; kept as the rule it states.
    return inSpans.filter((b) => spans.some((s) => overlaps(b, s)));
}
