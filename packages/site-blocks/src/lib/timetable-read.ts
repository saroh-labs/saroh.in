/**
 * The Timetable block's public read (industry templates U2), its check and
 * the words a session wears — in a module with no "use client", so the
 * rules are tested on their own and usable on a server.
 *
 *   GET ${apiUrl}/public/sites/:siteId/timetable[?services=a,b]
 */

/** One class session, as the public read returns it. */
export interface TimetableSession {
    serviceId: string;
    serviceName: string;
    durationMinutes: number;
    startAt: string;
    /** `YYYY-MM-DD` in the business's zone. */
    date: string;
    /** `HH:MM` in the business's zone. */
    time: string;
    staffName: string | null;
    placesLeft: number;
    capacity: number;
}

/** What the public timetable read returns. */
export interface PublicTimetable {
    timezone: string;
    /** The seven days from today, in order. */
    days: string[];
    sessions: TimetableSession[];
}

function isSession(value: unknown): value is TimetableSession {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.serviceId === "string" &&
        typeof v.serviceName === "string" &&
        typeof v.durationMinutes === "number" &&
        typeof v.startAt === "string" &&
        typeof v.date === "string" &&
        typeof v.time === "string" &&
        (v.staffName === null || typeof v.staffName === "string") &&
        typeof v.placesLeft === "number" &&
        typeof v.capacity === "number"
    );
}

/** Narrowed, not cast (#264). */
export function isPublicTimetable(value: unknown): value is PublicTimetable {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.timezone === "string" &&
        Array.isArray(v.days) &&
        v.days.every((d) => typeof d === "string") &&
        Array.isArray(v.sessions) &&
        v.sessions.every(isSession)
    );
}

/** The read's query: the classes the section names, or none for all. */
export function timetableQuery(
    serviceIds: readonly string[] | undefined,
): string {
    const ids = (serviceIds ?? []).filter((id) => id.trim() !== "");
    return ids.length > 0
        ? `?${new URLSearchParams({ services: ids.join(",") }).toString()}`
        : "";
}

/** How a session's places read: always in words, never colour alone. */
export interface PlacesWord {
    text: string;
    tone: "full" | "filling" | "open";
}

/**
 * "Full" with no places left — said whatever `showPlacesLeft` is, because a
 * visitor must not tap through to find it. With places shown: "Fills fast ·
 * 2 left" when a fifth or fewer remain (two at least), else "6 places".
 * With them hidden, only Full is said.
 */
export function placesWord(
    session: Pick<TimetableSession, "placesLeft" | "capacity">,
    showPlacesLeft: boolean,
): PlacesWord | null {
    const left = Math.max(0, session.placesLeft);
    if (left === 0) return { text: "Full", tone: "full" };
    if (!showPlacesLeft) return null;
    const few = Math.max(2, Math.ceil(session.capacity * 0.2));
    if (left <= few) {
        return { text: `Fills fast · ${left} left`, tone: "filling" };
    }
    return {
        text: `${left} ${left === 1 ? "place" : "places"}`,
        tone: "open",
    };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const LONG_DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;
const MONTHS = [
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
] as const;

/**
 * "Tue 6 Oct" for a `YYYY-MM-DD`, read as a calendar date — spelled out, not
 * left to `Intl`, so a server and a browser can never disagree.
 */
export function dayLabel(date: string, long = false): string {
    const d = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return date;
    const names = long ? LONG_DAYS : DAYS;
    return `${names[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The booking page on this class, that day, that time chosen. */
export function sessionHref(bookHref: string, s: TimetableSession): string {
    const q = new URLSearchParams({
        service: s.serviceId,
        date: s.date,
        start: s.time,
    });
    return `${bookHref}?${q.toString()}`;
}
