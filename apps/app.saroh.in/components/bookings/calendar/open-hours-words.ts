import {
    formatClock,
    formatClockRange,
    formatDay,
} from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type { Block, LocalDate, Span } from "@/lib/services/diary";
import { blockTitle, isLive } from "@/lib/services/diary";

/**
 * What "Open closed time" says and offers (U10, #1026; BKMOpenHours on a
 * phone, BKDOpenHours on the desk): how long each choice runs, the range it
 * makes, bookings already in it, and the toast. Blocking free time is the
 * free-time sheet's (U9, `gap-actions.ts`).
 */

const DAY_END = 1440;

/** "30 min", "1 hour", "2 hours", "1 hr 15 min". */
export function lengthLabel(minutes: number): string {
    if (minutes % 60 === 0) return count(minutes / 60, "hour");
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

/** The shorter choices offered under the first, "the whole of it". */
const SHORTER = [120, 60, 30] as const;

/** Plain lengths when the closed time runs on past four hours. */
const PLAIN = [60, 120, 180, 240] as const;

export interface LengthChoice {
    minutes: number;
    label: string;
    /** The whole closed time, offered first. */
    whole?: boolean;
}

/**
 * Closed time from `from`: where it ends (the next working window, else
 * midnight) and whether `from` is where it starts. Zero room when `from` is
 * inside a working window, which is open already.
 */
export function closedRun(
    from: number,
    windows: readonly Span[],
): { room: number; end: number; whole: boolean } {
    if (windows.some(([a, b]) => a <= from && from < b)) {
        return { room: 0, end: from, whole: false };
    }
    const end = Math.min(
        DAY_END,
        ...windows.map(([a]) => a).filter((a) => a > from),
    );
    const start = Math.max(
        0,
        ...windows.map(([, b]) => b).filter((b) => b <= from),
    );
    return { room: end - from, end, whole: start === from };
}

/**
 * How long to open closed time for. Closed time that ends within four
 * hours, before more working hours, is offered whole first ("All the closed time · 2 hours", or "Until
 * 9:00 am · 1 hour" when pressed part way in), then shorter; longer closed
 * time (an evening) is one to four hours. Never past midnight.
 */
export function openLengths(
    from: number,
    windows: readonly Span[],
): LengthChoice[] {
    const run = closedRun(from, windows);
    if (run.room > 0 && run.room <= 240 && run.end < DAY_END) {
        return [
            {
                minutes: run.room,
                whole: true,
                label: `${run.whole ? "All the closed time" : `Until ${formatClock(run.end)}`} · ${lengthLabel(run.room)}`,
            },
            ...SHORTER.filter((m) => m < run.room).map((m) => ({
                minutes: m,
                label: lengthLabel(m),
            })),
        ];
    }
    const fits = PLAIN.filter((m) => from + m <= DAY_END);
    return (fits.length ? fits : [DAY_END - from]).map((m) => ({
        minutes: m,
        label: lengthLabel(m),
    }));
}

/**
 * The length a fresh open starts on: the whole closed time when it is
 * offered, else 2 hours (the boards'), else the longest that fits.
 */
export function openStart(choices: readonly LengthChoice[]): number {
    const first = choices.at(0);
    if (!first) return 60;
    if (first.whole) return first.minutes;
    return choices.some((c) => c.minutes === 120)
        ? 120
        : (choices.at(-1)?.minutes ?? 60);
}

/** "1:00 to 3:00 pm", held to the day. */
export const rangeOf = (from: number, len: number): string =>
    formatClockRange(from, Math.min(from + len, DAY_END));

/** "Mon 19 Oct". */
export const dayText = (date: LocalDate): string =>
    formatDay(date, { weekday: "short", year: "never" });

/** ", today." or " on Tue 20 Oct.": how a toast ends for one day. */
export const onTheDay = (date: LocalDate, today: LocalDate): string =>
    date === today ? ", today." : ` on ${dayText(date)}.`;

/**
 * Bookings already in a stretch of closed time (made by hand outside the
 * hours), said plainly: opening it keeps them and offers the rest.
 */
export function bookingsIn(
    blocks: readonly Block[],
    from: number,
    to: number,
): string | null {
    const hit = blocks.filter((b) => isLive(b) && b.start < to && from < b.end);
    if (hit.length === 0) return null;
    const [one, ...more] = hit as [Block, ...Block[]];
    if (more.length === 0) {
        return `${blockTitle(one)} at ${formatClock(one.start)} is already booked in this time.`;
    }
    return `${count(hit.length, "booking")} are already in this time: ${hit
        .map((b) => `${blockTitle(b)} at ${formatClock(b.start)}`)
        .join(", ")}.`;
}
