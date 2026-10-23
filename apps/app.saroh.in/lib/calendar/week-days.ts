import { formatDay, formatWeekday } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { firstName } from "@/lib/names";
import { zoneShortName } from "@/lib/services/time-picker";

import type { DayRow } from "./day-rows";
import { dayRow } from "./day-rows";
import { cellOff } from "./days-off";
import type { LayerStyle, LayerTone, Off } from "./layers";
import { dayCount, describeItem } from "./layers";
import type { MoneySum } from "./money";
import { minorMoney, sumEntries } from "./money";
import type { ProblemCan } from "./problems";
import { problemAction, problemOf } from "./problems";
import type { CalendarRange } from "./range";
import { inRange } from "./range";
import type { CalendarDay, CalendarMonth, MoneyEntry } from "./types";
import { isTimed } from "./week-hours";

/**
 * The Calendar week's words (bookings U14, #1030; BKMOverviewWeek and
 * BKDCalWeek): the week's totals on one line, how many things are on each
 * day, a day the business is closed — "Closed on Sundays" — and the picked
 * day's list on a phone. Pure, so the phone and the desk say the same thing
 * and the rules are tested without a browser.
 */

/** A day nobody takes bookings on, and why, in the boards' words. */
export interface ClosedDay {
    /** "Closed on Sundays", "Closed · Diwali", "Meera doesn't work on Sundays". */
    title: string;
    /** "Nothing is on this day." */
    line: string;
}

/**
 * Whether a day is closed: a closure, everyone (or the person picked) off
 * the whole day, or — where the team's hours are known — nobody shown
 * working that day while someone works another day of the week. A team
 * that never set its hours is not drawn as always closed. Null when open.
 */
export function closedDay(
    week: Pick<CalendarMonth, "daysOff" | "timezone" | "staff" | "hours">,
    date: string,
    person: string | null,
): ClosedDay | null {
    const line = "Nothing is on this day.";
    const off = cellOff(week, date, person);
    if (off?.striped) return { title: off.title, line };
    if (!week.hours) return null;
    const whose = week.hours.filter((h) => !person || h.staffId === person);
    if (whose.length === 0) return null;
    if (whose.some((h) => h.date === date)) return null;
    const days = `${formatWeekday(date, "UTC")}s`;
    if (!person) return { title: `Closed on ${days}`, line };
    const name = (week.staff ?? []).find((s) => s.id === person)?.name;
    return {
        title: name
            ? `${firstName(name)} doesn't work on ${days}`
            : `Not working on ${days}`,
        line,
    };
}

/** "11 on", "Closed", or "None" on an open day with nothing on it. */
export function dayOnWords(n: number, closed: boolean): string {
    if (n > 0) return `${n} on`;
    return closed ? "Closed" : "None";
}

/** The week's money in and out, among the layers switched on. */
export function weekMoney(
    shown: MoneyEntry[],
    currency: string,
): { in: string; out: string } {
    const sum: MoneySum = sumEntries(shown);
    return {
        in: minorMoney(sum.in, currency),
        out: minorMoney(sum.out, currency),
    };
}

/**
 * The week's totals on one line (the boards): "This week · 38 bookings ·
 * 11 classes · 22 invoices", then on the desk "· In ₹… · Out ₹… · times in
 * IST". Another week leaves "This week" off. Every layer off, or nothing
 * on, says so instead.
 */
export function weekTotals({
    week,
    layers,
    off,
    current,
    title,
    past,
    money = null,
    zone = null,
}: {
    /** The week as read, narrowed to the person picked. */
    week: CalendarMonth;
    layers: LayerStyle[];
    off: Off;
    /** The week today is in. */
    current: boolean;
    /** "19 to 25 Oct", for an empty week. */
    title: string;
    /** The whole week is before today. */
    past: boolean;
    /** `payment:read` only: what came in and went out. */
    money?: { in: string; out: string } | null;
    /** The business's zone, said on the desk: "IST". */
    zone?: string | null;
}): { text: string; empty: boolean } {
    const on = layers.filter((l) => !off[l.key]);
    if (on.length === 0) {
        return {
            text: "Nothing is switched on. Choose what to show above.",
            empty: true,
        };
    }
    const counts = on.map((l) => ({
        layer: l,
        n: week.days.reduce((s, d) => s + (d.layers[l.key]?.count ?? 0), 0),
    }));
    if (counts.every((c) => c.n === 0)) {
        return {
            text: past
                ? `Nothing happened from ${title}.`
                : current
                  ? "Nothing on the calendar this week yet."
                  : `Nothing on the calendar from ${title} yet.`,
            empty: true,
        };
    }
    const parts = [
        current ? "This week" : null,
        ...counts.map((c) => count(c.n, c.layer.one, c.layer.many)),
        money ? `In ${money.in}` : null,
        money ? `Out ${money.out}` : null,
        zone ? `times in ${zone}` : null,
    ];
    return { text: parts.filter(Boolean).join(" · "), empty: false };
}

/** "IST" for the business's zone, at the week's Monday. */
export function weekZone(timeZone: string, monday: string): string {
    return zoneShortName(timeZone, new Date(`${monday}T06:30:00Z`));
}

/** One day of the phone's strip (BKMOverviewWeek). */
export interface StripDay {
    date: string;
    /** "Today", or "Mon". */
    w: string;
    /** "19". */
    d: string;
    /** "11 on", "Closed", "None". */
    n: string;
    /** The day in words for a screen reader. */
    label: string;
    isToday: boolean;
    /** Closed: striped. */
    closed: boolean;
    /** Before the business joined, or past what can be planned. */
    outside: boolean;
}

export function stripDays({
    week,
    dates,
    layers,
    off,
    today,
    range,
    person,
}: {
    week: CalendarMonth;
    dates: string[];
    layers: LayerStyle[];
    off: Off;
    today: string;
    range: CalendarRange;
    person: string | null;
}): StripDay[] {
    return dates.map((date) => {
        const day = week.days.find((d) => d.date === date);
        const n = day ? dayCount(day, layers, off) : 0;
        const closed = closedDay(week, date, person);
        const isToday = date === today;
        const words = dayOnWords(n, closed !== null);
        return {
            date,
            w: isToday ? "Today" : formatWeekday(date, "UTC", "short"),
            d: String(Number(date.slice(8))),
            n: words,
            label: [
                formatDay(date, { today, weekday: "long", year: "never" }),
                isToday ? "today" : null,
                n > 0
                    ? count(n, "thing")
                    : closed
                      ? closed.title
                      : "nothing on",
            ]
                .filter(Boolean)
                .join(", "),
            isToday,
            closed: closed !== null,
            outside: !inRange(date, range),
        };
    });
}

/** A row of the phone's day list: a thing with its time. */
export interface WeekDayRow extends DayRow {
    key: string;
    tone: LayerTone;
    /** The fix for a named problem (E22), in the panel's words. */
    action: string | null;
}

/** A thing with no time of its own: a chip at the top of the day. */
export interface WeekDayChip {
    key: string;
    title: string;
    href: string;
    bad: boolean;
}

/**
 * The picked day on a phone (BKMOverviewWeek): what has no time of its own
 * as chips at the top — the desk's All day row — then everything else in
 * time order, each leading with its time and who it is for. With a team,
 * "all day" is what the hour grid can't place (no length); without one,
 * what has no time at all. `more` is the bookings and classes the day
 * holds past the ones read, for "N more · open the day in Bookings".
 */
export function weekDayList(
    day: CalendarDay,
    {
        layers,
        off,
        today,
        timeZone,
        byHour,
        can,
    }: {
        layers: LayerStyle[];
        off: Off;
        today: string;
        timeZone: string;
        /** The business has a team: its week is an hour grid on the desk. */
        byHour: boolean;
        can: ProblemCan;
    },
): { chips: WeekDayChip[]; rows: WeekDayRow[]; more: number } {
    const ahead = day.date > today;
    const shop = layers.some((l) => l.key === "orders");
    const chips: WeekDayChip[] = [];
    const rows: (WeekDayRow & { when: string })[] = [];
    let more = 0;
    for (const layer of layers) {
        if (off[layer.key]) continue;
        const cell = day.layers[layer.key];
        if (!cell) continue;
        // The diary opens on the day; any other layer lists all it read.
        if (layer.key === "bookings" || layer.key === "classes") {
            more += Math.max(0, cell.count - cell.items.length);
        }
        for (const item of cell.items) {
            const key = `${layer.key}:${item.id}`;
            const untimed = byHour ? !isTimed(item) : !item.at;
            if (untimed) {
                const line = describeItem(layer.key, item, { timeZone, ahead });
                chips.push({
                    key,
                    title: line.title,
                    href: line.href,
                    bad: line.flag?.tone === "bad",
                });
                continue;
            }
            const problem = problemOf(layer.key, item, {
                date: day.date,
                today,
            });
            rows.push({
                ...dayRow(layer.key, item, { timeZone, ahead }),
                key,
                tone: layer.tone,
                action: problem ? problemAction(problem, { can, shop }) : null,
                when: item.at ?? "~",
            });
        }
    }
    // Stable: things at the same time keep the layers' reading order.
    const sorted = rows
        .map((r, i) => ({ r, i }))
        .sort((a, b) =>
            a.r.when < b.r.when ? -1 : a.r.when > b.r.when ? 1 : a.i - b.i,
        )
        .map(({ r: { when: _when, ...row } }) => row);
    return { chips, rows: sorted, more };
}
