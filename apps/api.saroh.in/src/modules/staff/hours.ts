import { DateTime } from "luxon";

import type { FieldRefusal } from "../bookings/booking-rules";

/**
 * The rules a person's hours must keep (U3), pure so the refusals are
 * exhaustively testable. Every refusal names the field it is about; the error
 * filter carries it to the form as `details.field`.
 */

export interface MinuteRange {
    startMinute: number;
    endMinute: number;
}

export interface WeeklyRange extends MinuteRange {
    dayOfWeek: number;
}

export const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;

/** 540 → "9:00", 1440 → "24:00". */
export function formatMinute(minute: number): string {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${h}:${m.toString().padStart(2, "0")}`;
}

function describe(range: MinuteRange): string {
    return `${formatMinute(range.startMinute)}–${formatMinute(range.endMinute)}`;
}

/** Why one range cannot be, or null. `label` names the day it is on. */
export function rangeRefusal(
    range: MinuteRange,
    label: string,
    field: string,
): FieldRefusal | null {
    const { startMinute, endMinute } = range;
    if (
        !Number.isInteger(startMinute) ||
        !Number.isInteger(endMinute) ||
        startMinute < 0 ||
        endMinute > 1440
    ) {
        return {
            message: `${label}: hours must be within the day.`,
            field,
        };
    }
    if (endMinute <= startMinute) {
        return {
            message: `${label}: the end (${formatMinute(endMinute)}) must be after the start (${formatMinute(startMinute)}).`,
            field,
        };
    }
    return null;
}

/** The first pair of ranges that overlap, or null. Touching is fine. */
export function firstOverlap<T extends MinuteRange>(
    ranges: T[],
): [T, T] | null {
    const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const next = sorted[i];
        if (next.startMinute < prev.endMinute) return [prev, next];
    }
    return null;
}

/**
 * Why a week of hours cannot be saved, or null: a day outside 0–6, a range
 * that ends before it starts or runs past the day, or two ranges on the same
 * day that overlap.
 */
export function weeklyHoursRefusal(
    hours: WeeklyRange[],
    field = "hours",
): FieldRefusal | null {
    for (const range of hours) {
        if (
            !Number.isInteger(range.dayOfWeek) ||
            range.dayOfWeek < 0 ||
            range.dayOfWeek > 6
        ) {
            return { message: "A day of the week must be 0–6.", field };
        }
        const refusal = rangeRefusal(range, DAY_NAMES[range.dayOfWeek], field);
        if (refusal) return refusal;
    }
    for (let day = 0; day < 7; day += 1) {
        const clash = firstOverlap(hours.filter((h) => h.dayOfWeek === day));
        if (clash) {
            return {
                message: `${DAY_NAMES[day]}'s hours overlap: ${describe(clash[0])} and ${describe(clash[1])}.`,
                field,
            };
        }
    }
    return null;
}

/** Minutes a week of hours adds up to — the screen's weekly total. */
export function weeklyMinutes(hours: MinuteRange[]): number {
    return hours.reduce((sum, h) => sum + (h.endMinute - h.startMinute), 0);
}

/** Whether a string is a real calendar date, `YYYY-MM-DD`. */
export function isCalendarDate(value: string): boolean {
    return (
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        DateTime.fromISO(value, { zone: "UTC" }).isValid
    );
}

/**
 * Whole days of time off, `from`–`to` inclusive, as the absolute instants
 * they start and end in the business's zone.
 */
export function wholeDays(
    fromDate: string,
    toDate: string,
    zone: string,
): { startAt: Date; endAt: Date } {
    const start = DateTime.fromISO(fromDate, { zone }).startOf("day");
    const end = DateTime.fromISO(toDate, { zone })
        .startOf("day")
        .plus({ days: 1 });
    return { startAt: start.toUTC().toJSDate(), endAt: end.toUTC().toJSDate() };
}
