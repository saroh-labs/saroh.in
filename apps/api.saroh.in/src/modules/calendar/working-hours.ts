import type { prisma } from "@saroh/database";

/**
 * Working hours on the calendar (plan 005 E27, R17): the stretches each
 * person on the team works on each day read, so the Week's hour grid can
 * shade the hours outside them. A person's weekly hours (`StaffHours`)
 * repeat on their weekday; one-off extra hours (`StaffExtraHours`) add to
 * their date. Time off and closures are not taken away here — the calendar
 * already sends them as days off, and the grid stripes those days itself.
 *
 * Hours are wall-clock minutes in the business's zone, as the slot engine
 * reads them (`bookings/availability.ts`), and the days are the window's
 * local dates. Whose hours they are goes, like time off's name, only to a
 * caller who reads bookings; anyone else gets the stretches alone, which
 * the booking page already shows as open times.
 *
 * Archived people take no bookings, and their hours are left out.
 */

type Db = Pick<typeof prisma, "staffHours" | "staffExtraHours">;

export interface WorkingHours {
    /** "YYYY-MM-DD", a day read, in the business's zone. */
    date: string;
    /** Minutes from local midnight; the end is exclusive. */
    startMinute: number;
    endMinute: number;
    /** `booking:read` only: whose hours they are. */
    staffId?: string;
}

interface Weekly {
    staffId: string;
    /** 0 = Sunday … 6 = Saturday. */
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
}

interface Extra {
    staffId: string;
    /** "YYYY-MM-DD". */
    date: string;
    startMinute: number;
    endMinute: number;
}

/** A local date's weekday, 0 = Sunday. */
function weekdayOf(date: string): number {
    return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/**
 * Each day's stretches, weekly then extra, in the order they start. Pure,
 * so the weekday arithmetic is tested without a database. A stretch that
 * does not run forwards is dropped rather than drawn.
 */
export function hoursOnDays(
    days: string[],
    weekly: Weekly[],
    extra: Extra[],
    named: boolean,
): WorkingHours[] {
    const out: WorkingHours[] = [];
    const push = (date: string, h: Weekly | Extra) => {
        if (h.endMinute <= h.startMinute) return;
        out.push({
            date,
            startMinute: Math.max(0, h.startMinute),
            endMinute: Math.min(24 * 60, h.endMinute),
            ...(named ? { staffId: h.staffId } : {}),
        });
    };
    for (const date of days) {
        const dow = weekdayOf(date);
        const today = [
            ...weekly.filter((h) => h.dayOfWeek === dow),
            ...extra.filter((h) => h.date === date),
        ].sort((a, b) => a.startMinute - b.startMinute);
        for (const h of today) push(date, h);
    }
    return out;
}

/** The team's working hours over `days`; `named`: say whose. */
export async function readWorkingHours(
    db: Db,
    organizationId: string,
    days: string[],
    named: boolean,
): Promise<WorkingHours[]> {
    const first = days[0];
    const last = days[days.length - 1];
    if (!first || !last) return [];
    const active = { organizationId, staff: { status: "ACTIVE" } };
    const [weekly, extra] = await Promise.all([
        db.staffHours.findMany({
            where: active,
            select: {
                staffId: true,
                dayOfWeek: true,
                startMinute: true,
                endMinute: true,
            },
        }),
        db.staffExtraHours.findMany({
            where: {
                ...active,
                date: {
                    gte: new Date(`${first}T00:00:00.000Z`),
                    lte: new Date(`${last}T00:00:00.000Z`),
                },
            },
            select: {
                staffId: true,
                date: true,
                startMinute: true,
                endMinute: true,
            },
        }),
    ]);
    return hoursOnDays(
        days,
        weekly,
        extra.map((e) => ({ ...e, date: e.date.toISOString().slice(0, 10) })),
        named,
    );
}
