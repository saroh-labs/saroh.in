import { formatDate, formatTime, formatWeekday } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";

import type { Course, CourseStatus } from "./service";

/**
 * How a course is said on screen (ADR-007, the "Saroh Billing and Classes"
 * design). Seats come from real enrolments, so the row and the roster can
 * never disagree. Times are read in the course's service's zone — the one
 * its sessions run in.
 */

type Seats = Pick<Course, "seats" | "enrolled" | "seatsLeft">;

/** The roster's badge: "3 seats left", "1 seat left", "Full · 10 of 10". */
export function seatsLeftLine(c: Seats): string {
    if (c.seatsLeft <= 0) return `Full · ${c.enrolled} of ${c.seats}`;
    return `${count(c.seatsLeft, "seat")} left`;
}

/** The list's column: "9 of 12 taken". */
export function seatsTakenLine(c: Seats): string {
    return `${c.enrolled} of ${c.seats} taken`;
}

export type CourseTab = "OPEN" | "FULL" | "CLOSED" | "DRAFT" | "PAST";

/**
 * The tab a course belongs on. Past wins — a course with nothing left to
 * run is done, whatever it was set to — then the status, and an open one
 * with no seat left is Full.
 */
export function courseTab(
    c: Pick<Course, "status" | "sessionsLeft" | "sessions" | "seatsLeft">,
): CourseTab {
    if (c.status === "ARCHIVED") return "PAST";
    if (c.status === "DRAFT") return "DRAFT";
    if (c.sessions.length > 0 && c.sessionsLeft === 0) return "PAST";
    if (c.status === "CLOSED") return "CLOSED";
    return c.seatsLeft <= 0 ? "FULL" : "OPEN";
}

export const TAB_LABEL: Record<CourseTab, string> = {
    OPEN: "Live",
    FULL: "Full",
    CLOSED: "Paused",
    DRAFT: "Draft",
    PAST: "Past",
};

export const STATUS_LABEL: Record<CourseStatus, string> = {
    DRAFT: "Draft",
    OPEN: "Live",
    CLOSED: "Paused",
    ARCHIVED: "Archived",
};

/**
 * When it runs, as the list says it: "Tuesdays 6:30 pm, from 6 Oct" when every
 * session is the same weekday and time, "8 sessions, from 6 Oct" otherwise,
 * "Ended 24 Nov" once the last has run.
 */
export function runsLine(
    c: Pick<Course, "sessions" | "sessionsLeft" | "nextSessionAt" | "service">,
    now: Date = new Date(),
): string {
    const tz = c.service.timezone;
    if (c.sessions.length === 0) return "No sessions yet";
    const first = c.sessions[0];
    const last = c.sessions[c.sessions.length - 1];
    if (Date.parse(last.startAt) <= now.getTime()) {
        return `Ended ${formatDate(last.startAt, tz, { now })}`;
    }
    const from = c.nextSessionAt ?? first.startAt;
    const days = new Set(c.sessions.map((s) => formatWeekday(s.startAt, tz)));
    const times = new Set(c.sessions.map((s) => formatTime(s.startAt, tz)));
    const started = Date.parse(first.startAt) <= now.getTime();
    const when = started ? "next" : "from";
    if (days.size === 1 && times.size === 1 && c.sessions.length > 1) {
        return `${Array.from(days)[0]}s ${Array.from(times)[0]}, ${when} ${formatDate(from, tz, { now })}`;
    }
    const n = c.sessions.length;
    return `${count(n, "session")}, ${when} ${formatDate(from, tz, { now })}`;
}

/**
 * What enrolling now books, for the enrol dialog: "Books all 8 sessions" or,
 * once it has started, "Books the 6 sessions left of 8".
 */
export function booksLine(
    c: Pick<Course, "sessions" | "sessionsLeft">,
): string {
    const n = c.sessions.length;
    const left = c.sessionsLeft;
    if (left === n) {
        return n === 1 ? "Books its one session" : `Books all ${n} sessions`;
    }
    return left === 1
        ? `Books the last session of ${n}`
        : `Books the ${left} sessions left of ${n}`;
}
