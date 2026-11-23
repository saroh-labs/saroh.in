import type { LocalDate, Span } from "./diary";
import { minuteOnDay } from "./diary";

/** One person's Google busy time, as the API reads it: no title, ever. */
export interface BusyTime {
    staffId: string;
    startAt: string;
    endAt: string;
}

/**
 * The stretches of a day (in minutes, clipped to the hours drawn) that
 * these people's Google calendars say are busy, merged where they touch.
 * `people` null is everyone. Pure: the day and the week both draw from it.
 */
export function busySpans(
    busy: readonly BusyTime[],
    people: ReadonlySet<string> | null,
    date: LocalDate,
    timeZone: string,
    [from, to]: Span,
): Span[] {
    const spans: Span[] = [];
    for (const b of busy) {
        if (people && !people.has(b.staffId)) continue;
        const a = Math.max(from, minuteOnDay(b.startAt, date, timeZone));
        const z = Math.min(to, minuteOnDay(b.endAt, date, timeZone));
        if (z > a) spans.push([a, z]);
    }
    spans.sort((x, y) => x[0] - y[0]);
    const merged: Span[] = [];
    for (const s of spans) {
        const last = merged.at(-1);
        if (last && s[0] <= last[1])
            merged[merged.length - 1] = [last[0], Math.max(last[1], s[1])];
        else merged.push([s[0], s[1]]);
    }
    return merged;
}

/** "Busy 11:30 am to 12:30 pm, from Google Calendar" is drawn from this. */
export const BUSY_WORD = "Busy";
export const BUSY_SOURCE = "Google Calendar";
