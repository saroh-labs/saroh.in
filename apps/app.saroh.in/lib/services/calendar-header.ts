import { formatDay } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type { CalendarLayout } from "./calendar-href";
import type { LocalDate } from "./diary";
import { addDays, monthDays, weekStartOf } from "./diary";

/**
 * The words of the calendar's header C (U2, #1018): the date title, the one
 * summary line, and the date sheet's week strip and month. Pure, so the
 * phone sheets and the desk popovers say the same thing.
 */

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
] as const;
const MONTHS_LONG = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
] as const;

const monthOf = (d: LocalDate) => MONTHS[Number(d.slice(5, 7)) - 1] ?? "";
const dayNumber = (d: LocalDate) => Number(d.slice(8, 10));

/**
 * "19–25 Oct", or "26 Oct–1 Nov" across a month, with the years across
 * one; `sep` " to " writes "19 to 25 Oct", as a sentence does.
 */
export function dayRange(
    from: LocalDate,
    to: LocalDate,
    sep: "–" | " to " = "–",
): string {
    if (from.slice(0, 4) !== to.slice(0, 4)) {
        return `${dayNumber(from)} ${monthOf(from)} ${from.slice(0, 4)}${sep}${dayNumber(to)} ${monthOf(to)} ${to.slice(0, 4)}`;
    }
    if (from.slice(0, 7) === to.slice(0, 7)) {
        return `${dayNumber(from)}${sep}${dayNumber(to)} ${monthOf(to)}`;
    }
    return `${dayNumber(from)} ${monthOf(from)}${sep}${dayNumber(to)} ${monthOf(to)}`;
}

/** The date sheet's week: "This week · 19 to 25 Oct", "26 Oct to 1 Nov". */
export function weekStripLabel(weekStart: LocalDate, today: LocalDate): string {
    const range = dayRange(weekStart, addDays(weekStart, 6), " to ");
    const thisWeek = weekStartOf(today);
    if (weekStart === thisWeek) return `This week · ${range}`;
    if (weekStart === addDays(thisWeek, 7)) return `Next week · ${range}`;
    if (weekStart === addDays(thisWeek, -7)) return `Last week · ${range}`;
    return range;
}

/** "Mon 19 Oct", with the year only when it isn't this one. */
const dayWords = (date: LocalDate, today: LocalDate) =>
    formatDay(date, { weekday: "short", today });

/**
 * The date title: "Today, Mon 19 Oct", "Tomorrow, Tue 20 Oct" or "Wed 21
 * Oct" for a day or the list; "This week, 19–25 Oct", "Next week, …",
 * "Last week, …" or the range alone for a week.
 */
export function headerTitle(
    layout: CalendarLayout,
    date: LocalDate,
    today: LocalDate,
): string {
    if (layout === "week") {
        const start = weekStartOf(date);
        const range = dayRange(start, addDays(start, 6));
        const thisWeek = weekStartOf(today);
        const word =
            start === thisWeek
                ? "This week"
                : start === addDays(thisWeek, 7)
                  ? "Next week"
                  : start === addDays(thisWeek, -7)
                    ? "Last week"
                    : null;
        return word ? `${word}, ${range}` : range;
    }
    const words = dayWords(date, today);
    if (date === today) return `Today, ${words}`;
    if (date === addDays(today, 1)) return `Tomorrow, ${words}`;
    return words;
}

/** The view's own name in a sentence: "today", "this week", "Tue 20 Oct". */
export function periodWord(
    layout: CalendarLayout,
    date: LocalDate,
    today: LocalDate,
): string {
    if (layout === "week") {
        return weekStartOf(date) === weekStartOf(today)
            ? "this week"
            : `the week of ${dayRange(weekStartOf(date), addDays(weekStartOf(date), 6))}`;
    }
    return date === today ? "today" : `on ${dayWords(date, today)}`;
}

/**
 * The one summary line: "5 booked · 3 free times · ₹2,400 booked". The
 * free times only when the hours are known; the money only for someone who
 * may see it (the read leaves prices out otherwise); what is cancelled
 * only while it is drawn.
 */
export function summaryLine({
    booked,
    free,
    money,
    cancelledShown,
}: {
    booked: number;
    /** Free times on the view; null when the hours could not be read. */
    free: number | null;
    /** "₹2,400", or null without the money permission or nothing priced. */
    money: string | null;
    /** How many cancelled bookings are drawn; 0 when they are hidden. */
    cancelledShown: number;
}): string {
    const parts = [
        booked > 0 ? `${formatNumber(booked)} booked` : "Nothing booked",
    ];
    if (free !== null) parts.push(count(free, "free time"));
    if (money && booked > 0) parts.push(`${money} booked`);
    if (cancelledShown > 0)
        parts.push(`${formatNumber(cancelledShown)} cancelled shown`);
    return parts.join(" · ");
}

/**
 * The cancelled switch's line in the "…" sheet: "1 cancelled today",
 * "None cancelled this week".
 */
export function cancelledLine(n: number, period: string): string {
    return n > 0
        ? `${formatNumber(n)} cancelled ${period}`
        : `None cancelled ${period}`;
}

/** How many dots a day of the month wears: none, then one to three. */
export function dotsFor(n: number): number {
    if (n <= 0) return 0;
    if (n <= 2) return 1;
    if (n <= 5) return 2;
    return 3;
}

/** "October 2026". */
export function monthTitle(month: string): string {
    return `${MONTHS_LONG[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;
}

/** The month a step away: "2026-10" → "2026-11". */
export function addMonths(month: string, by: number): string {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7)) - 1 + by;
    const year = y + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    return `${year}-${String(mm + 1).padStart(2, "0")}`;
}

/** What a day of the date sheet knows about itself. */
export interface DayFacts {
    /** Live bookings that day, or null when it is outside what was read. */
    count: number | null;
    /** Nobody works that day (and the hours are known). */
    closed: boolean;
}

/** One cell of the date sheet's month or week. */
export interface DayCell {
    date: LocalDate;
    day: number;
    /** "Mon". */
    weekday: string;
    today: boolean;
    picked: boolean;
    past: boolean;
    closed: boolean;
    count: number | null;
    dots: number;
    /** "Thu 22 Oct, 3 bookings" / "…, closed". */
    label: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function cellOf(
    date: LocalDate,
    index: number,
    picked: LocalDate,
    today: LocalDate,
    facts: (d: LocalDate) => DayFacts,
): DayCell {
    const f = facts(date);
    const weekday = WEEKDAYS[index % 7] ?? "";
    const words = `${weekday} ${dayNumber(date)} ${monthOf(date)}`;
    return {
        date,
        day: dayNumber(date),
        weekday,
        today: date === today,
        picked: date === picked,
        past: date < today,
        closed: f.closed,
        count: f.count,
        dots: f.closed ? 0 : dotsFor(f.count ?? 0),
        label: f.closed
            ? `${words}, closed`
            : f.count === null
              ? words
              : `${words}, ${count(f.count, "booking")}`,
    };
}

/** The seven days of a week, Monday first. */
export function weekCells(
    weekStart: LocalDate,
    picked: LocalDate,
    today: LocalDate,
    facts: (d: LocalDate) => DayFacts,
): DayCell[] {
    return Array.from({ length: 7 }, (_, i) =>
        cellOf(addDays(weekStart, i), i, picked, today, facts),
    );
}

/** A month on a Monday grid: how many blanks lead it, then its days. */
export function monthCells(
    month: string,
    picked: LocalDate,
    today: LocalDate,
    facts: (d: LocalDate) => DayFacts,
): { lead: number; days: DayCell[] } {
    const { days, lead } = monthDays(`${month}-01`);
    return {
        lead,
        days: days.map((d, i) => cellOf(d, lead + i, picked, today, facts)),
    };
}
