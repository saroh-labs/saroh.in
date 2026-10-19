"use client";

import { formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useRef } from "react";

import type { CellOff } from "@/lib/calendar/days-off";
import { gridKeyTarget, isGridKey } from "@/lib/calendar/grid-keys";

import type { LayerStyle, Off } from "@/lib/calendar/layers";
import {
    dayChips,
    dayCount,
    leadingBlanks,
    monthTitle,
} from "@/lib/calendar/layers";
import type { MoneySum } from "@/lib/calendar/money";
import { cellMoney, minorMoney } from "@/lib/calendar/money";
import type { CalendarRange } from "@/lib/calendar/range";
import { inRange } from "@/lib/calendar/range";
import type { CalendarDay } from "@/lib/calendar/types";

import { TONE_FILL } from "./tones";

const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Chips a desk cell holds before it is full; dots a phone cell holds. */
const DESK_CHIPS = 3;
const PHONE_DOTS = 5;

/** A phone's rows are ruled across; the desk's days are boxed. */
const PHONE_EDGE = "border-t border-foreground/[0.06] min-[760px]:border-t-0";
const DESK_EDGE =
    "min-[760px]:border-b min-[760px]:border-r min-[760px]:border-foreground/10";

/**
 * A day a key moved to in another month: that month loads as a new page, and
 * its grid takes focus back on this day when it mounts (E28).
 */
let carried: string | null = null;

/** The day button for a date, for moving focus onto it. */
export function dayButton(date: string): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(
        `#calendar-grid [data-day="${date}"]`,
    );
}

/**
 * The month: a week a row from Monday, each day a button with a line per
 * layer — its named problem first ("1 late order", "2 need you"; E22), then
 * a square of the layer's colour and its count — and, for a role that
 * reads money (`payment:read`, E23), what came in and went out that day:
 * "+₹3.8k" over "−₹200" (BKDCalMonth).
 * Below 760px the date sits in a ring — filled for the day picked, outlined
 * for today — over a dot per layer, red when something needs acting on
 * (BKMOverviewMonth); a tap opens the day in a sheet. A day the calendar does
 * not reach — before the business joined, or past what can be planned — is
 * greyed and cannot be picked. A day off says so under its date — "Closed",
 * "Dr. Pillai off", "2 off" (E24) — and is striped when the business is
 * closed or the person the team filter picked is off.
 *
 * From the keyboard it is one tab stop (E28): the picked day holds it, and
 * the arrows, Home/End (the week) and PageUp/PageDown (the month) move it,
 * never past the days the calendar reaches. A move into another month asks
 * for that month through `onMove`; Enter or Space opens the day as a click
 * does.
 */
export function MonthGrid({
    month,
    days,
    range,
    layers,
    off,
    today,
    selected,
    currency,
    money,
    offs,
    onPick,
    onMove,
}: {
    month: string;
    days: CalendarDay[];
    /** The days the calendar reaches; the rest are greyed. */
    range: CalendarRange;
    layers: LayerStyle[];
    off: Off;
    today: string;
    selected: string;
    currency: string | null;
    /** Each day's money, for the layers switched on; null: none drawn. */
    money: Map<string, MoneySum> | null;
    /** Who is off each day, by date (E24); a day nobody is off is absent. */
    offs: Map<string, CellOff>;
    onPick: (date: string) => void;
    /** A key moved to this day — in this month, or the one before or after. */
    onMove: (date: string) => void;
}) {
    // Focus follows a key: to the new day once it is drawn as picked.
    const pending = useRef<string | null>(null);
    useEffect(() => {
        const want = pending.current ?? (carried === selected ? carried : null);
        if (want !== selected) return;
        pending.current = null;
        carried = null;
        dayButton(selected)?.focus();
    }, [selected]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!isGridKey(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        const to = gridKeyTarget(e.key, selected, range);
        if (!to) return;
        if (to.slice(0, 7) === month) pending.current = to;
        else carried = to;
        onMove(to);
    };

    const blanks = leadingBlanks(month);
    const trailing = (7 - ((blanks + days.length) % 7)) % 7;
    // The picked day holds the tab stop; before one is drawn, the first day
    // the calendar reaches does.
    const tabStop =
        days.find((d) => d.date === selected && inRange(d.date, range))?.date ??
        days.find((d) => inRange(d.date, range))?.date;

    const blank = (key: string) => (
        <div
            key={key}
            role="gridcell"
            aria-hidden
            className={cn(
                PHONE_EDGE,
                "h-[52px] min-[760px]:h-auto min-[760px]:min-h-[104px] min-[760px]:bg-neutral-50 dark:min-[760px]:bg-muted",
                DESK_EDGE,
            )}
        />
    );

    return (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div
                aria-hidden
                className="grid grid-cols-7 pb-1 pt-1.5 min-[760px]:border-b min-[760px]:border-border min-[760px]:p-0"
            >
                {DOWS.map((d) => (
                    <div
                        key={d}
                        className="min-[760px]:label text-center text-[11.5px] font-semibold text-muted-foreground min-[760px]:px-2.5 min-[760px]:pb-2 min-[760px]:pt-2.5 min-[760px]:text-left"
                    >
                        <span className="min-[760px]:hidden">{d[0]}</span>
                        <span className="max-[759px]:hidden">{d}</span>
                    </div>
                ))}
            </div>
            <div
                id="calendar-grid"
                role="grid"
                aria-label={monthTitle(month)}
                onKeyDown={onKeyDown}
                className="grid grid-cols-7"
            >
                {weeks([
                    ...Array.from({ length: blanks }, (_, i) => blank(`b${i}`)),
                    ...days.map((day) => {
                        const outside = !inRange(day.date, range);
                        const past = day.date < today;
                        const isToday = day.date === today;
                        const on = day.date === selected;
                        const chips = dayChips(day, layers, off, today);
                        const sum = money?.get(day.date);
                        const dayOff = offs.get(day.date);
                        const cash =
                            currency && money
                                ? cellMoney(sum, currency)
                                : { in: "", out: "" };
                        const n = dayCount(day, layers, off);
                        // The named problem, said as the chip says it (E22).
                        const problem = chips.find((c) => c.key === "act");
                        const label = [
                            `${formatDay(day.date, { today, weekday: "short" })}${isToday ? ", today" : ""}: ${
                                n ? count(n, "thing") : "nothing"
                            }`,
                            dayOff?.title ?? null,
                            problem?.text ?? null,
                            sum?.in && currency
                                ? `${minorMoney(sum.in, currency)} in`
                                : null,
                            sum?.out && currency
                                ? `${minorMoney(sum.out, currency)} out`
                                : null,
                        ]
                            .filter(Boolean)
                            .join(", ");
                        return (
                            <button
                                key={day.date}
                                type="button"
                                role="gridcell"
                                data-day={day.date}
                                tabIndex={day.date === tabStop ? 0 : -1}
                                onClick={() => onPick(day.date)}
                                disabled={outside}
                                aria-label={label}
                                aria-selected={outside ? undefined : on}
                                aria-current={isToday ? "date" : undefined}
                                className={cn(
                                    PHONE_EDGE,
                                    DESK_EDGE,
                                    // A phone: the date in a ring, its dots
                                    // under it (BKMOverviewMonth).
                                    "flex h-[52px] w-full min-w-0 flex-col items-center gap-1 pt-1.5 font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                    // The desk: the date, the day's money and
                                    // a line per layer (BKDCalMonth).
                                    "min-[760px]:h-auto min-[760px]:min-h-[104px] min-[760px]:items-stretch min-[760px]:gap-[3px] min-[760px]:p-2 min-[760px]:text-left",
                                    outside
                                        ? "cursor-default min-[760px]:bg-neutral-50 dark:min-[760px]:bg-muted"
                                        : on
                                          ? "cursor-pointer bg-card min-[760px]:ring-2 min-[760px]:ring-inset min-[760px]:ring-foreground"
                                          : "cursor-pointer bg-card hover:bg-muted active:bg-muted/70",
                                    // Closed, or the person picked is off:
                                    // stripes over the day's own fill, so
                                    // hover still shows (E24).
                                    dayOff?.striped &&
                                        !outside &&
                                        !on &&
                                        "bg-[repeating-linear-gradient(135deg,transparent_0_6px,hsl(var(--neutral-50))_6px_12px)] dark:bg-[repeating-linear-gradient(135deg,transparent_0_6px,hsl(var(--muted))_6px_12px)]",
                                )}
                            >
                                <span className="flex items-baseline gap-1.5">
                                    <span
                                        className={cn(
                                            "grid size-7 place-items-center rounded-full text-[14px]",
                                            "min-[760px]:block min-[760px]:size-auto min-[760px]:rounded-none min-[760px]:font-display min-[760px]:text-[15px] min-[760px]:font-semibold",
                                            outside
                                                ? "font-medium text-neutral-400 dark:text-muted-foreground"
                                                : on
                                                  ? "bg-primary font-bold text-primary-foreground min-[760px]:bg-transparent min-[760px]:text-foreground"
                                                  : isToday
                                                    ? "font-bold text-foreground shadow-[inset_0_0_0_1.5px_hsl(var(--foreground))] min-[760px]:shadow-none"
                                                    : past
                                                      ? "font-medium text-muted-foreground"
                                                      : "font-medium text-foreground",
                                            // The desk marks today in red,
                                            // picked or not (the board).
                                            isToday &&
                                                !outside &&
                                                "min-[760px]:text-destructive",
                                        )}
                                    >
                                        {Number(day.date.slice(8))}
                                    </span>
                                    <span className="flex-1 max-[759px]:hidden" />
                                    {cash.in || cash.out ? (
                                        // In over out; the cell's label says
                                        // both.
                                        <span
                                            aria-hidden
                                            title={
                                                sum && currency
                                                    ? `Money in ${minorMoney(sum.in, currency)}${sum.out ? `, out ${minorMoney(sum.out, currency)}` : ""}`
                                                    : undefined
                                            }
                                            className="grid flex-none justify-items-end whitespace-nowrap text-[11px] tabular-nums leading-[1.25] max-[759px]:hidden"
                                        >
                                            <span className="text-muted-foreground">
                                                {cash.in}
                                            </span>
                                            {cash.out ? (
                                                <span className="text-destructive-subtle-foreground">
                                                    {cash.out}
                                                </span>
                                            ) : null}
                                        </span>
                                    ) : null}
                                </span>
                                {dayOff ? (
                                    // Said in the label too; a phone's cell
                                    // has no room for it (the boards).
                                    <span
                                        aria-hidden
                                        title={dayOff.title}
                                        className="block truncate text-[11px] text-muted-foreground max-[759px]:hidden"
                                    >
                                        {dayOff.text}
                                    </span>
                                ) : null}
                                {/* Desk: a line per layer, a square of its
                                    colour and its count. */}
                                <span
                                    aria-hidden
                                    className="flex flex-col gap-[3px] max-[759px]:hidden"
                                >
                                    {chips.slice(0, DESK_CHIPS).map((chip) => (
                                        <span
                                            key={chip.key}
                                            className={cn(
                                                "flex min-w-0 items-center gap-[5px] text-[11.5px]",
                                                chip.tone === "act"
                                                    ? "font-semibold text-destructive-subtle-foreground"
                                                    : "text-neutral-700 dark:text-muted-foreground",
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "size-[7px] shrink-0 rounded-[2px]",
                                                    chip.tone === "act"
                                                        ? "bg-destructive-subtle-foreground"
                                                        : TONE_FILL[chip.tone],
                                                )}
                                            />
                                            <span className="truncate">
                                                {chip.text}
                                            </span>
                                        </span>
                                    ))}
                                </span>
                                {/* Phone: a dot per layer, red first when
                                something needs you. */}
                                <span
                                    aria-hidden
                                    className="flex h-1.5 gap-[3px] min-[760px]:hidden"
                                >
                                    {chips.slice(0, PHONE_DOTS).map((chip) => (
                                        <span
                                            key={chip.key}
                                            className={cn(
                                                "block size-1.5 rounded-full",
                                                chip.tone === "act"
                                                    ? "bg-destructive-subtle-foreground"
                                                    : cn(
                                                          TONE_FILL[chip.tone],
                                                          past &&
                                                              "opacity-[.55]",
                                                      ),
                                            )}
                                        />
                                    ))}
                                </span>
                            </button>
                        );
                    }),
                    ...Array.from({ length: trailing }, (_, i) =>
                        blank(`t${i}`),
                    ),
                ])}
            </div>
        </div>
    );
}

/** The cells a week a row, so the grid reads as rows to a screen reader. */
function weeks(cells: React.ReactElement[]): React.ReactNode {
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < cells.length; i += 7) {
        rows.push(
            <div key={`w${i / 7}`} role="row" className="contents">
                {cells.slice(i, i + 7)}
            </div>,
        );
    }
    return rows;
}
