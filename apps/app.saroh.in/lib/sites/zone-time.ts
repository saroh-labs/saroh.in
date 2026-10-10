import {
    formatDate,
    formatTime,
    formatWeekday,
    localDateKey,
    zoneParts,
} from "@/lib/format/datetime";

/**
 * Times as the site editor says them, in the business's time zone (DEC-071,
 * T11): when a test release goes live, was made or was last opened. Never
 * the browser's zone: a schedule happens where the business keeps time. The
 * words for a day and a time are `lib/format/datetime.ts`'s.
 */

function dayDiff(a: string, b: string): number {
    return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/**
 * When something happens or happened, in the business's zone: "today,
 * 6:00 pm", "tomorrow, 6:00 pm", "Fri 6:00 pm" within the week ahead, and
 * "Fri 3 Oct, 6:00 pm" further off or in the past.
 */
export function whenIn(
    at: Date | string,
    zone: string,
    now: Date = new Date(),
): string {
    const date = new Date(at);
    const clock = formatTime(date, zone);
    const diff = dayDiff(localDateKey(date, zone), localDateKey(now, zone));
    if (diff >= -1 && diff <= 1) {
        return `${formatDate(date, zone, { now, relative: "lower" })}, ${clock}`;
    }
    if (diff > 1 && diff < 7) {
        return `${formatWeekday(date, zone, "short")} ${clock}`;
    }
    return `${formatDate(date, zone, { now, weekday: "short" })}, ${clock}`;
}

/** The zone as people read it: "Asia/Kolkata" → "Kolkata time". */
export function zoneName(zone: string): string {
    const city = zone.split("/").pop() ?? zone;
    return `${city.replace(/_/g, " ")} time`;
}

/**
 * "18:00" in the zone, rounded up to the next half hour, for a default: the
 * value a time field holds, not words anyone reads.
 */
export function nextSlot(
    now: Date,
    zone: string,
    aheadMinutes = 60,
): { date: string; time: string } {
    const at = new Date(now.getTime() + aheadMinutes * 60_000);
    const { hour, minute } = zoneParts(at, zone);
    const total = hour * 60 + minute;
    const rounded = Math.ceil(total / 30) * 30;
    if (rounded >= 24 * 60) {
        const tomorrow = new Date(at.getTime() + 86_400_000);
        return { date: localDateKey(tomorrow, zone), time: "00:00" };
    }
    const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
    const mm = String(rounded % 60).padStart(2, "0");
    return { date: localDateKey(at, zone), time: `${hh}:${mm}` };
}
