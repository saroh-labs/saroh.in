import { DISPLAY_LOCALE } from "./locale";

/**
 * Time formatting for the workspace.
 *
 * Principle 3 of the redesign: *time is an axis, not a column*. "20 Jul 2026"
 * tells a merchant nothing about whether to act; "waiting 15 days" does. These
 * helpers turn instants into the states the workspace actually reasons about —
 * overdue, today, tomorrow, later.
 *
 * Every function that formats a wall-clock takes an explicit IANA timezone,
 * never the runtime's. A Booking is stored as an absolute instant plus the zone
 * the booker saw it in, and an Organization has no single zone to fold them
 * into: a merchant in Mumbai with a customer in London must see the customer's
 * 9am as the customer booked it.
 *
 * Pure display: no server imports, safe in both server and client components.
 */

const MS_PER_DAY = 86_400_000;

/** The local "YYYY-MM-DD" of an instant in a given zone — a sortable day key. */
export function localDateKey(iso: string | Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(iso));
}

/** A local time range, e.g. "9:00 – 9:30 AM", in the given zone. */
export function formatTimeRange(
    startISO: string | Date,
    endISO: string | Date,
    timeZone: string,
): string {
    const time = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        // Stated rather than inherited: `en-GB` is a 24-hour locale, and pinning
        // the locale to fix hydration would otherwise have silently switched
        // every booking on the schedule from "11:00 AM" to "11:00". A bug fix
        // must not change what the merchant reads.
        hour12: true,
    });
    return `${time.format(new Date(startISO))} – ${time.format(new Date(endISO))}`;
}

/** A friendly absolute day, e.g. "Mon, 21 Jul 2026", in the given zone. */
export function formatDayLabel(iso: string | Date, timeZone: string): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(iso));
}

/**
 * The heading a merchant actually scans for: "Today", "Tomorrow", or the date.
 *
 * Compared as local day KEYS rather than by subtracting instants, because a
 * booking six hours away can still be tomorrow and one twenty hours away can
 * still be today.
 */
export function formatDayHeading(
    iso: string | Date,
    timeZone: string,
    now: Date = new Date(),
): string {
    const key = localDateKey(iso, timeZone);
    if (key === localDateKey(now, timeZone)) return "Today";
    if (key === localDateKey(new Date(now.getTime() + MS_PER_DAY), timeZone)) {
        return "Tomorrow";
    }
    return formatDayLabel(iso, timeZone);
}

/**
 * A moment on a timeline, the way the counter says it: "Today, 09:14",
 * "Yesterday, 18:40", "22 Sep, 07:05" — the year only when it is not this one.
 * 24-hour, as the order designs draw it.
 */
export function formatMoment(
    iso: string | Date,
    timeZone: string,
    now: Date = new Date(),
): string {
    const time = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(iso));
    const key = localDateKey(iso, timeZone);
    if (key === localDateKey(now, timeZone)) return `Today, ${time}`;
    if (key === localDateKey(new Date(now.getTime() - MS_PER_DAY), timeZone)) {
        return `Yesterday, ${time}`;
    }
    const sameYear =
        key.slice(0, 4) === localDateKey(now, timeZone).slice(0, 4);
    const day = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        day: "numeric",
        month: "short",
        ...(sameYear ? {} : { year: "numeric" }),
    })
        .format(new Date(iso))
        // ICU writes "Sept"; the designs write three letters every month.
        .replace("Sept", "Sep");
    return `${day}, ${time}`;
}

/**
 * When something happened, as a log line says it: "Today 09:14",
 * "Yesterday", "22 Sep" — the year only when it is not this one. The hour
 * only for today, where it is the difference between two changes; a day
 * further back is enough to find it by (Settings › Activity).
 */
export function formatRecent(
    iso: string | Date,
    timeZone: string,
    now: Date = new Date(),
): string {
    const key = localDateKey(iso, timeZone);
    const today = localDateKey(now, timeZone);
    if (key === today) {
        const time = new Intl.DateTimeFormat("en-GB", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(new Date(iso));
        return `Today ${time}`;
    }
    if (key === localDateKey(new Date(now.getTime() - MS_PER_DAY), timeZone)) {
        return "Yesterday";
    }
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        day: "numeric",
        month: "short",
        ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
    })
        .format(new Date(iso))
        .replace("Sept", "Sep");
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
    const late = Math.abs(days);
    return late === 1 ? "1 day overdue" : `${late} days overdue`;
}

/** How long a thing has existed, e.g. "15 days waiting". */
export function formatWaiting(
    iso: string | null | undefined,
    now: Date = new Date(),
): string | null {
    if (!iso) return null;
    const days = Math.abs(daysUntil(iso, now));
    if (days === 0) return "Today";
    return days === 1 ? "1 day waiting" : `${days} days waiting`;
}

/**
 * A short absolute date for table cells, e.g. "21 Jul 2026".
 *
 * `timeZone` is required rather than defaulted for the same reason it is
 * everywhere else in this file: omitting it silently uses the runtime's zone,
 * which is UTC on the server and something else in the browser. Callers that
 * want the viewer's zone should use `<ViewerDate>`, which resolves it safely.
 */
export function formatShortDate(iso: string | Date, timeZone: string): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(iso));
}

/** A short date and time for a timeline, e.g. "21 Jul 2026, 14:05". */
export function formatShortDateTime(
    iso: string | Date,
    timeZone: string,
): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(iso));
}
