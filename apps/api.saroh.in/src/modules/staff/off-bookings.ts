import { prisma } from "@saroh/database";

import type { Interval } from "../bookings/availability";
import { overlaps } from "../bookings/availability";
import { spanBounds } from "./off-range";

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
 * whole business's when `staffId` is null — narrowed to `within` when given.
 */
export async function upcomingBookings(
    organizationId: string,
    staffId: string | null,
    now: Date,
    within?: { from: Date; to: Date },
): Promise<BookingBrief[]> {
    const rows = await prisma.booking.findMany({
        where: {
            organizationId,
            ...(staffId ? { staffId } : {}),
            status: "CONFIRMED",
            endAt: {
                gt: within && within.from > now ? within.from : now,
            },
            ...(within ? { startAt: { lt: within.to } } : {}),
        },
        orderBy: { startAt: "asc" },
        take: MAX_LISTED * 5,
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
    const bounds = spanBounds(spans);
    if (!bounds) return [];
    const upcoming = await upcomingBookings(
        organizationId,
        staffId,
        now,
        bounds,
    );
    return upcoming
        .filter((b) => spans.some((s) => overlaps(b, s)))
        .slice(0, MAX_LISTED);
}
