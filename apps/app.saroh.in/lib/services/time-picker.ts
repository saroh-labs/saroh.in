/**
 * The booking sheets' time picker (U3, BKMNewBookingStep4): a strip of
 * days with how many times are free on each, the free times of the chosen
 * day by part of the day, and the next day with any. Pure, in the
 * business's own zone (Q10), so the sheet, Move and their tests agree.
 */

import { formatDate, formatTime, timeZoneName } from "@/lib/format/datetime";
import type { LocalDate } from "@/lib/services/diary";
import {
    addDays,
    localDateOf,
    localMinuteOf,
    weekdayOf,
} from "@/lib/services/diary";

/** A free start as the availability read gives it. */
export interface PickerSlot {
    startAt: string;
    endAt: string;
    /** Everyone free at that start (U3); a class's teacher. */
    staffIds?: string[];
    /** A class's places still open at that start (U8); absent otherwise. */
    placesLeft?: number;
}

/** How many days the strip shows, and the read covers. */
export const PICKER_DAYS = 14;

/** Noon: where "Morning" ends. */
const NOON = 12 * 60;

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One tile of the day strip. */
export interface PickerDay {
    date: LocalDate;
    /** "Today", "Tmrw", "Wed". */
    weekday: string;
    /** "21". */
    day: string;
    /** "3 free", "Closed", "Full". */
    count: string;
    free: number;
    closed: boolean;
    /** For a screen reader: "Wed 21 Oct, 3 free times". */
    aria: string;
}

/** The free starts of each local day, in order. */
export function slotsByDay(
    slots: readonly PickerSlot[],
    timeZone: string,
): Map<LocalDate, PickerSlot[]> {
    const days = new Map<LocalDate, PickerSlot[]>();
    for (const slot of [...slots].sort((a, b) =>
        a.startAt.localeCompare(b.startAt),
    )) {
        const key = localDateOf(slot.startAt, timeZone);
        const list = days.get(key);
        if (list) list.push(slot);
        else days.set(key, [slot]);
    }
    return days;
}

/**
 * The strip: `count` days from `from`. A day the business is closed on
 * (`closedWeekdays`, 0 = Sunday) says Closed; an open day with nothing
 * free says Full.
 */
export function pickerDays(input: {
    from: LocalDate;
    today: LocalDate;
    count?: number;
    byDay: Map<LocalDate, PickerSlot[]>;
    closedWeekdays?: readonly number[];
    timeZone: string;
}): PickerDay[] {
    const days: PickerDay[] = [];
    for (let i = 0; i < (input.count ?? PICKER_DAYS); i += 1) {
        const date = addDays(input.from, i);
        const free = input.byDay.get(date)?.length ?? 0;
        const closed =
            free === 0 &&
            (input.closedWeekdays ?? []).includes(weekdayOf(date));
        const weekday =
            date === input.today
                ? "Today"
                : date === addDays(input.today, 1)
                  ? "Tmrw"
                  : (WEEKDAY[weekdayOf(date)] ?? "");
        const count = closed ? "Closed" : free > 0 ? `${free} free` : "Full";
        days.push({
            date,
            weekday,
            day: String(Number(date.slice(8, 10))),
            count,
            free,
            closed,
            aria: `${dayName(date, input.today, input.timeZone)}, ${
                closed
                    ? "closed"
                    : free > 0
                      ? `${free} free ${free === 1 ? "time" : "times"}`
                      : "no free times"
            }`,
        });
    }
    return days;
}

/** "Today 19 Oct", "Tue 20 Oct": the chosen day, as the boards head it. */
export function dayName(
    date: LocalDate,
    today: LocalDate,
    timeZone: string,
): string {
    const words = formatDate(date, timeZone, { weekday: "short" });
    return date === today ? `Today ${words.replace(/^\w+ /, "")}` : words;
}

/** A day's free starts split into Morning and Afternoon and evening. */
export function partsOfDay(
    slots: readonly PickerSlot[],
    timeZone: string,
): { morning: PickerSlot[]; later: PickerSlot[] } {
    const morning: PickerSlot[] = [];
    const later: PickerSlot[] = [];
    for (const slot of slots) {
        (localMinuteOf(slot.startAt, timeZone) < NOON ? morning : later).push(
            slot,
        );
    }
    return { morning, later };
}

/** The first day after `after` with a free time, from the strip. */
export function nextFreeDay(
    days: readonly PickerDay[],
    after: LocalDate,
): PickerDay | null {
    return days.find((d) => d.date > after && d.free > 0) ?? null;
}

/** "10:00 am was just booked by someone else. Pick another time." */
export function takenMessage(startAt: string, timeZone: string): string {
    return `${formatTime(startAt, timeZone)} was just booked by someone else. Pick another time.`;
}

/** Who a start is with, by name: the first person free at it. */
export function slotPerson(
    slot: PickerSlot,
    people: readonly { id: string; name: string }[],
): { id: string; name: string } | null {
    for (const id of slot.staffIds ?? []) {
        const person = people.find((p) => p.id === id);
        if (person) return person;
    }
    return null;
}

/** What someone is called by ("Meera Iyer" → "Meera", past a "Dr."). */
export { firstName } from "@/lib/names";

/**
 * The zone as people know it, for "times in IST" (Q10): "IST", "BST",
 * "EDT", else "GMT+4". ICU names a zone in some locales and not others,
 * so each is asked in turn (as `activity-detail.ts` does).
 */
export function zoneShortName(timeZone: string, at: number | Date): string {
    let fallback = "";
    for (const locale of ["en-IN", "en-GB", "en-US"]) {
        const name = timeZoneName(timeZone, "short", at, locale);
        if (!name) continue;
        if (!/^(GMT|UTC)/.test(name)) return name;
        fallback ||= name;
    }
    return fallback;
}
