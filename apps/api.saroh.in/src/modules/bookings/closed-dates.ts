import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type { Interval } from "./availability";
import { loadClosures } from "./staff-availability";

/**
 * The days a business is closed (E3), for the public open-or-closed line.
 *
 * ONE copy, read by both places that draw the line: the hero's (the public
 * today read, G18) and Visit us's (the public visit read, G8). Two copies
 * could disagree, and a visitor would read "Closed" in the hero and "Open
 * now" in the card below it on the same closure day (review G-2).
 */

/** How far ahead a closure can move "Closed · opens …": a week and a day. */
export const CLOSED_LOOKAHEAD_DAYS = 8;

/**
 * One day of the business's week, as the public reads return it. Written
 * out here rather than imported from `sites/public-visit.service.ts`, which
 * imports this file.
 */
export interface OpeningDay {
    day: string;
    open: string;
    close: string;
    closed: boolean;
}

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

/**
 * The business's closures over the window {@link closedDates} looks at, from
 * the start of today in its zone.
 */
export function closuresAhead(
    db: Pick<Prisma.TransactionClient, "businessClosure">,
    organizationId: string,
    zone: string,
    now: Date,
): Promise<Interval[]> {
    const start = DateTime.fromJSDate(now, { zone }).startOf("day");
    return loadClosures(
        db,
        organizationId,
        start.toJSDate(),
        start.plus({ days: CLOSED_LOOKAHEAD_DAYS }).toJSDate(),
    );
}

/**
 * The days from today on which a closure covers the WHOLE of the business's
 * hours (E3), in its zone. A closure of an afternoon leaves the day open:
 * the line says when the door opens, and the booking page already takes
 * those hours out of its times.
 */
export function closedDates(
    week: readonly OpeningDay[] | null,
    closures: readonly Interval[],
    zone: string,
    now: Date,
    days: number = CLOSED_LOOKAHEAD_DAYS,
): string[] {
    if (!week || closures.length === 0) return [];
    const first = DateTime.fromJSDate(now, { zone }).startOf("day");
    const out: string[] = [];
    // Yesterday too: its overnight hours may still be running.
    for (let i = -1; i < days; i += 1) {
        const day = first.plus({ days: i });
        const entry = week.find((d) => d.day === WEEKDAYS[day.weekday - 1]);
        if (!entry || entry.closed) continue;
        const at = (clock: string) => {
            const [h = 0, m = 0] = clock.split(":").map(Number);
            return day.set({ hour: h, minute: m });
        };
        const open = at(entry.open);
        let close = at(entry.close);
        if (close <= open) close = close.plus({ days: 1 });
        const from = open.toMillis();
        const to = close.toMillis();
        const shut = closures.some(
            (c) => c.startAt.getTime() <= from && c.endAt.getTime() >= to,
        );
        if (shut) out.push(day.toISODate() ?? "");
    }
    return out.filter(Boolean);
}
