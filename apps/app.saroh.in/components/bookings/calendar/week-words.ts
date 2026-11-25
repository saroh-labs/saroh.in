import { formatDay, formatWeekday } from "@/lib/format/datetime";

import { firstName } from "@/lib/names";
import type { LocalDate } from "@/lib/services/diary";

/**
 * What the week says (U5, BKMBookingsWeek and BKDCalendarWeek): a closed
 * day, how full a day is, and the one help line under it. Pure, so the
 * phone and the desk say the same thing.
 */

/** "Closed on Sundays" and why, or "Closed on Sun 25 Oct" for one date. */
export function closedWords(day: {
    date: LocalDate;
    closed: "weekly" | "day" | null;
}): { title: string; line: string } {
    const on = formatDay(day.date, { weekday: "short", year: "never" });
    return {
        title:
            day.closed === "weekly"
                ? `Closed on ${formatWeekday(day.date, "UTC")}s`
                : `Closed on ${on}`,
        line: `Nobody takes bookings on ${on}.`,
    };
}

/** How full, in words, for a screen reader: "about half full". */
export function fullWords(share: number): string {
    if (share >= 0.95) return "full";
    if (share <= 0.05) return "nothing booked yet";
    if (share < 0.35) return "a little booked";
    if (share < 0.65) return "about half full";
    return "mostly full";
}

/**
 * The line under the desk's week: the lanes by name on Everyone, what the
 * bar means, and what a click does (a role that only reads the calendar
 * has no free time to book). A phone has none (critique, 25 Nov).
 */
export function weekHelp({
    lanes,
    canBook,
}: {
    lanes: string[];
    canBook: boolean;
}): string {
    const each = lanes.length
        ? `Each day has a lane per person: ${lanes.map(firstName).join(", ")}. `
        : "";
    return `${each}The bar under each day shows how full it is. Click a day to open it${canBook ? ", a free time to book or block it" : ""}.`;
}
