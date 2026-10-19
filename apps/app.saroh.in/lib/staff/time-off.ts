import { formatDay } from "@/lib/format/datetime";
import { joinFacts } from "@/lib/format/join";
import { count } from "@/lib/format/plural";
import { firstName } from "@/lib/names";
import type { LocalDate } from "@/lib/services/diary";
import {
    addDays,
    localDateOf,
    localMinuteOf,
    minuteOnDay,
} from "@/lib/services/diary";

import { spanWords } from "./day-plan";
import type { Closure, StaffList, TimeOff } from "./types";

/**
 * Time off and closures on Hours and time off (E3; V2 in U17), pure so the
 * screen and its tests agree. The API keeps a part-day range as one row per
 * day; the screen shows it as one line — "Meera · 27 to 29 Oct", "Leave ·
 * all day · 3 days" — and removes it whole.
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

/** How many local days `from`–`to` covers, inclusive. */
export function dayCount(from: LocalDate, to: LocalDate): number {
    return (
        Math.round(
            (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
                86_400_000,
        ) + 1
    );
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

// — Hours and time off, V2 (U17) ————————————————————————————————————

/** A reason as written, or `none` when it is blank. */
function said(reason: string | null, none: string): string {
    const words = reason?.trim() ?? "";
    return words === "" ? none : words;
}

/** "Fri 30 Oct", "27 to 29 Oct", "30 Dec to 2 Jan": the days of a line. */
export function offDates(
    from: LocalDate,
    to: LocalDate,
    today?: LocalDate,
): string {
    if (from === to) {
        return formatDay(from, { weekday: "short", year: "auto", today });
    }
    const a = formatDay(from, { year: "auto", today });
    const b = formatDay(to, { year: "auto", today });
    // "27 Oct" and "29 Oct": the month once.
    const [aDay, aMonth, aYear] = a.split(" ");
    const [, bMonth, bYear] = b.split(" ");
    return aMonth === bMonth && aYear === bYear
        ? `${aDay} to ${b}`
        : `${a} to ${b}`;
}

/**
 * A line of time off in the Time off list: whose and when on top, why,
 * what part of the day and how long under it. A closure leads with its
 * reason ("Diwali") and says the whole business is closed.
 */
export function offRowWords(
    line: OffLine,
    who: string | null,
    today?: LocalDate,
): { title: string; sub: string } {
    const dates = offDates(line.fromDate, line.toDate, today);
    const part =
        line.startMinute === null || line.endMinute === null
            ? "all day"
            : spanWords(line.startMinute, line.endMinute);
    if (line.closed) {
        return {
            title: joinFacts(said(line.reason, "Closed"), dates),
            sub: joinFacts(
                "Whole business closed",
                line.startMinute === null ? null : part,
            ),
        };
    }
    return {
        title: joinFacts(who ? firstName(who) : null, dates),
        sub: joinFacts(
            said(line.reason, "Time off"),
            part,
            line.days > 1 ? count(line.days, "day") : null,
        ),
    };
}

/** The quick dates on Add time off. */
export type QuickWhen = "today" | "tomorrow" | "pick";

export function quickDates(
    when: Exclude<QuickWhen, "pick">,
    today: LocalDate,
): { from: LocalDate; to: LocalDate } {
    const day = when === "today" ? today : addDays(today, 1);
    return { from: day, to: day };
}

/** "3 days." under the dates; a closure also says nobody can be booked. */
export function offSpan(
    from: LocalDate,
    to: LocalDate,
    business: string | null,
): string {
    const days = dayCount(from, to);
    const span = days === 1 ? "One day." : `${count(days, "day")}.`;
    return business ? `${span} Nobody at ${business} can be booked.` : span;
}

/** How many bookings fall in the time, as the warning says it. */
export function clashWords(n: number): string {
    return `${count(n, "booking falls", "bookings fall")} in this time.`;
}

/** The toast once time off is added, and what it leaves booked. */
export function offAdded(affected: number): string {
    return affected
        ? `Time off added. ${count(affected, "booking in it stays", "bookings in it stay")} booked.`
        : "Time off added.";
}
