import type { LocalDate } from "@/lib/services/diary";
import {
    addDays,
    clock,
    dayLabel,
    localDateOf,
    localMinuteOf,
    minuteOnDay,
} from "@/lib/services/diary";

import type { Closure, StaffList, TimeOff } from "./types";

/**
 * Time off and closures on the Availability screen (E3), pure so the screen
 * and its tests agree. The API keeps a part-day range as one row per day;
 * the screen shows it as one line — "2 Nov – 6 Nov · 5 days · all day ·
 * business closed" — and removes it whole.
 */

/** One line of time off or closure, and the rows it stands for. */
export interface OffLine {
    ids: string[];
    rows: TimeOff[];
    fromDate: LocalDate;
    toDate: LocalDate;
    days: number;
    allDay: boolean;
    /** Minutes from local midnight on each day; null when all day. */
    startMinute: number | null;
    endMinute: number | null;
    reason: string | null;
    /** The whole business closed, not one person off. */
    closed: boolean;
}

function lastDateOf(row: TimeOff, timeZone: string): LocalDate {
    return localDateOf(new Date(Date.parse(row.endAt) - 1), timeZone);
}

function lineOf(row: TimeOff, timeZone: string, closed: boolean): OffLine {
    const fromDate = localDateOf(row.startAt, timeZone);
    const toDate = lastDateOf(row, timeZone);
    const days =
        Math.round(
            (Date.parse(`${toDate}T00:00:00Z`) -
                Date.parse(`${fromDate}T00:00:00Z`)) /
                86_400_000,
        ) + 1;
    return {
        ids: [row.id],
        rows: [row],
        fromDate,
        toDate,
        days,
        allDay: row.allDay,
        startMinute: row.allDay ? null : localMinuteOf(row.startAt, timeZone),
        endMinute: row.allDay
            ? null
            : minuteOnDay(row.endAt, fromDate, timeZone),
        reason: row.reason,
        closed,
    };
}

/**
 * Rows as lines, soonest first: an all-day row is its own line; part-day
 * rows on consecutive days with the same hours and reason are one.
 */
export function offLines(
    rows: readonly TimeOff[],
    timeZone: string,
    closed: boolean,
): OffLine[] {
    const sorted = [...rows].sort(
        (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
    );
    const lines: OffLine[] = [];
    for (const row of sorted) {
        const next = lineOf(row, timeZone, closed);
        const last = lines.at(-1);
        if (
            last &&
            !last.allDay &&
            !next.allDay &&
            next.days === 1 &&
            last.startMinute === next.startMinute &&
            last.endMinute === next.endMinute &&
            last.reason === next.reason &&
            addDays(last.toDate, 1) === next.fromDate
        ) {
            last.ids.push(row.id);
            last.rows.push(row);
            last.toDate = next.fromDate;
            last.days += 1;
        } else {
            lines.push(next);
        }
    }
    return lines;
}

/** "2 Nov" — the day without its weekday. */
function shortDate(date: LocalDate): string {
    return dayLabel(date).split(" ").slice(1).join(" ");
}

/** What a line says: when, how long, what part of the day, and whose. */
export function offLineLabel(
    line: Pick<
        OffLine,
        "fromDate" | "toDate" | "days" | "startMinute" | "endMinute" | "closed"
    >,
): string {
    const when =
        line.days > 1
            ? `${shortDate(line.fromDate)} – ${shortDate(line.toDate)} · ${line.days} days`
            : dayLabel(line.fromDate);
    const part =
        line.startMinute === null || line.endMinute === null
            ? "all day"
            : `${clock(line.startMinute)}–${clock(line.endMinute)}`;
    return `${when} · ${part}${line.closed ? " · business closed" : ""}`;
}

/** How many local days `from`–`to` covers, inclusive. */
export function dayCount(from: LocalDate, to: LocalDate): number {
    return (
        Math.round(
            (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
                86_400_000,
        ) + 1
    );
}

/** The add button's words, as the design has them. */
export function offButtonLabel(input: {
    days: number;
    closed: boolean;
    partOfDay: boolean;
}): string {
    if (input.closed) {
        return input.days > 1
            ? `Close for ${input.days} days`
            : "Close that day";
    }
    if (input.days > 1) return `Add ${input.days} days off`;
    return input.partOfDay ? "Add time off" : "Add day off";
}

/**
 * The line under the form: why it can't be added, the bookings already in
 * that time (kept — nothing is cancelled), or what closing means.
 */
export function offNote(input: {
    refusal: string | null;
    /** Bookings in the time, or null when they couldn't be checked. */
    taken: number | null;
    closed: boolean;
}): { text: string; tone: "danger" | "warn" | "muted" } {
    if (input.refusal) return { text: input.refusal, tone: "danger" };
    if (input.taken === null) {
        return {
            text: "Bookings then couldn't be checked.",
            tone: "muted",
        };
    }
    if (input.taken > 0) {
        return {
            text: `${input.taken} ${input.taken === 1 ? "booking falls" : "bookings fall"} in this time. They're kept — move or cancel them from the calendar.`,
            tone: "warn",
        };
    }
    return {
        text: input.closed
            ? "Nobody can be booked then, and the booking page and calendar show it as closed."
            : "Nothing booked then.",
        tone: "muted",
    };
}

/**
 * Staff with the business's closures as everyone's time off — so the
 * Bookings calendar offers no free time while the business is closed.
 */
export function withClosures(list: StaffList): StaffList {
    const closures: Closure[] = list.closures;
    if (closures.length === 0) return list;
    return {
        ...list,
        staff: list.staff.map((p) => ({
            ...p,
            timeOff: [...p.timeOff, ...closures],
        })),
    };
}
