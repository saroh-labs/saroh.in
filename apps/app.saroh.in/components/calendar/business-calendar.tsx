"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { usePhone } from "@/components/bookings/calendar/header/use-phone";
import { CalendarMissing } from "@/components/calendar/calendar-missing";
import { CalendarNothing } from "@/components/calendar/calendar-nothing";
import { DayActions, DayPanel } from "@/components/calendar/day-panel";
import { DaySheet } from "@/components/calendar/day-sheet";
import { dayButton, MonthGrid } from "@/components/calendar/month-grid";
import { ExportMonth, MonthStrip } from "@/components/calendar/month-strip";
import { MonthToolbar } from "@/components/calendar/month-toolbar";
import { WhatToShow } from "@/components/calendar/what-to-show";
import { cellOff, dayOffLine } from "@/lib/calendar/days-off";
import { askedDay } from "@/lib/calendar/grid-keys";
import type { Off } from "@/lib/calendar/layers";
import {
    layersFor,
    mainCurrency,
    monthTitle,
    shiftMonth,
} from "@/lib/calendar/layers";
import { calendarCash, moneyByDate, monthEntries } from "@/lib/calendar/money";
import type { ProblemCan } from "@/lib/calendar/problems";
import {
    calendarRange,
    dayShortcuts,
    monthEdges,
    openingDay,
} from "@/lib/calendar/range";
import {
    calendarHref,
    forPerson,
    pickedPerson,
    teamOptions,
} from "@/lib/calendar/team";
import type { CalendarMonth } from "@/lib/calendar/types";
import { weekHref } from "@/lib/calendar/week";

import { TONE_FILL } from "./tones";

/** Between the phone and the full rail the day opens as a sheet. */
const SHEET_WIDTHS = "(min-width: 760px) and (max-width: 1099px)";

function useDaySheet(): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        const mq = window.matchMedia(SHEET_WIDTHS);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(SHEET_WIDTHS).matches,
        () => false,
    );
}

/**
 * Home › Calendar, the month (bookings U13, was Overview; DEC-170):
 * ‹ October 2026 ›, This month, Month | Week and one filter button, What
 * to show (whose things, and a switch per layer with its month's total);
 * the month's money on one line with Export; the month, a line per layer
 * in each day on the desk and a dot per layer on a phone; and the picked
 * day — in a side panel on the desk (BKDCalMonth), a sheet from the right
 * between 760 and 1100px, and a sheet from the foot of a phone
 * (BKMOverviewMonth) — grouped by layer with a link to each record and
 * "Book on this day". Days off are said on their day, and a team of two
 * or more can be narrowed to one person (E24). Amounts are drawn only for
 * someone who may see money (`payment:read`, DEC-098).
 */
export function BusinessCalendar({
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
     * and see amounts at all, `payment:read` (DEC-098).
     */
    can: { order: boolean; book: boolean; money?: boolean } & ProblemCan;
    /** `?day=`: the day to open on, when a key crossed into this month. */
    day?: string;
    /** `?team=`: the person the team filter opens on (E24). */
    team?: string;
}) {
    const router = useRouter();
    // Every layer the month has keeps its switch while one person is picked.
    const layers = layersFor(data);
    const range = calendarRange(data.joinedAt, thisMonth);
    const [off, setOff] = useState<Off>({});
    const people = teamOptions(data);
    const [person, setPerson] = useState(() => pickedPerson(team, people));
    const shown = useMemo(() => forPerson(data, person), [data, person]);
    const hrefFor = (m: string, day?: string) =>
        calendarHref({ month: m, thisMonth, day, team: person });
    // The URL says who is picked, so a link or a reload keeps them; no read.
    const pickPerson = (id: string | null) => {
        setPerson(id);
        window.history.replaceState(
            null,
            "",
            calendarHref({ month: data.month, thisMonth, team: id }),
        );
    };
    const [selected, setSelected] = useState(() => {
        const dates = data.days.map((d) => d.date);
        return askedDay(asked, dates, range) ?? openingDay(dates, today, range);
    });
    const [sheetOpen, setSheetOpen] = useState(false);
    const sheetWidths = useDaySheet();
    const phone = usePhone();

    if (layers.length === 0) return <CalendarNothing />;

    // Money is the permission's (DEC-098); an older page that says nothing
    // leaves it to what the API sent.
    const amounts = can.money ?? true;
    const currency = amounts ? mainCurrency(data) : null;
    const day = shown.days.find((d) => d.date === selected) ?? shown.days.at(0);
    const failed = new Set(data.unavailable.map((u) => u.source));
    // In, out and due (E23): only for `payment:read`, whom the API sent them.
    // The person picked narrows what is drawn; the file stays the month's.
    const narrowed = amounts ? calendarCash(shown, off, currency) : null;
    const cash = narrowed && {
        ...narrowed,
        all: monthEntries(data) ?? narrowed.all,
    };
    const offs = new Map(
        shown.days.flatMap((d) => {
            const o = cellOff(data, d.date, person);
            return o ? [[d.date, o] as const] : [];
        }),
    );

    const pick = (date: string) => {
        setSelected(date);
        if (phone || sheetWidths) setSheetOpen(true);
    };

    // A key moved the day: here, or — past this month's edge — in the month
    // before or after, which opens on that day (E28).
    const move = (date: string) => {
        const m = date.slice(0, 7);
        if (m === data.month) {
            setSelected(date);
            return;
        }
        router.push(hrefFor(m, date), { scroll: false });
    };

    const shortcuts = day
        ? dayShortcuts(day.date, {
              today,
              range,
              layers: data.layers,
              can,
          })
        : [];

    const panel = (
        heading: (title: string) => React.ReactNode,
        actions: boolean,
    ) =>
        day ? (
            <DayPanel
                day={day}
                layers={layers}
                off={off}
                today={today}
                timeZone={data.timezone}
                currency={currency}
                heading={heading}
                shortcuts={shortcuts}
                actions={actions}
                can={can}
                money={cash}
                amounts={amounts}
                offLine={dayOffLine(data, day.date)}
            />
        ) : null;

    const edges = monthEdges(data.month, range);
    const on = layers.filter((l) => !off[l.key]);
    const empty = on.every((l) => (shown.totals[l.key] ?? 0) === 0);
    const where = {
        month: data.month,
        thisMonth,
        today,
        shop: data.layers.includes("orders"),
    };

    return (
        <>
            <MonthToolbar
                title={monthTitle(data.month)}
                prev={{
                    href: hrefFor(shiftMonth(data.month, -1)),
                    label: "Previous month",
                    edge: edges.before,
                }}
                next={{
                    href: hrefFor(shiftMonth(data.month, 1)),
                    label: "Next month",
                    edge: edges.after,
                }}
                current={{
                    label: "This month",
                    href: hrefFor(thisMonth),
                    here: data.month === thisMonth,
                }}
                view={{
                    value: "month",
                    hrefs: {
                        month: hrefFor(data.month),
                        // The week holding the day picked (E25).
                        week: weekHref({
                            day: day?.date ?? today,
                            today,
                            team: person,
                        }),
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
                    />
                }
            />

            {cash ? <MonthStrip {...where} cash={cash} /> : null}

            <CalendarMissing data={data} span="month" />

            <div className="!mt-3.5 grid gap-[18px] min-[1100px]:grid-cols-[minmax(0,1fr)_360px] min-[1100px]:items-start">
                <MonthGrid
                    month={data.month}
                    days={shown.days}
                    range={range}
                    layers={layers}
                    off={off}
                    today={today}
                    selected={day?.date ?? ""}
                    currency={cash?.currency ?? null}
                    money={cash ? moneyByDate(cash.shown) : null}
                    offs={offs}
                    onPick={pick}
                    onMove={move}
                />
                {/* Beside the month on the desk; a sheet below that. */}
                <aside
                    id="calendar-day"
                    aria-labelledby="calendar-day-title"
                    className="min-w-0 rounded-xl border border-border bg-card px-[18px] py-4 max-[1099px]:hidden min-[1100px]:sticky min-[1100px]:top-3"
                >
                    {panel(
                        (title) => (
                            <h2
                                id="calendar-day-title"
                                className="font-display text-[18px] font-semibold tracking-[-0.02em]"
                            >
                                {title}
                            </h2>
                        ),
                        true,
                    )}
                </aside>
            </div>

            {empty ? (
                <p className="!mt-2.5 text-[12.5px] text-muted-foreground">
                    {on.length === 0
                        ? "Nothing is switched on. Choose what to show above."
                        : data.month < thisMonth
                          ? `Nothing happened in ${monthTitle(data.month)}.`
                          : `Nothing on the calendar in ${monthTitle(data.month)} yet.`}
                </p>
            ) : (
                // A phone's key to the dots (the board).
                <div
                    aria-hidden
                    className="!mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12px] text-muted-foreground min-[760px]:hidden"
                >
                    {on.map((l) => (
                        <span
                            key={l.key}
                            className="inline-flex items-center gap-1.5"
                        >
                            <span
                                className={cn(
                                    "size-2.5 rounded-[3px]",
                                    TONE_FILL[l.tone],
                                )}
                            />
                            {l.label}
                        </span>
                    ))}
                    <span>Tap a day to see it</span>
                </div>
            )}

            {cash ? (
                <div className="!mt-3.5 min-[760px]:hidden">
                    <ExportMonth {...where} cash={cash} look="button" />
                </div>
            ) : null}

            <p className="!mt-3 text-[12.5px] text-muted-foreground max-[759px]:hidden">
                Everything here is read from orders, subscriptions, invoices and
                bookings. Nothing is entered on the calendar itself.
                {cash
                    ? " Each day's money is what came in (+) and went out (−) that day."
                    : ""}
            </p>

            <DaySheet
                open={sheetOpen && (phone || sheetWidths)}
                onOpenChange={setSheetOpen}
                // Back on the day in the grid (E28).
                returnTo={() => (day ? dayButton(day.date) : null)}
                bottomOnPhone
                footer={
                    shortcuts.length > 0 ? (
                        <DayActions shortcuts={shortcuts} />
                    ) : undefined
                }
            >
                {(heading) => panel(heading, !phone)}
            </DaySheet>
        </>
    );
}
