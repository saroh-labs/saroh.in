"use client";

import { useMemo, useState } from "react";

import { usePhone } from "@/components/bookings/calendar/header/use-phone";
import { CalendarMissing } from "@/components/calendar/calendar-missing";
import { CalendarNothing } from "@/components/calendar/calendar-nothing";
import { DayPanel } from "@/components/calendar/day-panel";
import { DaySheet } from "@/components/calendar/day-sheet";
import { MonthToolbar } from "@/components/calendar/month-toolbar";
import { WeekColumns, weekDayButton } from "@/components/calendar/week-columns";
import type { DayExtra } from "@/components/calendar/week-day-head";
import { WeekHourGrid } from "@/components/calendar/week-hour-grid";
import { WeekDay, WeekStrip } from "@/components/calendar/week-strip";
import { WhatToShow } from "@/components/calendar/what-to-show";
import { dayOffLine } from "@/lib/calendar/days-off";
import type { Off } from "@/lib/calendar/layers";
import { dayCount, layersFor, mainCurrency } from "@/lib/calendar/layers";
import { calendarCash, minorMoney, sumEntries } from "@/lib/calendar/money";
import type { ProblemCan } from "@/lib/calendar/problems";
import { calendarRange, dayShortcuts, inRange } from "@/lib/calendar/range";
import {
    calendarHref,
    forPerson,
    pickedPerson,
    teamOptions,
} from "@/lib/calendar/team";
import type { CalendarDay, CalendarMonth } from "@/lib/calendar/types";
import {
    addDays,
    isThisWeek,
    mondayOf,
    weekDates,
    weekDay,
    weekEdges,
    weekHref,
    weekTitle,
} from "@/lib/calendar/week";
import { weekColumns } from "@/lib/calendar/week-columns";
import {
    closedDay,
    stripDays,
    weekDayList,
    weekMoney,
    weekTotals,
    weekZone,
} from "@/lib/calendar/week-days";
import { weekHours } from "@/lib/calendar/week-hours";
import { layersOn } from "@/lib/calendar/what-to-show";

const BOOK = "Book on this day";

/**
 * Home › Calendar's week (bookings U14, #1030; was Overview week, plan 005
 * E25), after BKDCalWeek and BKMOverviewWeek. One top for both sizes, the
 * month's (U13): ‹ 19 to 25 Oct ›, This week, Month | Week and the one
 * filter button, What to show (whose things, and a switch per layer with
 * the week's total). Then the week's totals on one line.
 *
 * On the desk the week stays a grid: an hour grid for a business with a
 * team (E27), card columns for any other (E25). Each day's head says how
 * many things are on, its money in and out, who is off and its named
 * problem, and offers Book on that day, or says it is closed ("Closed on
 * Sundays", with "Open hours on this day"). A day's head opens the whole
 * day in a side panel. On a phone there is no sideways grid: a strip of the
 * seven days with each day's count, and the picked day's list below it,
 * Book, its money in and out, and every thing in time order.
 *
 * Amounts only for `payment:read` (DEC-098). `data` is the week as read
 * (E20's `from`/`to`), which may cross into the next month; its `month` is
 * the Monday's.
 */
export function BusinessWeek({
    data,
    today,
    thisMonth,
    can,
    day: asked,
    team,
}: {
    data: CalendarMonth;
    /** "YYYY-MM-DD" and "YYYY-MM" now, in the business's zone. */
    today: string;
    thisMonth: string;
    /**
     * May take an order, a booking, or send a reminder (E22): `*:write`;
     * see amounts at all, `payment:read` (DEC-098); change hours,
     * `hours:write`.
     */
    can: {
        order: boolean;
        book: boolean;
        money?: boolean;
        hours?: boolean;
    } & ProblemCan;
    /** `?day=`: the day picked in this week. */
    day?: string;
    /** `?team=`: the person the team filter opens on (E24). */
    team?: string;
}) {
    // The read's first day is the Monday (its `from` is an instant).
    const from = mondayOf(data.days[0]?.date ?? today);
    const dates = weekDates(from);
    const layers = layersFor(data);
    const range = calendarRange(data.joinedAt, thisMonth);
    const [off, setOff] = useState<Off>({});
    const people = teamOptions(data);
    const [person, setPerson] = useState(() => pickedPerson(team, people));
    const shown = useMemo(() => forPerson(data, person), [data, person]);
    const [selected, setSelected] = useState(() =>
        weekDay(asked, from, today, range),
    );
    const [sheetOpen, setSheetOpen] = useState(false);
    const phone = usePhone();

    const hrefFor = (day: string, who: string | null = person) =>
        weekHref({ day, today, team: who });
    // The URL says who is picked, so a link or a reload keeps them; no read.
    const pickPerson = (id: string | null) => {
        setPerson(id);
        window.history.replaceState(null, "", hrefFor(selected, id));
    };

    if (layers.length === 0) return <CalendarNothing />;

    // Money is the permission's (DEC-098); an older page that says nothing
    // leaves it to what the API sent.
    const amounts = can.money ?? true;
    const currency = amounts ? mainCurrency(data) : null;
    const failed = new Set(data.unavailable.map((u) => u.source));
    // In and out (E23): only for `payment:read`, whom the API sent them.
    const cash = amounts ? calendarCash(shown, off, currency) : null;
    const title = weekTitle(from, today);
    const current = isThisWeek(from, today);
    const columns = weekColumns({
        week: shown,
        dates,
        layers,
        off,
        today,
        selected,
        range,
        cash,
        person,
    });
    const edges = weekEdges(from, range);
    const shortcutsOf = (date: string) =>
        dayShortcuts(date, { today, range, layers: data.layers, can });
    const takesBookings = data.layers.includes("bookings");

    // What the week adds to each day: Book, or why it is closed.
    const extras = new Map<string, DayExtra>(
        dates.map((date) => {
            const closed = closedDay(data, date, person);
            const reach = date >= today && inRange(date, range);
            return [
                date,
                {
                    closed,
                    book: closed
                        ? null
                        : (shortcutsOf(date).find((s) => s.label === BOOK)
                              ?.href ?? null),
                    openHours:
                        closed && can.hours && takesBookings && reach
                            ? `/bookings?date=${encodeURIComponent(date)}&layout=day`
                            : null,
                },
            ];
        }),
    );

    const day: CalendarDay = shown.days.find((d) => d.date === selected) ?? {
        date: selected,
        layers: {},
        toActOn: 0,
    };
    const extra = extras.get(selected) ?? {
        closed: null,
        book: null,
        openHours: null,
    };
    const totals = (desk: boolean) =>
        weekTotals({
            week: shown,
            layers,
            off,
            current,
            title,
            past: addDays(from, 6) < today,
            money: desk && cash ? weekMoney(cash.shown, cash.currency) : null,
            zone: desk ? weekZone(data.timezone, from) : null,
        });
    const daySum = cash
        ? sumEntries(cash.shown.filter((e) => e.date === selected))
        : null;
    const list = weekDayList(day, {
        layers,
        off,
        today,
        timeZone: data.timezone,
        byHour: !!data.hasStaff,
        can,
    });

    const pick = (date: string) => {
        setSelected(date);
        if (!phone) setSheetOpen(true);
    };
    const on = layersOn(layers, off);

    return (
        <>
            <MonthToolbar
                title={title}
                // A week on keeps the day of the week picked (the design).
                prev={{
                    href: hrefFor(addDays(selected, -7)),
                    label: "Previous week",
                    edge: edges.before,
                }}
                next={{
                    href: hrefFor(addDays(selected, 7)),
                    label: "Next week",
                    edge: edges.after,
                }}
                current={{
                    label: "This week",
                    href: hrefFor(today),
                    here: current,
                }}
                view={{
                    value: "week",
                    hrefs: {
                        // The month of the day picked, open on that day.
                        month: calendarHref({
                            month: selected.slice(0, 7),
                            thisMonth,
                            day: selected === today ? undefined : selected,
                            team: person,
                        }),
                        week: hrefFor(selected),
                    },
                }}
                filter={
                    <WhatToShow
                        people={people}
                        person={person}
                        onPerson={pickPerson}
                        layers={layers}
                        off={off}
                        totals={shown.totals}
                        failed={failed}
                        onToggle={(key) =>
                            setOff((o) => ({ ...o, [key]: !o[key] }))
                        }
                        span="week"
                    />
                }
            />

            <p
                data-week-totals="desk"
                className="!mt-2 text-[13px] tabular-nums text-muted-foreground max-[759px]:hidden"
            >
                {totals(true).text}
            </p>

            <CalendarMissing data={data} span="week" />

            {/* A phone: the strip of seven days and the picked day's list. */}
            <div className="min-[760px]:hidden">
                <WeekStrip
                    days={stripDays({
                        week: shown,
                        dates,
                        layers,
                        off,
                        today,
                        range,
                        person,
                    })}
                    picked={selected}
                    onPick={pick}
                />
                <p
                    data-week-totals="phone"
                    className="mt-1.5 text-center text-[12px] tabular-nums text-muted-foreground"
                >
                    {totals(false).text}
                </p>
                <WeekDay
                    date={selected}
                    today={today}
                    count={dayCount(day, layers, off)}
                    shortcuts={shortcutsOf(selected).filter(
                        (s) => !extra.closed || s.label !== BOOK,
                    )}
                    money={
                        daySum && cash && (daySum.in || daySum.out)
                            ? {
                                  in: minorMoney(daySum.in, cash.currency),
                                  out: minorMoney(daySum.out, cash.currency),
                              }
                            : null
                    }
                    offLine={extra.closed ? null : dayOffLine(data, selected)}
                    chips={list.chips}
                    rows={list.rows}
                    more={list.more}
                    extra={extra}
                    hidden={layers.some(
                        (l) =>
                            off[l.key] && (day.layers[l.key]?.count ?? 0) > 0,
                    )}
                />
                <p className="!mt-3 text-[12.5px] text-muted-foreground">
                    Each day shows how many things are on.
                    {on === "nothing"
                        ? ""
                        : ` Tap a day for its ${on}, and tap one to open it.`}
                </p>
            </div>

            {/* The desk: the grid, never drawn on a phone. */}
            {phone ? null : (
                <div className="!mt-3.5 flex max-[759px]:hidden">
                    {data.hasStaff ? (
                        <WeekHourGrid
                            title={title}
                            days={weekHours({
                                week: shown,
                                columns,
                                layers,
                                off,
                                today,
                                person,
                            })}
                            extras={extras}
                            onPick={pick}
                        />
                    ) : (
                        <WeekColumns
                            title={title}
                            columns={columns}
                            extras={extras}
                            onPick={pick}
                        />
                    )}
                </div>
            )}

            <p className="!mt-3 text-[12.5px] text-muted-foreground max-[759px]:hidden">
                Each day shows how many things are on. Click a day&apos;s date
                to see all of it, or a booking or class to open it
                {can.book && takesBookings
                    ? ", or Book to add one on that day"
                    : ""}
                . Everything here is read from orders, subscriptions, invoices
                and bookings.
                {cash
                    ? " Each day's money is what came in (+) and went out (−) that day."
                    : ""}
            </p>

            <DaySheet
                open={sheetOpen && !phone}
                onOpenChange={setSheetOpen}
                returnTo={() => weekDayButton(selected)}
            >
                {(heading) => (
                    <DayPanel
                        day={day}
                        layers={layers}
                        off={off}
                        today={today}
                        timeZone={data.timezone}
                        currency={currency}
                        heading={heading}
                        shortcuts={shortcutsOf(day.date)}
                        can={can}
                        money={cash}
                        // No amount without the money permission (DEC-098).
                        amounts={amounts}
                        offLine={dayOffLine(data, day.date)}
                    />
                )}
            </DaySheet>
        </>
    );
}
