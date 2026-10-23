import { formatClock } from "@/lib/format/datetime";
import { joinFacts } from "@/lib/format/join";
import { count, plural } from "@/lib/format/plural";
import { firstName } from "@/lib/names";

import type { WeeklyRange } from "./types";

/**
 * Hours and time off, V2 (U17, DEC-170): one person's day as the day sheet
 * edits it — open or closed, opens, closes, a lunch break, other shifts —
 * and the words the weekly list, its sheets and their toasts say. Every
 * change saves the person's whole week (`PUT staff/:id/hours`), so these
 * turn a day's plan into ranges and back. Pure, so the screen and its
 * tests agree.
 */

/** A range of one day, in minutes from the business's local midnight. */
export interface Span {
    startMinute: number;
    endMinute: number;
}

/**
 * Two ranges this close (three hours or less apart) with the break starting
 * around midday (11 am to 4 pm) read as one day with a lunch break
 * between; otherwise the second is another shift ("and 5 to 9 pm"), as an
 * evening added an hour after the day ends is.
 */
export const LUNCH_GAP = 180;
const MIDDAY = { from: 11 * 60, to: 16 * 60 };

function isLunch(first: Span, second: Span): boolean {
    return (
        second.startMinute - first.endMinute <= LUNCH_GAP &&
        first.endMinute >= MIDDAY.from &&
        first.endMinute <= MIDDAY.to
    );
}

/** One day as the day sheet shows it. */
export interface DayPlan {
    open: boolean;
    opens: number;
    closes: number;
    lunch: { from: number; to: number } | null;
    /** Further ranges after the day's own: a split day's evening. */
    shifts: Span[];
}

/** Monday first, as every week on screen is listed; `day` 0 is Sunday. */
export const DAYS = [
    { day: 1, name: "Monday", short: "Mon", letter: "M" },
    { day: 2, name: "Tuesday", short: "Tue", letter: "T" },
    { day: 3, name: "Wednesday", short: "Wed", letter: "W" },
    { day: 4, name: "Thursday", short: "Thu", letter: "T" },
    { day: 5, name: "Friday", short: "Fri", letter: "F" },
    { day: 6, name: "Saturday", short: "Sat", letter: "S" },
    { day: 0, name: "Sunday", short: "Sun", letter: "S" },
] as const;

export function dayName(day: number): string {
    return DAYS.find((d) => d.day === day)?.name ?? "";
}

/** A day's ranges in order. */
export function rangesOn(hours: readonly WeeklyRange[], day: number): Span[] {
    return hours
        .filter((h) => h.dayOfWeek === day)
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((h) => ({ startMinute: h.startMinute, endMinute: h.endMinute }));
}

/** The plan a closed day opens with, before anyone sets it. */
const USUAL: DayPlan = {
    open: false,
    opens: 9 * 60,
    closes: 18 * 60,
    lunch: null,
    shifts: [],
};

/** A day's ranges as the day sheet shows them. */
export function planOf(ranges: readonly Span[]): DayPlan {
    const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute);
    const first = sorted.at(0);
    const second = sorted.at(1);
    const rest = sorted.slice(2);
    if (!first) return USUAL;
    if (second && isLunch(first, second)) {
        return {
            open: true,
            opens: first.startMinute,
            closes: second.endMinute,
            lunch: { from: first.endMinute, to: second.startMinute },
            shifts: rest,
        };
    }
    return {
        open: true,
        opens: first.startMinute,
        closes: first.endMinute,
        lunch: null,
        shifts: second ? [second, ...rest] : [],
    };
}

/** A plan as the ranges the API keeps; none when the day is closed. */
export function rangesOfPlan(plan: DayPlan): Span[] {
    if (!plan.open) return [];
    const main: Span[] = plan.lunch
        ? [
              { startMinute: plan.opens, endMinute: plan.lunch.from },
              { startMinute: plan.lunch.to, endMinute: plan.closes },
          ]
        : [{ startMinute: plan.opens, endMinute: plan.closes }];
    return [...main, ...plan.shifts];
}

/** Why a plan can't be saved as it stands, or null when it can. */
export function planRefusal(plan: DayPlan): string | null {
    if (!plan.open) return null;
    if (plan.closes <= plan.opens) {
        return "It has to close after it opens.";
    }
    if (plan.lunch) {
        if (plan.lunch.to <= plan.lunch.from) {
            return "Lunch has to end after it starts.";
        }
        if (plan.lunch.from <= plan.opens || plan.lunch.to >= plan.closes) {
            return "Lunch has to be inside the day's hours.";
        }
    }
    const all = rangesOfPlan(plan);
    for (const s of plan.shifts) {
        if (s.endMinute <= s.startMinute) {
            return "A shift has to end after it starts.";
        }
    }
    const sorted = [...all].sort((a, b) => a.startMinute - b.startMinute);
    const clash = sorted.some(
        (next, i) =>
            i > 0 && next.startMinute < (sorted.at(i - 1)?.endMinute ?? 0),
    );
    if (clash) return "That overlaps hours already set.";
    return null;
}

/** "9 am", "1:30 pm": a time on the 12-hour clock, short. */
export function clockWords(minute: number): string {
    return formatClock(minute % 1440, { short: true });
}

/** "9 am to 7 pm"; "1 to 3 pm" when both ends share am or pm. */
export function spanWords(from: number, to: number): string {
    const a = clockWords(from);
    const b = clockWords(to);
    const [aTime, aPeriod] = a.split(" ");
    const [, bPeriod] = b.split(" ");
    return aPeriod === bPeriod ? `${aTime} to ${b}` : `${a} to ${b}`;
}

/**
 * A day as its row in the weekly list says it: the hours on the right and
 * lunch, or a second shift, under them.
 */
export function daySummary(ranges: readonly Span[]): {
    main: string;
    sub: string | null;
} {
    if (!ranges.length) return { main: "Closed", sub: null };
    const plan = planOf(ranges);
    const shifts = plan.shifts.length
        ? `and ${plan.shifts.map((s) => spanWords(s.startMinute, s.endMinute)).join(", ")}`
        : null;
    return {
        main: spanWords(plan.opens, plan.closes),
        sub:
            joinFacts(
                plan.lunch
                    ? `Lunch ${spanWords(plan.lunch.from, plan.lunch.to)}`
                    : null,
                shifts,
            ) || null,
    };
}

/** One person on a day, for the Everyone view. */
export interface PersonDay {
    name: string;
    ranges: readonly Span[];
}

/**
 * A day for everyone together: from the first person in to the last out,
 * and who works it.
 */
export function everyoneSummary(people: readonly PersonDay[]): {
    main: string;
    sub: string | null;
} {
    const on = people.filter((p) => p.ranges.length);
    if (!on.length) return { main: "Closed", sub: null };
    const from = Math.min(
        ...on.flatMap((p) => p.ranges.map((r) => r.startMinute)),
    );
    const to = Math.max(...on.flatMap((p) => p.ranges.map((r) => r.endMinute)));
    return {
        main: spanWords(from, to),
        sub: on.map((p) => firstName(p.name)).join(", "),
    };
}

/** A week with one day's ranges replaced. */
export function withDay(
    hours: readonly WeeklyRange[],
    day: number,
    ranges: readonly Span[],
): WeeklyRange[] {
    return [
        ...hours.filter((h) => h.dayOfWeek !== day),
        ...ranges.map((r) => ({ dayOfWeek: day, ...r })),
    ];
}

/** A week with the same ranges on each of `days`, replacing theirs. */
export function withDays(
    hours: readonly WeeklyRange[],
    days: readonly number[],
    ranges: readonly Span[],
): WeeklyRange[] {
    return days.reduce<WeeklyRange[]>(
        (week, day) => withDay(week, day, ranges),
        [...hours],
    );
}

/** Hours a week, whole: "44", for "44 hours a week". */
export function hoursAWeek(hours: readonly WeeklyRange[]): number {
    return Math.round(
        hours.reduce((n, h) => n + (h.endMinute - h.startMinute), 0) / 60,
    );
}

/** "Mon, Tue, Wed", in the week's order. */
export function shortDays(days: readonly number[]): string {
    return DAYS.filter((d) => days.includes(d.day))
        .map((d) => d.short)
        .join(", ");
}

/** "2 more days", for "Also use these hours on". */
export function moreDays(n: number): string {
    return `${n} more ${plural(n, "day", "days")}`;
}

/** What the several-days sheet chose, as ranges for each day. */
export interface SeveralChoice {
    open: boolean;
    opens: number;
    closes: number;
    lunch: { from: number; to: number } | null;
}

export function severalRanges(choice: SeveralChoice): Span[] {
    return rangesOfPlan({ ...choice, shifts: [] });
}

/** The toast once several days are changed: "Mon, Tue: 9 am to 7 pm. Saved." */
export function severalSaved(
    days: readonly number[],
    choice: SeveralChoice,
): string {
    const what = !choice.open
        ? "closed"
        : choice.lunch
          ? `${spanWords(choice.opens, choice.closes)}, lunch ${spanWords(choice.lunch.from, choice.lunch.to)}`
          : spanWords(choice.opens, choice.closes);
    return `${shortDays(days)}: ${what}. Saved.`;
}

/** Where a new lunch break goes: 1 to 2 pm, or the middle of a short day. */
export function lunchFor(plan: Pick<DayPlan, "opens" | "closes">): {
    from: number;
    to: number;
} {
    if (plan.opens < 13 * 60 && plan.closes > 14 * 60) {
        return { from: 13 * 60, to: 14 * 60 };
    }
    const mid = plan.opens + Math.floor((plan.closes - plan.opens) / 60) * 30;
    return { from: mid, to: Math.min(mid + 30, plan.closes - 30) };
}

/**
 * Where another shift goes: an hour after the day ends, for two hours, or
 * null when the day ends too late for one.
 */
export function nextShift(plan: DayPlan): Span | null {
    const last = Math.max(plan.closes, ...plan.shifts.map((s) => s.endMinute));
    const from = last + 60;
    if (from > 23 * 60) return null;
    return { startMinute: from, endMinute: Math.min(from + 120, 1440) };
}

/** The toasts a day sheet says, each naming the day and whose it is. */
export const dayWords = {
    closed: (day: string, who: string) =>
        `${day} is now closed for ${firstName(who)}. Saved.`,
    opened: (day: string, who: string) =>
        `${day} is open again for ${firstName(who)}. Saved.`,
    time: (day: string, what: string, minute: number) =>
        `${day} ${what} at ${formatClock(minute % 1440)}. Saved.`,
    lunchOn: (from: number, to: number) =>
        `Lunch break added: ${spanWords(from, to)}. Saved.`,
    lunchOff: () => "Lunch break removed. Saved.",
    shiftOn: (s: Span) =>
        `Shift added: ${spanWords(s.startMinute, s.endMinute)}. Saved.`,
    shiftOff: () => "Shift removed. Saved.",
    shiftTime: (day: string, s: Span) =>
        `${day}'s other shift is now ${spanWords(s.startMinute, s.endMinute)}. Saved.`,
    copied: (day: string, n: number) =>
        `${day}'s hours now also on ${moreDays(n)}. Saved.`,
    /** A save that was refused: the control is back as it was. */
    failed: (day: string, who: string) =>
        `Couldn't save ${day} for ${firstName(who)}. Nothing has changed.`,
};

/** "44 hours a week", or "3 people" for everyone. */
export function weekMeta(hours: readonly WeeklyRange[]): string {
    return `${count(hoursAWeek(hours), "hour")} a week`;
}

/** One line of a week: the days together, and their hours or "Closed". */
export interface WeekWords {
    days: string;
    hours: string;
    closed: boolean;
}

/**
 * A week in words, Monday first, neighbouring days with the same hours
 * together: "Monday to Saturday · 10 am to 7 pm", "Sunday · Closed".
 * `short` names the days "Mon to Sat".
 */
export function weekWords(
    hours: readonly WeeklyRange[],
    short = false,
): WeekWords[] {
    const runs: { from: number; to: number; hours: string }[] = [];
    DAYS.forEach((d, i) => {
        const ranges = rangesOn(hours, d.day);
        const said = ranges.length
            ? ranges
                  .map((r) => spanWords(r.startMinute, r.endMinute))
                  .join(" and ")
            : "Closed";
        const last = runs.at(-1);
        if (last?.hours === said) last.to = i;
        else runs.push({ from: i, to: i, hours: said });
    });
    const label = (i: number) => {
        const d = DAYS.at(i);
        return d ? (short ? d.short : d.name) : "";
    };
    return runs.map(({ from, to, hours: said }) => ({
        days:
            from === to
                ? label(from)
                : to === from + 1
                  ? `${label(from)} and ${label(to)}`
                  : `${label(from)} to ${label(to)}`,
        hours: said,
        closed: said === "Closed",
    }));
}

/** "Mon to Fri 9 am to 6 pm and Sat 10 am to 2 pm": the open days only. */
export function openWeekSentence(hours: readonly WeeklyRange[]): string {
    return weekWords(hours, true)
        .filter((w) => !w.closed)
        .map((w) => `${w.days} ${w.hours}`)
        .join(", and ");
}
