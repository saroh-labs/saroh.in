"use client";

import { formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";

import type { Block, Column, LocalDate, Span } from "@/lib/services/diary";
import { dayFullness } from "@/lib/services/diary-view";

import { firstName } from "@/lib/names";
import { CLOSED_HATCH } from "./geometry";
import { BookingRow, FreeRow } from "./week-day-rows";
import type { WeekDay } from "./week-view";
import { liveCount } from "./week-view";
import { closedWords, weekHelp } from "./week-words";

/** The tallest a day's bar is drawn, in pixels: a full day. */
const BAR_PX = 40;

type Row =
    | { kind: "block"; key: string; start: number; block: Block }
    | {
          kind: "free";
          key: string;
          start: number;
          column: Column;
          free: Span;
      };

/**
 * The week on a phone (U5, BKMBookingsWeek): Monday to Sunday as a strip,
 * each day with its count and a bar for how full it is, over the picked
 * day's list: its bookings and its free times in time order, so the count
 * and the list agree. A tap picks a day (kept in the address); a free time
 * books, a booking opens its quick look; a day nobody works offers to open
 * hours on it.
 */
export function WeekPhone({
    days,
    date,
    person,
    canBook,
    canOpenHours,
    offersFree,
    selected,
    onPick,
    onBlock,
    onFree,
    onOpenDay,
}: {
    days: WeekDay[];
    /** The day picked, from the address. */
    date: LocalDate;
    /** Whose bookings, when one person is picked; null on Everyone. */
    person: string | null;
    canBook: boolean;
    canOpenHours: boolean;
    offersFree: (column: Column) => boolean;
    selected: string | null;
    onPick: (date: LocalDate) => void;
    onBlock: (block: Block, date: LocalDate) => void;
    onFree: (column: Column, free: Span, date: LocalDate) => void;
    onOpenDay: (date: LocalDate) => void;
}) {
    // The tap shows its day at once; the address catches up after.
    const [pick, setPick] = useState(date);
    const [asked, setAsked] = useState(date);
    if (asked !== date) {
        setAsked(date);
        setPick(date);
    }
    // A week always has its seven days; the first stands in for a pick
    // outside it.
    const day = days.find((d) => d.date === pick) ?? days[0];
    const strip = useRef<HTMLDivElement>(null);

    const choose = (d: LocalDate) => {
        setPick(d);
        onPick(d);
    };
    // Arrow keys move along the strip, as a set of radios does.
    const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
        const to =
            e.key === "ArrowRight" || e.key === "ArrowDown"
                ? (i + 1) % days.length
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? (i + days.length - 1) % days.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? days.length - 1
                      : null;
        const next = to === null ? undefined : days.at(to);
        if (to === null || !next) return;
        e.preventDefault();
        choose(next.date);
        // One cell a day, in the same order, so the index is the day's.
        strip.current
            ?.querySelectorAll<HTMLButtonElement>("[role=radio]")
            .item(to)
            .focus();
    };

    // Without hours, a bar is measured against the busiest day.
    const busiest = Math.max(1, ...days.map(liveCount));
    const barOf = (d: WeekDay) => {
        if (d.closed) return 0;
        const full = dayFullness(d.cols);
        const share = full ?? liveCount(d) / busiest;
        return Math.max(2, Math.round(share * BAR_PX));
    };

    const rows: Row[] = [
        ...day.blocks.map((b): Row => ({
            kind: "block",
            key: b.key,
            start: b.start,
            block: b,
        })),
        ...day.cols.filter(offersFree).flatMap((c) =>
            (c.day?.free ?? []).map((f): Row => ({
                kind: "free",
                key: `f${c.key}${f[0]}`,
                start: f[0],
                column: c,
                free: f,
            })),
        ),
    ].sort(
        (a, b) =>
            a.start - b.start ||
            (a.kind === b.kind ? 0 : a.kind === "free" ? -1 : 1),
    );
    const n = liveCount(day);
    const freeTimes = rows.filter((r) => r.kind === "free").length;
    const hoursKnown = day.cols.some((c) => c.day !== null);
    const on = formatDay(day.date, { weekday: "short", year: "never" });
    const title = `${on}${day.today ? " · today" : ""}${person ? ` · ${firstName(person)}` : ""}`;
    const words = day.closed ? closedWords(day) : null;

    return (
        <div data-week-view="phone" className="pt-1">
            <div
                ref={strip}
                role="radiogroup"
                aria-label="Pick a day of the week"
                className="grid grid-cols-7 gap-1"
            >
                {days.map((d, i) => {
                    const checked = d.date === day.date;
                    const c = liveCount(d);
                    const [weekday = "", dayNo = ""] = d.label.split(" ");
                    return (
                        <button
                            key={d.date}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            tabIndex={checked ? 0 : -1}
                            aria-label={`${d.label}${d.today ? ", today" : ""}, ${d.closed ? "closed" : count(c, "booking")}`}
                            onClick={() => choose(d.date)}
                            onKeyDown={(e) => onKey(e, i)}
                            className={cn(
                                "flex h-[92px] min-w-0 flex-col items-center justify-end gap-[3px] rounded-[12px] border pb-[7px] pt-1.5 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                checked
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : cn(
                                          "bg-card active:bg-muted",
                                          d.today
                                              ? "border-[1.5px] border-foreground"
                                              : "border-border",
                                          d.closed && CLOSED_HATCH,
                                      ),
                            )}
                        >
                            <span className="text-[12px] font-bold tabular-nums">
                                {d.closed ? "–" : c}
                            </span>
                            <span
                                aria-hidden
                                data-bar={barOf(d)}
                                className={cn(
                                    "w-3.5 rounded-[4px]",
                                    checked
                                        ? "bg-primary-foreground"
                                        : "bg-diary-one opacity-85",
                                )}
                                style={{ height: barOf(d) }}
                            />
                            <span
                                className={cn(
                                    "text-[11px]",
                                    checked
                                        ? "text-primary-foreground/80"
                                        : "text-muted-foreground",
                                )}
                            >
                                {d.today ? "Today" : weekday}
                            </span>
                            <span className="font-display text-[16px] font-semibold leading-none">
                                {dayNo}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="mb-2 mt-3.5">
                <h2 className="text-[15px] font-semibold">{title}</h2>
                <div className="text-[12.5px] text-muted-foreground">
                    {words
                        ? "Closed"
                        : hoursKnown
                          ? `${count(n, "booking")} · ${count(freeTimes, "free time")}`
                          : count(n, "booking")}
                </div>
            </div>

            {words && rows.length === 0 ? (
                <div className="rounded-[12px] border border-border bg-card px-5 py-7 text-center">
                    <div className="font-display text-[17px] font-semibold">
                        {words.title}
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-normal text-muted-foreground">
                        {words.line}
                        {canOpenHours
                            ? " Open some hours if you want to see someone that day."
                            : ""}
                    </p>
                    {canOpenHours ? (
                        <Button
                            variant="outline"
                            className="mt-2.5 h-12"
                            onClick={() => onOpenDay(day.date)}
                        >
                            Open hours on this day
                        </Button>
                    ) : null}
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    size="inline"
                    title={
                        day.today
                            ? "Nothing booked today."
                            : `Nothing booked on ${on}.`
                    }
                />
            ) : (
                <ul className="overflow-hidden rounded-[12px] border border-border bg-card [&>li:last-child>*]:border-b-0">
                    {rows.map((r) =>
                        r.kind === "free" ? (
                            <FreeRow
                                key={r.key}
                                column={r.column}
                                free={r.free}
                                onBook={
                                    canBook
                                        ? () =>
                                              onFree(r.column, r.free, day.date)
                                        : null
                                }
                            />
                        ) : (
                            <BookingRow
                                key={r.key}
                                block={r.block}
                                selected={selected === r.key}
                                onOpen={() => onBlock(r.block, day.date)}
                            />
                        ),
                    )}
                </ul>
            )}

            <p className="mt-3 text-[12.5px] leading-normal text-muted-foreground">
                {weekHelp({
                    lanes: [],
                    canBook,
                    phone: true,
                    free: days.some((d) => d.cols.some((c) => c.day !== null)),
                })}
            </p>
        </div>
    );
}
