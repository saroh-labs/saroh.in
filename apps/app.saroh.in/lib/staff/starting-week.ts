import { formatClockRange } from "@/lib/format/datetime";
import { openOn } from "@/lib/services/in-person-hours";
import { DEFAULT_WEEK } from "@/lib/stores/default-week";
import type { Weekday } from "@/lib/stores/storefronts";

import type { WeeklyRange } from "./types";

/**
 * The week someone starts with on the diary, and a week said in words.
 * Nobody starts with an empty week: a new person, or the owner pressing
 * "It's just me", gets the business's opening hours as their weekly hours,
 * or the Hours sheet's starting week when none are saved. Pure, so the
 * Server Actions, the screen and their tests agree.
 */

const DAY_OF_WEEK: Record<Weekday, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
};

/** "09:30" as minutes from midnight. */
function minuteOf(clock: string): number {
    const [h = "0", m = "0"] = clock.split(":");
    return Number(h) * 60 + Number(m);
}

/** The Hours sheet's starting week (`DEFAULT_WEEK`) as weekly ranges. */
export function defaultWeek(): WeeklyRange[] {
    return DEFAULT_WEEK.filter((d) => !d.closed).map((d) => ({
        dayOfWeek: DAY_OF_WEEK[d.day],
        startMinute: minuteOf(d.open),
        endMinute: minuteOf(d.close),
    }));
}

/** Monday first, as every week on screen is listed. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** A week's ranges with each day's overlaps joined, Monday first. */
export function tidyWeek(hours: readonly WeeklyRange[]): WeeklyRange[] {
    return ORDER.flatMap((dayOfWeek) =>
        openOn(hours, dayOfWeek).map((r) => ({ dayOfWeek, ...r })),
    );
}

/** Whether the business has opening hours that open on some day. */
export function hasOpening(
    opening: readonly WeeklyRange[] | null | undefined,
): opening is readonly WeeklyRange[] {
    return Boolean(opening && opening.length > 0);
}

/**
 * The week a person starts with: the opening hours (every location's
 * together, overlaps joined, so the API takes them), or the default week
 * when the business has none saved or is closed every day.
 */
export function startingWeek(
    opening: readonly WeeklyRange[] | null | undefined,
): WeeklyRange[] {
    return hasOpening(opening) ? tidyWeek(opening) : defaultWeek();
}

/** One day's starting hours, for a day switched on in the weekly editor. */
export function startingDay(
    opening: readonly WeeklyRange[] | null | undefined,
    day: number,
): WeeklyRange[] {
    const own = startingWeek(opening).filter((r) => r.dayOfWeek === day);
    if (own.length > 0) return own;
    // A day the business is closed still opens on the usual hours.
    const usual = defaultWeek().at(0);
    return usual ? [{ ...usual, dayOfWeek: day }] : [];
}

const DAY_NAME = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

/** One line of a week in words: the days, and their hours or null for none. */
export interface WeekLine {
    days: string;
    /** "9:00 am to 5:00 pm", or two ranges joined; null when not bookable. */
    hours: string | null;
}

/**
 * A week in words, Monday first, neighbouring days with the same hours
 * together: "Monday to Friday", "9:00 am to 5:00 pm"; "Saturday and
 * Sunday", nothing.
 */
export function weekLines(hours: readonly WeeklyRange[]): WeekLine[] {
    const runs: { from: number; to: number; hours: string | null }[] = [];
    ORDER.forEach((day, i) => {
        const ranges = openOn(hours, day);
        const said = ranges.length
            ? ranges
                  .map((r) => formatClockRange(r.startMinute, r.endMinute))
                  .join(" and ")
            : null;
        const last = runs.at(-1);
        if (last?.hours === said) last.to = i;
        else runs.push({ from: i, to: i, hours: said });
    });
    return runs.map(({ from, to, hours: said }) => {
        const a = DAY_NAME[ORDER[from] ?? 1] ?? "";
        const b = DAY_NAME[ORDER[to] ?? 1] ?? "";
        return {
            days:
                from === to
                    ? a
                    : to === from + 1
                      ? `${a} and ${b}`
                      : `${a} to ${b}`,
            hours: said,
        };
    });
}
