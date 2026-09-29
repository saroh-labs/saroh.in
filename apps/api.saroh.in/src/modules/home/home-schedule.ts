import type { prisma } from "@saroh/database";

import type { HomeBooking } from "./home-model";
import { personName } from "./home-model";
import type { HomeNarrow } from "./home-staff";
import { diaryWhere } from "./home-staff";

/**
 * Home's schedule band: the next confirmed bookings, which Needs you's
 * "Next: 10:30 Cleaning" reads. (Its count of all still to come fed the
 * numbers band, removed with Home's other legacy fields: Z5.) Moved out
 * of `home.service.ts` by F11, which narrows it to a staff member's own
 * diary (`narrow.staff`) as it does Today.
 */

type Db = typeof prisma;

/** How far ahead the schedule band looks. */
export const UPCOMING_LIMIT = 8;

export interface HomeSchedule {
    upcoming: HomeBooking[];
}

export const NO_SCHEDULE: HomeSchedule = { upcoming: [] };

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
    const rows = await db.booking.findMany({
        where,
        orderBy: { startAt: "asc" },
        take: UPCOMING_LIMIT,
        include: { service: true, contact: true },
    });

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
    return { upcoming };
}
