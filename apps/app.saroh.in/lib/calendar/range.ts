import { monthTitle, shiftMonth } from "./layers";
import type { LayerKey } from "./types";

/**
 * How far the Business Calendar reaches (plan 005 E21, R15): back to the day
 * the business joined Saroh — nothing of it exists before then — and forward
 * to the end of the third month from now, as far as anyone plans. The edges
 * say why they stop, and a day from today offers what can be made on it.
 * Pure, so the rules are tested without a browser.
 */

/** Months ahead of this one the calendar reaches. */
export const MONTHS_AHEAD = 3;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarRange {
    /** The joined day ("YYYY-MM-DD"); null when unknown — no back edge. */
    first: string | null;
    /** The last day of the month {@link MONTHS_AHEAD} on from this one. */
    last: string;
}

/** "2026-12" → "2026-12-31". */
function lastDayOf(month: string): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${month}-${String(d).padStart(2, "0")}`;
}

/** The days the calendar reaches, from what the API said and this month. */
export function calendarRange(
    joinedAt: string | null | undefined,
    thisMonth: string,
): CalendarRange {
    return {
        first: joinedAt && DATE.test(joinedAt) ? joinedAt : null,
        last: lastDayOf(shiftMonth(thisMonth, MONTHS_AHEAD)),
    };
}

/** Whether a day is one the calendar reaches. */
export function inRange(date: string, range: CalendarRange): boolean {
    return (range.first === null || date >= range.first) && date <= range.last;
}

/** A month pulled back inside the range: an address can ask for any. */
export function clampMonth(month: string, range: CalendarRange): string {
    const min = range.first?.slice(0, 7);
    const max = range.last.slice(0, 7);
    if (min && month < min) return min;
    if (month > max) return max;
    return month;
}

/** Why ‹ or › stops: a tooltip (the design's) and the words on the page. */
export interface Edge {
    title: string;
    note: string;
}

/** The edges a month sits on, each with why; null where it does not. */
export function monthEdges(
    month: string,
    range: CalendarRange,
): { before: Edge | null; after: Edge | null } {
    const min = range.first?.slice(0, 7);
    const joined = min ? monthTitle(min) : null;
    return {
        before:
            min && joined && month <= min
                ? {
                      title: `You joined Saroh in ${joined}, so there's nothing earlier`,
                      note: `Saroh has your data from ${joined}`,
                  }
                : null,
        after:
            month >= range.last.slice(0, 7)
                ? {
                      title: `You can plan up to ${MONTHS_AHEAD} months ahead`,
                      note: `You can plan up to ${MONTHS_AHEAD} months ahead`,
                  }
                : null,
    };
}

/** The day a month opens on: today when it holds it, else its first reached day. */
export function openingDay(
    dates: string[],
    today: string,
    range: CalendarRange,
): string | undefined {
    if (dates.includes(today)) return today;
    return dates.find((d) => inRange(d, range)) ?? dates[0];
}

export interface Shortcut {
    label: string;
    href: string;
}

/**
 * What a day from today offers to make on it: "New order" where the business
 * sells and this person may take one, "Book" where it takes bookings and
 * they may book — Bookings opening on that day. A past day, or one past the
 * range, offers nothing.
 */
export function dayShortcuts(
    date: string,
    {
        today,
        range,
        layers,
        can,
    }: {
        today: string;
        range: CalendarRange;
        /** The layers the API sent: a module on, and readable by this person. */
        layers: LayerKey[];
        can: { order: boolean; book: boolean };
    },
): Shortcut[] {
    if (date < today || !inRange(date, range)) return [];
    const out: Shortcut[] = [];
    if (can.order && layers.includes("orders")) {
        out.push({ label: "New order", href: "/commerce/orders/new" });
    }
    if (can.book && layers.includes("bookings")) {
        out.push({
            label: "Book",
            href: `/bookings?date=${encodeURIComponent(date)}`,
        });
    }
    return out;
}

/** The four reads any layer rests on; a role with none sees the locked card. */
export const LAYER_READS = [
    "order:read",
    "booking:read",
    "subscription:read",
    "invoice:read",
] as const;

/**
 * Whether this person's role reads no layer at all. Unknown actions (an older
 * response) are not a lock: the API decides what it sends.
 */
export function calendarLocked(actions: string[] | undefined): boolean {
    if (!actions) return false;
    return !LAYER_READS.some((a) => actions.includes(a));
}
