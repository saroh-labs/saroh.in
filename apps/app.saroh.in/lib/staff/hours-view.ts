import type { LocalDate } from "@/lib/services/diary";

import type { SeveralChoice } from "./day-plan";
import {
    DAYS,
    daySummary,
    everyoneSummary,
    planOf,
    rangesOn,
} from "./day-plan";
import type { OffLine } from "./time-off";
import { offLines } from "./time-off";
import type { Closure, ExtraHours, StaffView, WeeklyRange } from "./types";

/**
 * What Hours and time off (U17) draws from what is saved: the week's rows,
 * the time off and extra hours coming up, for one person or for everyone.
 * Pure, so the screen and its tests agree.
 */

/** One day of the weekly list, as its row says it. */
export interface WeekRow {
    day: number;
    main: string;
    sub: string | null;
}

/** The week's rows: one person's, or everyone's together. */
export function weekRows(
    people: readonly { name: string; hours: readonly WeeklyRange[] }[],
    everyone: boolean,
): WeekRow[] {
    const one = people.at(0);
    return DAYS.map((d) => ({
        day: d.day,
        ...(everyone || !one
            ? everyoneSummary(
                  people.map((p) => ({
                      name: p.name,
                      ranges: rangesOn(p.hours, d.day),
                  })),
              )
            : daySummary(rangesOn(one.hours, d.day))),
    }));
}

/** A line of time off with whose it is: a person's, or the business's. */
export interface OffItem {
    line: OffLine;
    /** The person away; null when the business is closed. */
    staffId: string | null;
    who: string | null;
}

/** Time off coming up, soonest first: these people's, and the closures. */
export function comingOff(
    people: readonly StaffView[],
    closures: readonly Closure[],
    timezone: string,
    today: LocalDate,
): OffItem[] {
    return [
        ...people.flatMap((p) =>
            offLines(p.timeOff, timezone, false).map((line) => ({
                line,
                staffId: p.id,
                who: p.name,
            })),
        ),
        ...offLines(closures, timezone, true).map((line) => ({
            line,
            staffId: null,
            who: null,
        })),
    ]
        .filter((i) => i.line.toDate >= today)
        .sort((a, b) => a.line.fromDate.localeCompare(b.line.fromDate));
}

/** One-off hours with whose they are and how much is booked in them. */
export interface ExtraItem {
    staffId: string;
    who: string;
    x: ExtraHours;
    /** Live bookings that person has that day, or null when unread. */
    booked: number | null;
}

/** Extra opening hours coming up, soonest first. */
export function comingExtra(
    people: readonly StaffView[],
    bookedOn: Record<string, number> | null,
    today: LocalDate,
): ExtraItem[] {
    return people
        .flatMap((p) =>
            p.extraHours
                .filter((x) => x.date.slice(0, 10) >= today)
                .map((x) => ({
                    staffId: p.id,
                    who: p.name,
                    x,
                    booked: bookedOn
                        ? (bookedOn[`${p.id}|${x.date.slice(0, 10)}`] ?? 0)
                        : null,
                })),
        )
        .sort((a, b) => a.x.date.localeCompare(b.x.date));
}

/**
 * The times "Change several days" starts from: the person's first open
 * day, else 9 am to 6 pm.
 */
export function usualDay(week: readonly WeeklyRange[]): SeveralChoice {
    const day = DAYS.map((d) => rangesOn(week, d.day)).find((r) => r.length);
    if (!day) {
        return { open: true, opens: 9 * 60, closes: 18 * 60, lunch: null };
    }
    const plan = planOf(day);
    return {
        open: true,
        opens: plan.opens,
        closes: plan.closes,
        lunch: plan.lunch,
    };
}

/**
 * What "Change several days" opens with from the chips over the week: the
 * weekdays, the weekend (with no lunch), or no day picked yet.
 */
export function severalStart(
    start: "weekdays" | "weekend" | "choose",
    week: readonly WeeklyRange[],
): { days: number[]; choice: SeveralChoice } {
    const usual = usualDay(week);
    if (start === "weekdays") return { days: [1, 2, 3, 4, 5], choice: usual };
    if (start === "weekend") {
        return { days: [6, 0], choice: { ...usual, lunch: null } };
    }
    return { days: [], choice: usual };
}
