/**
 * A service's own weekly hours, as the Service Editor's draft holds them:
 * rows of a day and two wall-clock times in the service's zone. They are
 * part of the page's one draft and go with its one Save, as a second call
 * after the service itself (`PUT …/rules` replaces the whole set).
 *
 * Pure and client-safe, so the editor and its tests agree.
 */

import type { WeeklyRange } from "@/lib/staff/types";

import type { AvailabilityRuleInput } from "./service";

/** One window as typed: a day, and "HH:MM" for when it opens and closes. */
export interface HoursRow {
    /** 0 = Sunday … 6 = Saturday, as the API keeps it. */
    dayOfWeek: number;
    start: string;
    end: string;
}

/** Sunday first, as `dayOfWeek` counts. */
export const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;

/** The week as the page lists it: Monday first, Sunday last. */
const weekOrder = (day: number) => (day + 6) % 7;

/** Minutes from midnight as "HH:MM". */
export function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" as minutes from midnight, or null when it isn't a time. */
export function timeToMinutes(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 24 || m > 59) return null;
    const total = h * 60 + m;
    return total > 1440 ? null : total;
}

/** Saved rules (or opening hours) as rows, Monday first, earliest first. */
export function hoursFromRules(rules: readonly WeeklyRange[]): HoursRow[] {
    return [...rules]
        .sort(
            (a, b) =>
                weekOrder(a.dayOfWeek) - weekOrder(b.dayOfWeek) ||
                a.startMinute - b.startMinute,
        )
        .map((r) => ({
            dayOfWeek: r.dayOfWeek,
            start: minutesToTime(r.startMinute),
            end: minutesToTime(r.endMinute),
        }));
}

/**
 * The hours a new service starts with. Where its own hours are what gives
 * it times (nobody on the diary takes it, or it is a class), it starts
 * from the business's opening hours, so it can be booked without a second
 * visit to this page. A one-to-one someone takes starts with none: its own
 * hours would only narrow that person's, and their free time is the
 * answer.
 */
export function startingHours(
    opening: readonly WeeklyRange[] | null,
    ownHoursGiveTimes: boolean,
): HoursRow[] {
    if (!ownHoursGiveTimes || !opening) return [];
    return hoursFromRules(opening);
}

/** Whether two sets of rows are the same windows, in any order. */
export function sameHours(
    a: readonly HoursRow[],
    b: readonly HoursRow[],
): boolean {
    const key = (rows: readonly HoursRow[]) =>
        rows
            .map((r) => `${r.dayOfWeek}|${r.start}|${r.end}`)
            .sort()
            .join(",");
    return key(a) === key(b);
}

/** A row that can't be saved, by its place in the list (from 0). */
export interface HoursProblem {
    index: number;
    message: string;
}

/**
 * What stops the rows being saved, one per row at most: a time missing, or
 * a window that ends before it starts. The API checks the same.
 */
export function hoursProblems(rows: readonly HoursRow[]): HoursProblem[] {
    const problems: HoursProblem[] = [];
    rows.forEach((row, index) => {
        const start = timeToMinutes(row.start);
        const end = timeToMinutes(row.end);
        const day = DAY_NAMES[row.dayOfWeek] ?? "That day";
        if (start === null || end === null) {
            problems.push({
                index,
                message: `${day}'s hours need a start and an end.`,
            });
        } else if (start >= end) {
            problems.push({
                index,
                message: `${day}'s hours end before they start. Choose a later end.`,
            });
        }
    });
    return problems;
}

/** What `PUT …/rules` is sent; null while a row can't be saved. */
export function rulesOf(
    rows: readonly HoursRow[],
): AvailabilityRuleInput[] | null {
    if (hoursProblems(rows).length > 0) return null;
    return rows.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        startMinute: timeToMinutes(row.start) ?? 0,
        endMinute: timeToMinutes(row.end) ?? 0,
    }));
}

/**
 * What the page says when the service itself was saved and its hours, the
 * second call of the same Save, were not: exactly what is saved and what
 * is not, and that the hours typed are still on the page. Shown with Try
 * again, which sends only the hours.
 */
export function hoursNotSaved({
    created,
    name,
    reason,
}: {
    /** The service was added by this Save (not an edit of a saved one). */
    created: boolean;
    name: string;
    /** The API's own sentence, or the one for a save that got no answer. */
    reason: string;
}): { title: string; body: string } {
    return {
        title: created
            ? `${name} was added, but its weekly hours were not saved.`
            : "Your other changes were saved, but its weekly hours were not.",
        body: `${withStop(reason)} The hours you chose are still here. Try again, or change them and save.`,
    };
}

function withStop(sentence: string): string {
    const text = sentence.trim();
    return /[.!?]$/.test(text) ? text : `${text}.`;
}
