/**
 * How a merchant's site writes a clock time a customer reads: the 12-hour
 * clock, "9:00 am", "1:30 pm", "12:00 pm" for noon and "12:00 am" for
 * midnight. No leading zero, a space, small letters.
 *
 * Its twin is the API's `timeWords` and `clockWords`
 * (`apps/api.saroh.in/src/common/words-format.ts`), which write the emails
 * and notices the same customer gets, so the time they pick on the page is
 * the time they are emailed. `clock.test.ts` runs the API spec's cases
 * against this file. Change one, change the other.
 *
 * For reading only. A value a machine takes (a `?start=` in an address, a
 * radio's `value`, a calendar file, an hour to group by) stays a 24-hour
 * "HH:MM", from `clockValue`. Opening hours keep their own compact form
 * ("9am–7pm"), written by `opening-hours.ts`.
 *
 * Pure: no React, no clock of its own. Every caller passes its time zone
 * (a message's time alone may come with none, and is then the reader's own).
 */

type Instant = Date | string | number;

interface Clock {
    /** "9:30", on the 12-hour clock. */
    time: string;
    period: "am" | "pm";
}

function clock(hour: number, minute: number): Clock {
    return {
        time: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`,
        period: hour % 24 < 12 ? "am" : "pm",
    };
}

/** An instant's hour (0 to 23) and minute in a zone. Throws on an unknown zone. */
export function clockParts(
    at: Instant,
    timeZone: string | undefined,
): { hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(at));
    const value = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value ?? "");
    // Some engines answer 24 for midnight even on the 23-hour cycle.
    return { hour: value("hour") % 24, minute: value("minute") };
}

/**
 * "09:30", the 24-hour value of an instant in a zone. For a machine: an
 * address, a `value`, a comparison. Never drawn.
 */
export function clockValue(at: Instant, timeZone: string): string {
    const p = clockParts(at, timeZone);
    return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** A time in a zone, as it is read: "9:30 am", "12:00 pm". */
export function timeWords(at: Instant, timeZone: string | undefined): string {
    const p = clockParts(at, timeZone);
    const c = clock(p.hour, p.minute);
    return `${c.time} ${c.period}`;
}

/**
 * The same for a wall-clock value with no date or zone in it, a class kept
 * as "09:30": "9:30 am". Anything else is returned as it came.
 */
export function clockWords(value: string): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return value;
    const c = clock(Number(m[1]) % 24, Number(m[2]));
    return `${c.time} ${c.period}`;
}

/**
 * From one time to another: "9:00 to 9:30 am". "am" or "pm" is said once
 * when both ends share it, and at both when they don't ("11:30 am to
 * 12:15 pm"). The merchant app's `formatTimeRange` has the same rule.
 */
export function timeRangeWords(
    start: Instant,
    end: Instant,
    timeZone: string,
): string {
    const from = clockParts(start, timeZone);
    const to = clockParts(end, timeZone);
    const a = clock(from.hour, from.minute);
    const b = clock(to.hour, to.minute);
    return a.period === b.period
        ? `${a.time} to ${b.time} ${b.period}`
        : `${a.time} ${a.period} to ${b.time} ${b.period}`;
}
