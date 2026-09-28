"use client";

import { PageHeader } from "@saroh/ui/page-header";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { CalendarMissing } from "@/components/calendar/calendar-missing";
import { CalendarNothing } from "@/components/calendar/calendar-nothing";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { DayPanel } from "@/components/calendar/day-panel";
import { DaySheet } from "@/components/calendar/day-sheet";
import { dayButton, MonthGrid } from "@/components/calendar/month-grid";
import { MonthStrip } from "@/components/calendar/month-strip";
import { cellOff, dayOffLine } from "@/lib/calendar/days-off";
import { askedDay } from "@/lib/calendar/grid-keys";
import type { Off } from "@/lib/calendar/layers";
import {
    layersFor,
    mainCurrency,
    monthSummary,
    monthTitle,
    shiftMonth,
} from "@/lib/calendar/layers";
import {
    calendarCash,
    moneyByDate,
    monthEntries,
    wholeMoney,
} from "@/lib/calendar/money";
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
 * Home › Calendar, after the "Saroh Business Calendar" design: the month, a
 * switch per layer with its count, the day's chips and takings, and the
 * picked day grouped by layer with a link to each record. Days off are
 * said on their day, and a team of two or more can be narrowed to one
 * person (E24).
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
    /** May take an order, a booking, or send a reminder (E22): `*:write`. */
    can: { order: boolean; book: boolean } & ProblemCan;
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

    if (layers.length === 0) return <CalendarNothing />;

    const currency = mainCurrency(data);
    const day = shown.days.find((d) => d.date === selected) ?? shown.days.at(0);
    const failed = new Set(data.unavailable.map((u) => u.source));
    // In, out and due (E23): only for `payment:read`, whom the API sent them.
    // The person picked narrows what is drawn; the file stays the month's.
    const narrowed = calendarCash(shown, off, currency);
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
        if (sheetWidths) setSheetOpen(true);
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

    const panel = (heading: (title: string) => React.ReactNode) =>
        day ? (
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
        ) : null;

    const edges = monthEdges(data.month, range);

    return (
        <>
            <PageHeader
                breadcrumb={["Home", "Calendar"]}
                title={monthTitle(data.month)}
                className="mb-0"
                actions={
                    // With the strip, the money is said there (the design).
                    cash ? undefined : (
                        <span className="w-full text-right text-[12.5px] text-muted-foreground sm:w-auto">
                            {monthSummary({
                                month: shown,
                                layers,
                                off,
                                today,
                                money: wholeMoney,
                            })}
                        </span>
                    )
                }
            />

            <CalendarToolbar
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
                people={people}
                person={person}
                onPerson={pickPerson}
                layers={layers}
                off={off}
                totals={shown.totals}
                failed={failed}
                onToggle={(key) => setOff((o) => ({ ...o, [key]: !o[key] }))}
            />

            {cash ? (
                <MonthStrip
                    month={data.month}
                    cash={cash}
                    thisMonth={thisMonth}
                    today={today}
                    shop={data.layers.includes("orders")}
                />
            ) : null}

            <CalendarMissing data={data} span="month" />

            <div className="!mt-3.5 flex flex-wrap items-start gap-4">
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
                {/* Beside the month on the desk, under it on a phone; a
                    sheet in between (below). */}
                <div
                    id="calendar-day"
                    role="region"
                    aria-labelledby="calendar-day-title"
                    className="min-w-0 flex-[2_1_280px] rounded-xl border border-border bg-card px-4 py-3.5 max-[1099px]:min-[760px]:hidden min-[1100px]:sticky min-[1100px]:top-3"
                >
                    {panel((title) => (
                        <h2
                            id="calendar-day-title"
                            className="font-display text-[16px] font-semibold tracking-[-0.02em]"
                        >
                            {title}
                        </h2>
                    ))}
                </div>
            </div>

            <p className="!mt-3 text-[11.5px] text-muted-foreground">
                Everything here is read from orders, subscriptions, invoices and
                bookings — nothing is entered on the calendar itself.{" "}
                <span className="min-[760px]:hidden">
                    Each dot is a layer with something that day; red means
                    something that needs you. Tap a day to see it.
                </span>
                {cash ? (
                    <span className="max-[759px]:hidden">
                        Each day&apos;s money is what came in (+) and went out
                        (−) that day.
                    </span>
                ) : null}
            </p>

            <DaySheet
                open={sheetOpen && sheetWidths}
                onOpenChange={setSheetOpen}
                // Back on the day in the grid (E28).
                returnTo={() => (day ? dayButton(day.date) : null)}
            >
                {panel}
            </DaySheet>
        </>
    );
}
