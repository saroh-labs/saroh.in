import { DateTime } from "luxon";

import type { FieldRefusal } from "../bookings/booking-rules";
import { formatMinute, isCalendarDate } from "./hours";

/**
 * Time off and closures as the Availability screen asks for them (E3): a
 * range of the business's local dates, all day or the same hours on each
 * day. Pure, so the DST and range rules are testable without a database.
 *
 * An all-day range is one span, local midnight to the midnight after the
 * last day. A part-day range repeats its hours on every day it covers, so it
 * is one span per day — stored as one row per day and shown as one line.
 */

/** The longest range, in days, a single add may cover. */
export const MAX_RANGE_DAYS = 366;

export interface OffRange {
    /** The first local day, `YYYY-MM-DD`. */
    fromDate: string;
    /** The last local day, inclusive; the first when absent. */
    toDate?: string;
    /** Part of the day: minutes from local midnight. Both or neither. */
    startMinute?: number;
    endMinute?: number;
}

export interface OffSpan {
    startAt: Date;
    endAt: Date;
    allDay: boolean;
}

const DAY = 86_400_000;

function partOfDay(range: OffRange): boolean {
    return range.startMinute !== undefined || range.endMinute !== undefined;
}

/** Why the range cannot be, naming the field, or null. */
export function offRangeRefusal(range: OffRange): FieldRefusal | null {
    const toDate = range.toDate ?? range.fromDate;
    if (!isCalendarDate(range.fromDate)) {
        return { message: "That is not a date.", field: "fromDate" };
    }
    if (!isCalendarDate(toDate)) {
        return { message: "That is not a date.", field: "toDate" };
    }
    if (toDate < range.fromDate) {
        return {
            message: "The last day must be on or after the first.",
            field: "toDate",
        };
    }
    const days =
        (Date.parse(`${toDate}T00:00:00Z`) -
            Date.parse(`${range.fromDate}T00:00:00Z`)) /
            DAY +
        1;
    if (days > MAX_RANGE_DAYS) {
        return {
            message: "Time off can be at most a year at a time.",
            field: "toDate",
        };
    }
    if (partOfDay(range)) {
        const { startMinute, endMinute } = range;
        if (startMinute === undefined || endMinute === undefined) {
            return {
                message: "Give both the start and the end of the time off.",
                field: startMinute === undefined ? "startMinute" : "endMinute",
            };
        }
        if (
            !Number.isInteger(startMinute) ||
            !Number.isInteger(endMinute) ||
            startMinute < 0 ||
            endMinute > 1440
        ) {
            return {
                message: "The hours must be within the day.",
                field: "startMinute",
            };
        }
        if (endMinute <= startMinute) {
            return {
                message: `The end (${formatMinute(endMinute)}) must be after the start (${formatMinute(startMinute)}).`,
                field: "endMinute",
            };
        }
    }
    return null;
}

/** A local minute of a day as an instant; 1440 is the next midnight. */
function at(day: DateTime, minute: number): Date {
    const moment =
        minute >= 1440
            ? day.plus({ days: 1 }).startOf("day")
            : day.set({
                  hour: Math.floor(minute / 60),
                  minute: minute % 60,
                  second: 0,
                  millisecond: 0,
              });
    return moment.toUTC().toJSDate();
}

/**
 * The absolute spans a range covers in `zone`. Call only once
 * {@link offRangeRefusal} has passed.
 */
export function offSpans(range: OffRange, zone: string): OffSpan[] {
    const toDate = range.toDate ?? range.fromDate;
    const first = DateTime.fromISO(range.fromDate, { zone }).startOf("day");
    const last = DateTime.fromISO(toDate, { zone }).startOf("day");
    if (!partOfDay(range)) {
        return [
            {
                startAt: first.toUTC().toJSDate(),
                endAt: last.plus({ days: 1 }).startOf("day").toUTC().toJSDate(),
                allDay: true,
            },
        ];
    }
    const spans: OffSpan[] = [];
    for (let day = first; day <= last; day = day.plus({ days: 1 })) {
        const startAt = at(day, range.startMinute ?? 0);
        const endAt = at(day, range.endMinute ?? 1440);
        // A spring-forward gap can swallow a short range whole.
        if (endAt > startAt) spans.push({ startAt, endAt, allDay: false });
    }
    return spans;
}

/** The whole stretch the spans cover, for a read of what falls in it. */
export function spanBounds(
    spans: { startAt: Date; endAt: Date }[],
): { from: Date; to: Date } | null {
    if (spans.length === 0) return null;
    return {
        from: new Date(Math.min(...spans.map((s) => s.startAt.getTime()))),
        to: new Date(Math.max(...spans.map((s) => s.endAt.getTime()))),
    };
}
