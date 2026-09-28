import type { prisma } from "@saroh/database";

import type { MonthWindow } from "./month";
import { dayOf } from "./month";
import type { WorkingHours } from "./working-hours";
import { readWorkingHours } from "./working-hours";

/**
 * Days off on the calendar (plan 005 E20, R16): the business closed (E3's
 * closures) and each person's time off, over the days read, and who is on
 * the team — what the day cells' "Closed" and "Dr. Pillai off", the team
 * filter and the hour grid draw from.
 *
 * A closure is public (the booking page shows the day closed), so every
 * calendar viewer sees it and its reason — the reason is for the team, and
 * everyone reading the calendar is on it. Who is off, and why, is the
 * diary's: the person and the reason go only to a caller who reads bookings
 * (`booking:read`); anyone else learns that someone is off, not who.
 *
 * Archived people take no bookings and are left out, with their time off.
 *
 * The read also carries the team's working hours on each day (E27,
 * `working-hours.ts`), which the Week's hour grid shades outside of.
 */

type Db = Pick<
    typeof prisma,
    | "businessClosure"
    | "staffTimeOff"
    | "staffMember"
    | "staffHours"
    | "staffExtraHours"
>;

export interface DayOff {
    kind: "closure" | "time_off";
    /** Absolute; a whole day starts at the business's local midnight. */
    startAt: string;
    /** Exclusive. */
    endAt: string;
    allDay: boolean;
    /** The days read that it touches ("YYYY-MM-DD", in the business's zone). */
    dates: string[];
    /** Time off, to a caller with `booking:read`: whose it is. */
    staffId?: string;
    name?: string;
    /** A closure's always; time off's to a caller with `booking:read`. */
    reason?: string | null;
}

/** One person on the team, as the team filter lists them. */
export interface CalendarStaff {
    id: string;
    name: string;
    title: string | null;
}

export interface DaysOffRead {
    daysOff: DayOff[];
    /** Whether anyone is on the team: the team filter shows only then. */
    hasStaff: boolean;
    /** `booking:read` only: the team, by name. */
    staff?: CalendarStaff[];
    /** The team's working hours on each day read (E27). */
    hours: WorkingHours[];
}

/** The days of `window` a stretch touches (its end is exclusive). */
export function datesTouched(
    startAt: Date,
    endAt: Date,
    window: MonthWindow,
    zone: string,
): string[] {
    if (endAt <= window.start || startAt >= window.end) return [];
    const first = dayOf(startAt, zone);
    // The last instant it holds; a stretch ending at midnight is the day
    // before's.
    const last = dayOf(
        new Date(Math.max(endAt.getTime() - 1, startAt.getTime())),
        zone,
    );
    return window.days.filter((d) => d >= first && d <= last);
}

/**
 * Closures and time off overlapping the window, and the team. `named`: the
 * caller reads bookings, so time off names its person and reason.
 */
export async function readDaysOff(
    db: Db,
    organizationId: string,
    window: MonthWindow,
    zone: string,
    named: boolean,
): Promise<DaysOffRead> {
    const overlaps = {
        startAt: { lt: window.end },
        endAt: { gt: window.start },
    };
    const [closures, timeOff, staff, hours] = await Promise.all([
        db.businessClosure.findMany({
            where: { organizationId, ...overlaps },
            orderBy: { startAt: "asc" },
            select: { startAt: true, endAt: true, allDay: true, reason: true },
        }),
        db.staffTimeOff.findMany({
            where: {
                organizationId,
                ...overlaps,
                staff: { status: "ACTIVE" },
            },
            orderBy: { startAt: "asc" },
            select: {
                startAt: true,
                endAt: true,
                allDay: true,
                reason: true,
                staff: { select: { id: true, name: true } },
            },
        }),
        db.staffMember.findMany({
            where: { organizationId, status: "ACTIVE" },
            orderBy: { name: "asc" },
            select: { id: true, name: true, title: true },
        }),
        readWorkingHours(db, organizationId, window.days, named),
    ]);

    const stretch = (r: { startAt: Date; endAt: Date; allDay: boolean }) => ({
        startAt: r.startAt.toISOString(),
        endAt: r.endAt.toISOString(),
        allDay: r.allDay,
        dates: datesTouched(r.startAt, r.endAt, window, zone),
    });

    const daysOff: DayOff[] = [
        ...closures.map((c): DayOff => ({
            kind: "closure",
            ...stretch(c),
            reason: c.reason,
        })),
        ...timeOff.map((t): DayOff => ({
            kind: "time_off",
            ...stretch(t),
            ...(named
                ? {
                      staffId: t.staff.id,
                      name: t.staff.name,
                      reason: t.reason,
                  }
                : {}),
        })),
    ].filter((d) => d.dates.length > 0);

    return {
        daysOff,
        hasStaff: staff.length > 0,
        ...(named ? { staff } : {}),
        hours,
    };
}
