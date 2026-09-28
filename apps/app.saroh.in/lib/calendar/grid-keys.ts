import { shiftMonth } from "./layers";
import type { CalendarRange } from "./range";
import { inRange } from "./range";

/**
 * The month grid from the keyboard (plan 005 E28, R18), after the "Saroh
 * Business Calendar" design: arrows move a day or a week, Home and End go to
 * the Monday and Sunday of the week, PageUp and PageDown a month. A move may
 * cross into the month before or after; it never leaves the days the
 * calendar reaches (E21's range). Pure, so the rules are tested without a
 * browser.
 */

/** The keys the grid answers; every other key is left to the page. */
export const GRID_KEYS = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
] as const;

export type GridKey = (typeof GRID_KEYS)[number];

export function isGridKey(key: string): key is GridKey {
    return (GRID_KEYS as readonly string[]).includes(key);
}

const STEP: Partial<Record<GridKey, number>> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
};

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

/** "2026-09-30" + 1 → "2026-10-01". */
export function addDays(date: string, by: number): string {
    return fromUtc(toUtc(date) + by * DAY_MS);
}

/** Monday 0 … Sunday 6. */
function weekday(date: string): number {
    return (new Date(toUtc(date)).getUTCDay() + 6) % 7;
}

/** The same day a month on or back, kept inside a shorter month (31 Jan → 28 Feb). */
export function addMonths(date: string, by: number): string {
    const month = shiftMonth(date.slice(0, 7), by);
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = Math.min(Number(date.slice(8)), last);
    return `${month}-${String(day).padStart(2, "0")}`;
}

/** A day pulled back inside the range. */
function clampDay(date: string, range: CalendarRange): string {
    if (range.first !== null && date < range.first) return range.first;
    if (date > range.last) return range.last;
    return date;
}

/**
 * Where a key moves the focused day, or null when it stays put. A day or a
 * week that would step past the joined day or the last plannable day stops
 * on that edge; a month key past the first or last month does nothing, and
 * one into the joined month lands no earlier than the joined day.
 */
export function gridKeyTarget(
    key: GridKey,
    from: string,
    range: CalendarRange,
): string | null {
    let to: string;
    const step = STEP[key];
    if (step !== undefined) {
        to = addDays(from, step);
    } else if (key === "Home") {
        to = addDays(from, -weekday(from));
    } else if (key === "End") {
        to = addDays(from, 6 - weekday(from));
    } else {
        to = addMonths(from, key === "PageUp" ? -1 : 1);
        const month = to.slice(0, 7);
        const firstMonth = range.first?.slice(0, 7);
        if (firstMonth && month < firstMonth) return null;
        if (month > range.last.slice(0, 7)) return null;
    }
    to = clampDay(to, range);
    return to === from || !inRange(to, range) ? null : to;
}

/**
 * The day a month opens on when the address names one (`?day=`, set when a
 * key crossed into this month): that day when this month holds it and the
 * calendar reaches it, else null — the usual opening day then applies.
 */
export function askedDay(
    asked: string | null | undefined,
    dates: string[],
    range: CalendarRange,
): string | null {
    if (!asked || !dates.includes(asked) || !inRange(asked, range)) {
        return null;
    }
    return asked;
}
