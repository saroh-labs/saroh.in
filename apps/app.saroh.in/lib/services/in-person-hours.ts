import { clock } from "@/lib/services/diary";
import type { WeeklyRange } from "@/lib/staff/types";

/**
 * Opening hours on the Availability page (DEC-087): with a walk-in
 * storefront whose hours are set, in-person bookings are offered only while
 * it is open, so the part of a person's hours outside them isn't bookable in
 * person. The API sends the business's opening hours as weekly ranges (every
 * shop's together); these say which part of a day falls outside, and why.
 * Pure, so the page and its tests agree.
 */

type Range = Pick<WeeklyRange, "startMinute" | "endMinute">;

const DAY_NAMES = [
    "Sundays",
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
];

/** A day's opening ranges, overlaps and touching ranges merged. */
export function openOn(opening: readonly WeeklyRange[], day: number): Range[] {
    const sorted = opening
        .filter((r) => r.dayOfWeek === day)
        .sort((a, b) => a.startMinute - b.startMinute);
    const out: Range[] = [];
    for (const r of sorted) {
        const last = out.at(-1);
        if (last && r.startMinute <= last.endMinute) {
            last.endMinute = Math.max(last.endMinute, r.endMinute);
        } else {
            out.push({ startMinute: r.startMinute, endMinute: r.endMinute });
        }
    }
    return out;
}

/** The parts of a day's `ranges` that fall outside its opening hours. */
export function outsideOpening(
    ranges: readonly Range[],
    opening: readonly WeeklyRange[],
    day: number,
): Range[] {
    const open = openOn(opening, day);
    const out: Range[] = [];
    for (const range of ranges) {
        let from = range.startMinute;
        for (const o of open) {
            if (o.endMinute <= from || o.startMinute >= range.endMinute) {
                continue;
            }
            if (o.startMinute > from) {
                out.push({ startMinute: from, endMinute: o.startMinute });
            }
            from = Math.max(from, o.endMinute);
        }
        if (from < range.endMinute) {
            out.push({ startMinute: from, endMinute: range.endMinute });
        }
    }
    return out;
}

/** Whether a range falls wholly outside its day's opening hours. */
export function whollyOutside(
    range: Range,
    opening: readonly WeeklyRange[] | null,
    day: number,
): boolean {
    if (!opening) return false;
    const outside = outsideOpening([range], opening, day);
    return (
        outside.length === 1 &&
        outside[0].startMinute === range.startMinute &&
        outside[0].endMinute === range.endMinute
    );
}

const span = (r: Range) => `${clock(r.startMinute)}–${clock(r.endMinute)}`;

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
    return items.length < 2
        ? (items[0] ?? "")
        : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * What a day's row says about opening hours, or null when they cut
 * nothing: "08:00–09:00 isn't bookable in person — you're open
 * 09:00–18:00." A day the business is closed says so.
 */
export function openingNote(
    ranges: readonly Range[],
    opening: readonly WeeklyRange[] | null,
    day: number,
): string | null {
    if (!opening || ranges.length === 0) return null;
    const outside = outsideOpening(ranges, opening, day);
    if (outside.length === 0) return null;
    const open = openOn(opening, day);
    if (open.length === 0) {
        return `Not bookable in person — you're closed on ${DAY_NAMES[day]}.`;
    }
    const verb = outside.length === 1 ? "isn't" : "aren't";
    return `${list(outside.map(span))} ${verb} bookable in person — you're open ${list(open.map(span))}.`;
}
