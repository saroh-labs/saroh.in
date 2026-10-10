"use client";

import { PageHeader } from "@saroh/ui/page-header";
import { useMemo, useState } from "react";

import { CalendarMissing } from "@/components/calendar/calendar-missing";
import { CalendarNothing } from "@/components/calendar/calendar-nothing";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { DayPanel } from "@/components/calendar/day-panel";
import { DaySheet } from "@/components/calendar/day-sheet";
import { WeekColumns, weekDayButton } from "@/components/calendar/week-columns";
import { WeekHourGrid } from "@/components/calendar/week-hour-grid";
import { dayOffLine } from "@/lib/calendar/days-off";
import type { Off } from "@/lib/calendar/layers";
import { layersFor, mainCurrency } from "@/lib/calendar/layers";
import { calendarCash } from "@/lib/calendar/money";
import type { ProblemCan } from "@/lib/calendar/problems";
import { calendarRange, dayShortcuts } from "@/lib/calendar/range";
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
import { weekColumns, weekSummary } from "@/lib/calendar/week-columns";
import { weekHours } from "@/lib/calendar/week-hours";

/**
 * Home › Calendar's Week (plan 005 E25, R17), after the "Saroh Business
 * Calendar" design: Monday to Sunday as card columns, stepped a week at a
 * time. The same switches as the month apply — the layers, the team filter
 * (E24) — and so do its rules: named problems (E22), money only for a role
 * that reads it (E23, `payment:read`) and days off. A day's header opens
 * its panel as a sheet, at every width, since the columns take the page.
 *
 * A business with a team (Pulse, Kavi Dental) sees the week as an hour grid
 * (E27): bookings and classes by start and length, working hours shaded.
 * Any other keeps the card columns.
 *
 * `data` is the week as read (E20's `from`/`to`), which may cross into the
 * next month; its `month` is the Monday's.
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
    /** May take an order, a booking, or send a reminder (E22): `*:write`. */
    can: { order: boolean; book: boolean } & ProblemCan;
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

    const hrefFor = (day: string, who: string | null = person) =>
        weekHref({ day, today, team: who });
    // The URL says who is picked, so a link or a reload keeps them; no read.
    const pickPerson = (id: string | null) => {
        setPerson(id);
        window.history.replaceState(null, "", hrefFor(selected, id));
    };

    if (layers.length === 0) return <CalendarNothing />;

    const currency = mainCurrency(data);
    const failed = new Set(data.unavailable.map((u) => u.source));
    // In and out (E23): only for `payment:read`, whom the API sent them.
    const cash = calendarCash(shown, off, currency);
    const title = weekTitle(from);
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
    const day: CalendarDay = shown.days.find((d) => d.date === selected) ?? {
        date: selected,
        layers: {},
        toActOn: 0,
    };
    const summary = weekSummary({ week: shown, layers, off, money: !!cash });

    const pick = (date: string) => {
        setSelected(date);
        setSheetOpen(true);
    };

    return (
        <>
            <PageHeader
                holdsData={false}
                breadcrumb={["Home", "Overview"]}
                title={title}
                className="mb-0"
                actions={
                    summary ? (
                        <span className="w-full text-right text-[12.5px] text-muted-foreground sm:w-auto">
                            {summary}
                        </span>
                    ) : undefined
                }
            />

            <CalendarToolbar
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
                    here: isThisWeek(from, today),
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
                people={people}
                person={person}
                onPerson={pickPerson}
                layers={layers}
                off={off}
                totals={shown.totals}
                failed={failed}
                onToggle={(key) => setOff((o) => ({ ...o, [key]: !o[key] }))}
            />

            <CalendarMissing data={data} span="week" />

            <div className="!mt-3.5 flex">
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
                        onPick={pick}
                    />
                ) : (
                    <WeekColumns
                        title={title}
                        columns={columns}
                        onPick={pick}
                    />
                )}
            </div>

            <p className="!mt-3 text-[11.5px] text-muted-foreground">
                Everything here is read from orders, subscriptions, invoices and
                bookings — nothing is entered on the calendar itself. Open a day
                from its date to see all of it.
                {cash
                    ? " Each day's money is what came in (+) and went out (−) that day."
                    : ""}
            </p>

            <DaySheet
                open={sheetOpen}
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
                        shortcuts={dayShortcuts(day.date, {
                            today,
                            range,
                            layers: data.layers,
                            can,
                        })}
                        can={can}
                        money={cash}
                        offLine={dayOffLine(data, day.date)}
                    />
                )}
            </DaySheet>
        </>
    );
}
