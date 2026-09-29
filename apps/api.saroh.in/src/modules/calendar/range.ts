import { BadRequestException } from "@nestjs/common";
import { DateTime } from "luxon";

import type { MonthWindow } from "./month";

/**
 * Which days the calendar reads (plan 005 E20, R15): a `from`/`to` range of
 * local dates in the business's zone, both inclusive — a week crossing two
 * months is one read. (The `month` query the app before E20 sent was an
 * alias for one release; follow-up Z3 removed it.)
 *
 * A range reaches back to the first of the month the business joined Saroh
 * (nothing of it exists before) and forward to the end of the third month
 * from this one (as far as anyone plans). Wholly outside that it is refused with a
 * 400 naming the nearest month it reaches, so the app can open that month
 * instead of an error.
 */

/** Months ahead of this one a range may reach. */
export const MONTHS_AHEAD = 3;

/** The longest range one read may ask for: two months, give or take. */
export const MAX_RANGE_DAYS = 62;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the controller passes on: `from` with `to`. */
export interface CalendarQuery {
    from?: string;
    to?: string;
}

/** The span a query asks for, once it is known to be well formed. */
export interface CalendarSpan {
    from: string;
    to: string;
}

/** Why a range was refused, as `details.reason` says it. */
export type OutsideReason = "before_joined" | "too_far_ahead";

/** A real calendar date "YYYY-MM-DD" (not 2026-02-30). */
function isDate(value: string): boolean {
    return DATE.test(value) && DateTime.fromISO(value, { zone: "UTC" }).isValid;
}

/** Read the query into a span, or refuse it. */
export function spanOf(query: CalendarQuery): CalendarSpan {
    const { from, to } = query;
    if (from === undefined || to === undefined) {
        throw new BadRequestException("from and to are both needed.");
    }
    if (!isDate(from) || !isDate(to)) {
        throw new BadRequestException("from and to must be YYYY-MM-DD.");
    }
    if (to < from) {
        throw new BadRequestException("to must not be before from.");
    }
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
        throw new BadRequestException(
            `A range can be at most ${MAX_RANGE_DAYS} days.`,
        );
    }
    return { from, to };
}

function daysBetween(from: string, to: string): number {
    const a = DateTime.fromISO(from, { zone: "UTC" });
    const b = DateTime.fromISO(to, { zone: "UTC" });
    return Math.round(b.diff(a, "days").days);
}

/** The days `from`..`to` (inclusive) in a zone: their instants and dates. */
export function rangeWindow(
    from: string,
    to: string,
    zone: string,
): MonthWindow {
    const first = DateTime.fromISO(from, { zone }).startOf("day");
    const after = DateTime.fromISO(to, { zone }).startOf("day").plus({
        days: 1,
    });
    const days: string[] = [];
    for (let d = first; d < after; d = d.plus({ days: 1 })) {
        days.push(d.toFormat("yyyy-MM-dd"));
    }
    return { start: first.toJSDate(), end: after.toJSDate(), days };
}

/** The window a span covers in a zone. */
export function windowOf(span: CalendarSpan, zone: string): MonthWindow {
    return rangeWindow(span.from, span.to, zone);
}

/** The month a span is named by: the one `from` is in. */
export function monthOf(span: CalendarSpan): string {
    return span.from.slice(0, 7);
}

export interface Reach {
    /** The first day of the joined month; null when that is unknown. */
    first: string | null;
    /** The last day of the month {@link MONTHS_AHEAD} on from this one. */
    last: string;
}

/**
 * How far a range may reach, from the day the business joined (null when
 * it could not be read: no back edge) and today, both in its zone.
 */
export function reachOf(joinedAt: string | null, today: string): Reach {
    const last = DateTime.fromISO(today, { zone: "UTC" })
        .startOf("month")
        .plus({ months: MONTHS_AHEAD })
        .endOf("month")
        .toFormat("yyyy-MM-dd");
    return {
        first: joinedAt ? `${joinedAt.slice(0, 7)}-01` : null,
        last,
    };
}

/**
 * Refuse a range wholly before the joined month or wholly past the reach,
 * with the month to open instead: `details.month` and, by name,
 * `earliestMonth` or `latestMonth`. A range that crosses an edge — the
 * week holding the 1st of the joined month — is read whole: the days
 * before joining hold nothing, and the app mutes them.
 */
export function assertWithinReach(span: CalendarSpan, reach: Reach): void {
    if (reach.first !== null && span.to < reach.first) {
        const earliestMonth = reach.first.slice(0, 7);
        throw new BadRequestException({
            message: `The calendar starts in ${earliestMonth}, the month the business joined Saroh.`,
            details: {
                reason: "before_joined" satisfies OutsideReason,
                month: earliestMonth,
                earliestMonth,
            },
        });
    }
    if (span.from > reach.last) {
        const latestMonth = reach.last.slice(0, 7);
        throw new BadRequestException({
            message: `The calendar reaches ${MONTHS_AHEAD} months ahead, to ${latestMonth}.`,
            details: {
                reason: "too_far_ahead" satisfies OutsideReason,
                month: latestMonth,
                latestMonth,
            },
        });
    }
}
