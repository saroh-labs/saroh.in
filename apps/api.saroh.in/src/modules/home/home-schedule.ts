import type { prisma } from "@saroh/database";

import type { HomeBooking } from "./home-model";
import { personName } from "./home-model";
import type { HomeNarrow } from "./home-staff";
import { diaryWhere } from "./home-staff";

/**
 * Home's schedule band: the next confirmed bookings, which Needs you's
 * "Next: 10:30 Cleaning" reads, and how many are still to come. Moved out
 * of `home.service.ts` by F11, which narrows it to a staff member's own
 * diary (`narrow.staff`) as it does Today.
 */

type Db = typeof prisma;

/** How far ahead the schedule band looks. */
export const UPCOMING_LIMIT = 8;

export interface HomeSchedule {
    upcoming: HomeBooking[];
    /** Every confirmed booking from now on. */
    total: number;
}

export const NO_SCHEDULE: HomeSchedule = { upcoming: [], total: 0 };

/** The next confirmed bookings from now, each in the zone it was made in. */
export async function readSchedule(
    db: Db,
    organizationId: string,
    now: Date,
    narrow?: HomeNarrow,
): Promise<HomeSchedule> {
    const where = {
        organizationId,
        status: "CONFIRMED",
        startAt: { gte: now },
        ...diaryWhere(narrow?.staff),
    };
    const [rows, total] = await Promise.all([
        db.booking.findMany({
            where,
            orderBy: { startAt: "asc" },
            take: UPCOMING_LIMIT,
            include: { service: true, contact: true },
        }),
        db.booking.count({ where }),
    ]);

    const upcoming = rows.map((row) => ({
        id: row.id,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        timezone: row.timezone,
        serviceName: row.service.name,
        who:
            (row.contact ? personName(row.contact) : null) ??
            row.bookerName?.trim() ??
            row.bookerEmail?.trim() ??
            null,
        status: row.status,
        href: "/bookings",
    }));
    return { upcoming, total };
}
