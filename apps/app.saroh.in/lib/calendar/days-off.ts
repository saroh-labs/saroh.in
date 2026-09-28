import { localDateKey } from "@/lib/format/datetime";

import { clock } from "./layers";
import type { CalendarMonth, DayOff } from "./types";

/**
 * Days off on the calendar (plan 005 E24, R16), after the "Saroh Business
 * Calendar" design: a day reads "Closed", "Dr. Pillai off" or "2 off", and
 * is striped when the business is closed or the person picked in the team
 * filter is off. Pure, so the rules are tested without a browser.
 *
 * The API sends closures to everyone who reads the calendar, and says whose
 * time off it is only to a caller who reads bookings (E20); anyone else
 * learns how many are off, never who.
 *
 * A day counts as off only when the whole of it is: an all-day stretch, or a
 * day strictly inside a longer one. A few hours off is named in the day
 * panel with its hours, and leaves the cell alone.
 */

/** What a day cell says about who is off. */
export interface CellOff {
    /** "Closed", "Off", "Dr. Pillai off", "2 off". */
    text: string;
    /** The whole of it, for the cell's title and label. */
    title: string;
    /** Closed, or the person picked is off: drawn striped. */
    striped: boolean;
}

interface Whole {
    closed: DayOff | null;
    /** Time off covering the whole day, one per person where known. */
    people: DayOff[];
}

/** "Dr. Arun Pillai" → "Dr. Pillai"; "Vikram Shah" → "Vikram". */
export function shortName(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (/^Dr\.?$/i.test(parts[0] ?? "") && parts.length > 1) {
        return `Dr. ${parts[parts.length - 1]}`;
    }
    return parts[0] ?? name;
}

/** Whether a stretch takes the whole of `date` in the business's zone. */
function wholeDay(off: DayOff, date: string, zone: string): boolean {
    if (off.allDay) return true;
    const first = localDateKey(off.startAt, zone);
    const last = localDateKey(
        new Date(new Date(off.endAt).getTime() - 1),
        zone,
    );
    return first < date && date < last;
}

const onDay = (month: Pick<CalendarMonth, "daysOff">, date: string) =>
    (month.daysOff ?? []).filter((d) => d.dates.includes(date));

function wholeOf(
    month: Pick<CalendarMonth, "daysOff" | "timezone">,
    date: string,
): Whole {
    const whole = onDay(month, date).filter((d) =>
        wholeDay(d, date, month.timezone),
    );
    const seen = new Set<string>();
    const people = whole.filter((d) => {
        if (d.kind !== "time_off") return false;
        // Unnamed (no `booking:read`): each row is someone.
        if (!d.staffId) return true;
        if (seen.has(d.staffId)) return false;
        seen.add(d.staffId);
        return true;
    });
    return { closed: whole.find((d) => d.kind === "closure") ?? null, people };
}

/** Everyone on the team is off: the design draws that day closed. */
function everyoneOff(
    month: Pick<CalendarMonth, "staff">,
    people: DayOff[],
): boolean {
    const staff = month.staff ?? [];
    if (staff.length === 0) return false;
    const off = new Set(people.map((p) => p.staffId));
    return staff.every((s) => off.has(s.id));
}

const why = (reason: string | null | undefined) =>
    reason ? ` · ${reason}` : "";

const peopleWord = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** "Dr. Arun Pillai and Dr. Meenakshi Rao off", or "2 people off". */
function offWords(people: DayOff[]): string {
    const named = people.map((p) => p.name).filter((n): n is string => !!n);
    if (named.length < people.length) return `${peopleWord(people.length)} off`;
    const list =
        named.length < 2
            ? (named[0] ?? "")
            : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
    return `${list} off`;
}

/**
 * The line a day cell carries, or null when nobody is off. With a person
 * picked, only the business closed or that person off is said.
 */
export function cellOff(
    month: Pick<CalendarMonth, "daysOff" | "timezone" | "staff">,
    date: string,
    person: string | null,
): CellOff | null {
    const { closed, people } = wholeOf(month, date);
    const reason = people.find((p) => p.reason)?.reason;
    if (closed) {
        return {
            text: "Closed",
            title: `Closed${why(closed.reason)}`,
            striped: true,
        };
    }
    if (people.length === 0) return null;
    if (everyoneOff(month, people)) {
        return {
            text: "Closed",
            title: `${offWords(people)}${why(reason)}`,
            striped: true,
        };
    }
    if (person) {
        const mine = people.find((p) => p.staffId === person);
        if (!mine) return null;
        return {
            text: "Off",
            title: `${offWords([mine])}${why(mine.reason)}`,
            striped: true,
        };
    }
    const only = people.length === 1 ? people[0] : null;
    return {
        text: only?.name
            ? `${shortName(only.name)} off`
            : `${people.length} off`,
        title: `${offWords(people)}${why(reason)}`,
        striped: false,
    };
}

/**
 * The day panel's line under its title: "Closed · Diwali", "Dr. Arun Pillai
 * off · At a conference", with a few hours off named by their hours
 * ("Dr. Meenakshi Rao off 14:00–18:00"). Null when nobody is off.
 */
export function dayOffLine(
    month: Pick<CalendarMonth, "daysOff" | "timezone" | "staff">,
    date: string,
): string | null {
    const all = onDay(month, date);
    if (all.length === 0) return null;
    const cell = cellOff(month, date, null);
    const zone = month.timezone;
    const hours = (d: DayOff) =>
        `${localDateKey(d.startAt, zone) < date ? "00:00" : clock(d.startAt, zone)}–${
            localDateKey(d.endAt, zone) > date ? "24:00" : clock(d.endAt, zone)
        }`;
    const parts: string[] = [];
    if (cell?.text === "Closed") {
        parts.push(cell.title);
    } else {
        const { people } = wholeOf(month, date);
        if (people.length > 0) {
            const reason = people.find((p) => p.reason)?.reason;
            parts.push(`${offWords(people)}${why(reason)}`);
        }
        for (const d of all) {
            if (wholeDay(d, date, zone)) continue;
            parts.push(
                d.kind === "closure"
                    ? `Closed ${hours(d)}${why(d.reason)}`
                    : `${d.name ?? "Someone"} off ${hours(d)}${why(d.reason)}`,
            );
        }
    }
    return parts.length ? parts.join(" · ") : null;
}
