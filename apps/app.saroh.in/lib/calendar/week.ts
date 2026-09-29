import type { CalendarRange, Edge } from "./range";
import { inRange, monthEdges } from "./range";

/**
 * The calendar's Week (plan 005 E25, R17), after the "Saroh Business
 * Calendar" design: Monday to Sunday, stepped a week at a time, with a
 * "This week" button and a title like "14–20 Sep 2026". One read covers
 * the week, even when it crosses into the next month (E20's `from`/`to`).
 * Pure, so the rules are tested without a browser.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const utc = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A real "YYYY-MM-DD" (not 2026-02-30), as an address may carry any. */
export function isDay(value: unknown): value is string {
    return (
        typeof value === "string" &&
        DATE.test(value) &&
        iso(utc(value)) === value
    );
}

/** A day `n` days on (or back, below zero). */
export function addDays(date: string, n: number): string {
    return iso(utc(date) + n * DAY_MS);
}

/** The Monday on or before a day. */
export function mondayOf(date: string): string {
    const dow = (new Date(utc(date)).getUTCDay() + 6) % 7;
    return addDays(date, -dow);
}

/** The week holding a day, Monday to Sunday, as the API is asked for it. */
export function weekSpan(day: string): { from: string; to: string } {
    const from = mondayOf(day);
    return { from, to: addDays(from, 6) };
}

/** The seven days from a Monday. */
export function weekDates(from: string): string[] {
    return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}

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
];

/**
 * The design's title: "14–20 Sep 2026"; across two months "28 Sep–4 Oct
 * 2026"; across two years "29 Dec 2025–4 Jan 2026".
 */
export function weekTitle(from: string): string {
    const to = addDays(from, 6);
    const [y0, m0, d0] = from.split("-").map(Number);
    const [y1, m1, d1] = to.split("-").map(Number);
    const start =
        y0 !== y1
            ? `${d0} ${MONTHS[m0 - 1]} ${y0}`
            : m0 !== m1
              ? `${d0} ${MONTHS[m0 - 1]}`
              : `${d0}`;
    return `${start}–${d1} ${MONTHS[m1 - 1]} ${y1}`;
}

/**
 * Where ‹ and › stop, and why, in the month's own words: the week before
 * holds nothing once the business had not joined yet, and the week after
 * lies past what can be planned.
 */
export function weekEdges(
    from: string,
    range: CalendarRange,
): { before: Edge | null; after: Edge | null } {
    const before =
        range.first !== null && addDays(from, -1) < range.first
            ? monthEdges(range.first.slice(0, 7), range).before
            : null;
    const after =
        addDays(from, 7) > range.last
            ? monthEdges(range.last.slice(0, 7), range).after
            : null;
    return { before, after };
}

/**
 * A day pulled in so its week touches the range: an address can ask for a
 * week wholly before the business joined, or past what can be planned.
 */
export function clampWeekDay(day: string, range: CalendarRange): string {
    const { from, to } = weekSpan(day);
    if (range.first !== null && to < range.first) return range.first;
    if (from > range.last) return range.last;
    return day;
}

/**
 * The day a week opens on: the one asked for, else today, else the first
 * of its days the calendar reaches.
 */
export function weekDay(
    asked: string | undefined,
    from: string,
    today: string,
    range: CalendarRange,
): string {
    const dates = weekDates(from);
    const ok = (d: string | undefined): d is string =>
        !!d && dates.includes(d) && inRange(d, range);
    if (ok(asked)) return asked;
    if (ok(today)) return today;
    return dates.find((d) => inRange(d, range)) ?? from;
}

/**
 * A week's address: `view=week`, the day picked (none for today, so
 * "This week" is plain) and the person the team filter picked (E24).
 */
export function weekHref({
    day,
    today,
    team,
}: {
    day: string;
    today: string;
    team?: string | null;
}): string {
    const q = new URLSearchParams({ view: "week" });
    if (day !== today) q.set("day", day);
    if (team) q.set("team", team);
    return `/calendar?${q.toString()}`;
}

/** Whether a week is the one today is in: "This week" has nowhere to go. */
export function isThisWeek(from: string, today: string): boolean {
    return from === mondayOf(today);
}
