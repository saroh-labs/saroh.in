import { formatTime } from "@saroh/ui/time-select";

import type { OpeningHoursDay, Weekday } from "./storefronts";

/**
 * A location's saved week in words: the one line The place's "Opening
 * hours" row says, and the fuller line the editor shows once days differ.
 * Pure.
 */

export const SHORT_DAY: Record<Weekday, string> = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
};

const sameHours = (a: OpeningHoursDay, b: OpeningHoursDay) =>
    a.closed === b.closed &&
    (a.closed || (a.open === b.open && a.close === b.close));

const hours = (d: OpeningHoursDay) =>
    `${formatTime(d.open)} – ${formatTime(d.close)}`;

/** Every open day on the same hours — the case for almost every shop. */
export function isUniform(week: OpeningHoursDay[]): boolean {
    const open = week.filter((d) => !d.closed);
    return open.every(
        (d) => d.open === open[0]?.open && d.close === open[0]?.close,
    );
}

/** A day that closes before it opens, which no save takes. */
export function hoursBackwards(week: OpeningHoursDay[]): boolean {
    return week.some((d) => !d.closed && d.open >= d.close);
}

/**
 * "Mon–Sat 9:00 AM – 6:00 PM · Sun closed": runs of neighbouring days with
 * the same hours, the way a shop writes them on its door.
 */
export function weekSummary(week: OpeningHoursDay[]): string {
    const runs: { from: number; to: number; day: OpeningHoursDay }[] = [];
    week.forEach((day, i) => {
        const last = runs.at(-1);
        if (last?.to === i - 1 && sameHours(last.day, day)) {
            last.to = i;
        } else {
            runs.push({ from: i, to: i, day });
        }
    });
    return runs
        .map(({ from, to, day }) => {
            const a = SHORT_DAY[week[from]?.day ?? "MON"];
            const b = SHORT_DAY[week[to]?.day ?? "MON"];
            const days = from === to ? a : `${a}–${b}`;
            return day.closed ? `${days} closed` : `${days} ${hours(day)}`;
        })
        .join(" · ");
}

/** "Mon–Wed, Fri": the days at these places in the week, neighbours joined. */
function dayRuns(week: OpeningHoursDay[], at: number[]): string {
    const runs: { from: number; to: number }[] = [];
    for (const i of at) {
        const last = runs.at(-1);
        if (last?.to === i - 1) last.to = i;
        else runs.push({ from: i, to: i });
    }
    return runs
        .map(({ from, to }) => {
            const a = SHORT_DAY[week[from]?.day ?? "MON"];
            const b = SHORT_DAY[week[to]?.day ?? "MON"];
            return from === to ? a : `${a}–${b}`;
        })
        .join(", ");
}

/**
 * The row's one line: the hours most open days keep and the days that keep
 * them ("Mon–Sat · 9:00 AM – 6:00 PM"), then how many open days differ
 * ("+ 2 days with different hours"). "Not set yet" for a week never saved,
 * "Closed every day" for one with no open day. Hours kept by as many days
 * as another's win by coming first in the week.
 */
export function hoursSummary(week: OpeningHoursDay[] | null): string {
    if (!week) return "Not set yet";
    const open = week
        .map((day, at) => ({ day, at }))
        .filter(({ day }) => !day.closed);

    let main: typeof open = [];
    for (const { day } of open) {
        const kept = open.filter((o) => sameHours(day, o.day));
        if (kept.length > main.length) main = kept;
    }
    const first = main.at(0);
    if (!first) return "Closed every day";
    const others = open.length - main.length;
    const more =
        others === 0
            ? ""
            : ` + ${others} ${others === 1 ? "day" : "days"} with different hours`;
    const days = dayRuns(
        week,
        main.map((m) => m.at),
    );
    return `${days} · ${hours(first.day)}${more}`;
}
