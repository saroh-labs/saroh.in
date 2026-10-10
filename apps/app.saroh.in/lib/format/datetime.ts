import { count } from "./plural";
/**
 * Dates and times for the workspace: the one place a day or a clock is
 * turned into words. `scripts/check-formats.mjs` fails an `Intl` or
 * `toLocale…` call anywhere else in the app.
 *
 * The forms (UX audit, 10 Oct 2026):
 *
 * - a day is "12 Oct" this year and "12 Oct 2025" in any other, with the
 *   weekday in front when asked ("Mon 12 Oct") and "Today", "Tomorrow" or
 *   "Yesterday" where the screen says so;
 * - a time is on the 12-hour clock, as the pickers are: "9:30 am", lowercase,
 *   no leading zero;
 * - the two together are "12 Oct, 9:30 am";
 * - a range is "9:30 to 10:15 am".
 *
 * Every function takes an explicit IANA time zone, never the runtime's: the
 * server is in UTC and the merchant is not. A Booking is stored as an instant
 * plus the zone the booker saw it in, and a business has its own
 * (`businessZone`). Which zone a screen uses is the caller's choice and is
 * not decided here.
 *
 * The words are put together by hand from the zone's numeric parts, so no
 * ICU build can change them ("Sept", a comma after the weekday, "AM").
 *
 * Pure display: no server imports, safe in both server and client components.
 */

export type Instant = string | number | Date;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const MONTHS_SHORT = [
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
const MONTHS_LONG = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

// — The zone ———————————————————————————————————————————————————————

/** An instant read on a zone's wall clock. */
export interface ZoneParts {
    year: number;
    /** 1 to 12. */
    month: number;
    day: number;
    /** 0 to 23. */
    hour: number;
    minute: number;
    second: number;
    /** 0 is Sunday. */
    weekday: number;
}

const partsFormats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(timeZone: string): Intl.DateTimeFormat {
    let format = partsFormats.get(timeZone);
    if (!format) {
        format = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        partsFormats.set(timeZone, format);
    }
    return format;
}

/**
 * What the wall clock says in a zone at an instant. Throws a `RangeError`
 * for a zone the runtime doesn't know, as `Intl` does (`isTimeZone` asks).
 */
export function zoneParts(at: Instant, timeZone: string): ZoneParts {
    const out: Record<string, number> = {};
    for (const part of partsFormat(timeZone).formatToParts(new Date(at))) {
        if (part.type !== "literal") out[part.type] = Number(part.value);
    }
    const { year, month, day } = out;
    return {
        year,
        month,
        day,
        // Some engines answer 24 for midnight even on the 23-hour cycle.
        hour: out.hour % 24,
        minute: out.minute,
        second: out.second,
        weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    };
}

/** Whether the runtime knows this IANA zone. */
export function isTimeZone(zone: string): boolean {
    if (!zone) return false;
    try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/**
 * The zone this runtime is in: the viewer's in a browser, the server's
 * (UTC) on the server. Only for a client-side read behind a server snapshot
 * (`ViewerDate`), or to tell the API where the viewer is.
 */
export function viewerTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * A zone's own name at an instant: "India Standard Time", "IST",
 * "GMT+5:30". Empty when the runtime has none.
 */
export function timeZoneName(
    zone: string,
    style: NonNullable<Intl.DateTimeFormatOptions["timeZoneName"]>,
    at: Instant = new Date(),
    locale = "en",
): string {
    return (
        new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: style })
            .formatToParts(new Date(at))
            .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local "YYYY-MM-DD" of an instant in a given zone: a sortable day key. */
export function localDateKey(at: Instant, timeZone: string): string {
    return dayOf(at, timeZone).key;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar day an instant falls on in a zone. A bare "YYYY-MM-DD" is
 * already a day (a renewal date, a day off) and has no zone left in it, so
 * it is read as written and never moved by one.
 */
function dayOf(at: Instant, timeZone: string): Day & { key: string } {
    if (typeof at === "string" && DAY_KEY.test(at)) {
        const [year, month, day] = at.split("-").map(Number);
        return {
            year,
            month,
            day,
            weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
            key: at,
        };
    }
    const p = zoneParts(at, timeZone);
    return { ...p, key: `${p.year}-${pad(p.month)}-${pad(p.day)}` };
}

/** A "YYYY-MM-DD" key some days on, by the calendar. */
function shiftKey(key: string, days: number): string {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// — A day ——————————————————————————————————————————————————————————

interface Day {
    year: number;
    month: number;
    day: number;
    weekday: number;
}

export interface DateOptions {
    /** What "this year" and "today" are measured from. Defaults to now. */
    now?: Instant;
    /**
     * `auto` (the default) writes the year only when it is not this one.
     * `always` is for a document's date; `never` for a tick on an axis.
     */
    year?: "auto" | "always" | "never";
    /** "Mon 12 Oct" or "Monday 12 Oct". Left out by default. */
    weekday?: "short" | "long";
    /** "12 Oct" (the default) or "12 October", said in a sentence. */
    month?: "short" | "long";
    /**
     * Say "Today", "Tomorrow" or "Yesterday" for those three days, and the
     * date for any other. `lower` writes them mid-sentence ("today").
     */
    relative?: boolean | "lower";
}

function dayWords(
    d: Day,
    key: string,
    todayKey: string,
    options: DateOptions,
): string {
    if (options.relative) {
        const lower = options.relative === "lower";
        const word =
            key === todayKey
                ? "Today"
                : key === shiftKey(todayKey, 1)
                  ? "Tomorrow"
                  : key === shiftKey(todayKey, -1)
                    ? "Yesterday"
                    : null;
        if (word) return lower ? word.toLowerCase() : word;
    }
    const year = options.year ?? "auto";
    const withYear =
        year === "always" ||
        (year === "auto" && d.year !== Number(todayKey.slice(0, 4)));
    const month = (options.month === "long" ? MONTHS_LONG : MONTHS_SHORT)[
        d.month - 1
    ];
    const weekday = options.weekday
        ? `${(options.weekday === "long" ? WEEKDAYS_LONG : WEEKDAYS_SHORT)[d.weekday]} `
        : "";
    return `${weekday}${d.day} ${month}${withYear ? ` ${d.year}` : ""}`;
}

/**
 * A day: "12 Oct" this year, "12 Oct 2025" otherwise. See {@link DateOptions}
 * for the weekday, the long month and "Today".
 *
 * `at` is an instant, read in `timeZone`, or a calendar day that is
 * already a "YYYY-MM-DD" key, read as written. "This year" and "Today" are
 * measured in `timeZone` either way.
 */
export function formatDate(
    at: Instant,
    timeZone: string,
    options: DateOptions = {},
): string {
    const d = dayOf(at, timeZone);
    return dayWords(
        d,
        d.key,
        localDateKey(options.now ?? new Date(), timeZone),
        options,
    );
}

/**
 * The same, for a "YYYY-MM-DD" key where there is no zone to measure today
 * in, only the key of today (a cell of the month, a tick on an axis).
 * Without `today`, "this year" is the UTC day's, which is right on all but
 * a few hours of 1 January.
 */
export function formatDay(
    key: string,
    options: Omit<DateOptions, "now"> & { today?: string } = {},
): string {
    const d = dayOf(key.slice(0, 10), "UTC");
    return dayWords(
        d,
        d.key,
        options.today ?? new Date().toISOString().slice(0, 10),
        options,
    );
}

/** "October 2026", or "Oct" with `{ month: "short", year: "never" }`. */
export function formatMonth(
    at: Instant,
    timeZone: string,
    options: Pick<DateOptions, "now" | "year" | "month"> = {},
): string {
    const p = dayOf(at, timeZone);
    const year = options.year ?? "always";
    const withYear =
        year === "always" ||
        (year === "auto" &&
            p.year !== dayOf(options.now ?? new Date(), timeZone).year);
    const month = (options.month === "short" ? MONTHS_SHORT : MONTHS_LONG)[
        p.month - 1
    ];
    return `${month}${withYear ? ` ${p.year}` : ""}`;
}

/** "Monday", or "Mon". */
export function formatWeekday(
    at: Instant,
    timeZone: string,
    style: "long" | "short" = "long",
): string {
    return (style === "long" ? WEEKDAYS_LONG : WEEKDAYS_SHORT)[
        dayOf(at, timeZone).weekday
    ];
}

// — A time —————————————————————————————————————————————————————————

function clockWords(
    hour: number,
    minute: number,
): { time: string; period: "am" | "pm" } {
    return {
        time: `${hour % 12 || 12}:${pad(minute)}`,
        period: hour % 24 < 12 ? "am" : "pm",
    };
}

/** A time on the 12-hour clock: "9:30 am", "12:00 pm", "6:05 pm". */
export function formatTime(at: Instant, timeZone: string): string {
    const p = zoneParts(at, timeZone);
    const c = clockWords(p.hour, p.minute);
    return `${c.time} ${c.period}`;
}

/**
 * The "HH:MM" a time field holds for an instant ("18:30"): a value, never
 * words anyone reads.
 */
export function clockValue(at: Instant, timeZone: string): string {
    const p = zoneParts(at, timeZone);
    return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutes since midnight of a wall-clock value: "09:30", or 570 itself. */
function wallMinutes(value: string | number): number {
    if (typeof value === "number") return Math.round(value);
    const [h = "0", m = "0"] = value.split(":");
    return Number(h) * 60 + Number(m);
}

function wallClock(value: string | number): ReturnType<typeof clockWords> {
    const minutes = ((wallMinutes(value) % 1440) + 1440) % 1440;
    return clockWords(Math.floor(minutes / 60), minutes % 60);
}

/**
 * The same, for a wall-clock value that has no date or zone in it: an
 * opening hour kept as "09:30", or minutes since midnight (570).
 *
 * `short` is for the ticks of an hour axis, where there is no room: it
 * leaves ":00" off the hour ("7 am", and still "7:30 am").
 */
export function formatClock(
    value: string | number,
    options: { short?: boolean } = {},
): string {
    const c = wallClock(value);
    const time =
        options.short && c.time.endsWith(":00") ? c.time.slice(0, -3) : c.time;
    return `${time} ${c.period}`;
}

/**
 * From one time to another: "9:30 to 10:15 am". "am" or "pm" is said once
 * when both ends share it, and at both when they don't ("11:30 am to
 * 12:15 pm").
 */
export function formatTimeRange(
    start: Instant,
    end: Instant,
    timeZone: string,
): string {
    const a = zoneParts(start, timeZone);
    const b = zoneParts(end, timeZone);
    return rangeWords(
        clockWords(a.hour, a.minute),
        clockWords(b.hour, b.minute),
    );
}

/** {@link formatTimeRange} for two wall-clock values ("09:30", or minutes). */
export function formatClockRange(
    start: string | number,
    end: string | number,
): string {
    return rangeWords(wallClock(start), wallClock(end));
}

function rangeWords(
    a: ReturnType<typeof clockWords>,
    b: ReturnType<typeof clockWords>,
): string {
    return a.period === b.period
        ? `${a.time} to ${b.time} ${b.period}`
        : `${a.time} ${a.period} to ${b.time} ${b.period}`;
}

/**
 * A day and its time: "12 Oct, 9:30 am". Takes what {@link formatDate}
 * does, so "Today, 9:30 am" and "Mon 12 Oct, 9:30 am" are options.
 */
export function formatDateTime(
    at: Instant,
    timeZone: string,
    options: DateOptions = {},
): string {
    return `${formatDate(at, timeZone, options)}, ${formatTime(at, timeZone)}`;
}

/**
 * When something happened, as a log line says it: "Today, 9:14 am",
 * "Yesterday", "22 Sep", with the year only when it is not this one. The
 * time only for today, where it is the difference between two changes; a
 * day further back is enough to find it by (Settings › Activity).
 */
export function formatRecent(
    at: Instant,
    timeZone: string,
    now: Instant = new Date(),
): string {
    return localDateKey(at, timeZone) === localDateKey(now, timeZone)
        ? formatDateTime(at, timeZone, { now, relative: true })
        : formatDate(at, timeZone, { now, relative: true });
}

// — How long ———————————————————————————————————————————————————————

/**
 * How long ago, in whole units: "just now", "5 minutes ago", "3 hours ago",
 * "2 days ago". Never a calendar word ("yesterday"), since 25 hours back
 * can be the day before that.
 */
export function formatRelative(at: Instant, now: Instant = new Date()): string {
    const gap = Math.max(0, new Date(now).getTime() - new Date(at).getTime());
    if (gap < MS_PER_MINUTE) return "just now";
    const ago = (n: number, unit: string) => `${count(n, unit)} ago`;
    if (gap < MS_PER_HOUR)
        return ago(Math.floor(gap / MS_PER_MINUTE), "minute");
    if (gap < MS_PER_DAY) return ago(Math.floor(gap / MS_PER_HOUR), "hour");
    return ago(Math.floor(gap / MS_PER_DAY), "day");
}

/** Whole days between two instants; negative when `iso` is in the past. */
export function daysUntil(iso: string | Date, now: Date = new Date()): number {
    return Math.round((new Date(iso).getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * How long something has been waiting, phrased as the state it is in.
 *
 * Returns null for a null instant so callers pick their own absence marker.
 */
export function formatOverdue(
    iso: string | null | undefined,
    now: Date = new Date(),
): string | null {
    if (!iso) return null;
    const days = daysUntil(iso, now);
    if (days === 0) return "Due today";
    if (days > 0) return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
    return `${count(Math.abs(days), "day")} overdue`;
}

/** How long a thing has existed, e.g. "15 days waiting". */
export function formatWaiting(
    iso: string | null | undefined,
    now: Date = new Date(),
): string | null {
    if (!iso) return null;
    const days = Math.abs(daysUntil(iso, now));
    if (days === 0) return "Today";
    return `${count(days, "day")} waiting`;
}
