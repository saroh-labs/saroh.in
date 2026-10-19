"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import type { CSSProperties } from "react";

import type { Block, Column, LocalDate, Span } from "@/lib/services/diary";
import { isLive } from "@/lib/services/diary";
import type { DayHours } from "@/lib/services/diary-view";
import {
    closedSpans,
    dayFullness,
    drawnLanes,
    firstSight,
    offSpans,
    weekLanes,
} from "@/lib/services/diary-view";

import { Hatches, HourRail } from "./day-by-person";
import { blockLabel, DiaryBlock } from "./diary-block";
import { tall } from "./geometry";
import { FirstSight, NowLine, NowTime, useNowMinute } from "./now-line";
import { LaneBlock, WeekFree } from "./week-blocks";
import { closedWords, fullWords, weekHelp } from "./week-words";

export interface WeekDay {
    date: LocalDate;
    label: string;
    blocks: Block[];
    /** When anybody works that day; null when hours are not known. */
    hours: DayHours | null;
    today: boolean;
    selected: boolean;
    /** The columns of whose bookings are shown that day. */
    cols: Column[];
    /** Nobody takes bookings that day: every week, or this date only. */
    closed: "weekly" | "day" | null;
}

/** Live bookings on a day: the count its heading and the strip show. */
export const liveCount = (d: Pick<WeekDay, "blocks">) =>
    d.blocks.filter(isLive).length;

const ONE = { lane: 0, lanes: 1 };

/** A lane's left and width inside a day: person lane, then booking lane. */
function placeIn(
    person: { lane: number; lanes: number },
    inner: { lane: number; lanes: number },
): CSSProperties | undefined {
    if (person.lanes <= 1 && inner.lanes <= 1) return undefined;
    const share = 100 / person.lanes;
    const left = person.lane * share + (inner.lane * share) / inner.lanes;
    return {
        left: `calc(${left}% + 2px)`,
        width: `calc(${share / inner.lanes}% - 4px)`,
        right: "auto",
    };
}

/**
 * The week, Monday first (U5, BKDCalendarWeek): each day's heading says how
 * many are booked and how full it is, and opens the day. On Everyone each
 * day has a lane per person, in the same order every day. Free time is a
 * dashed green box that books or blocks; closed time is hatched; a day
 * nobody works says so and offers to open hours on it. The now line runs
 * across today. Phones get the strip and the day's list instead
 * (`WeekPhone`).
 */
export function WeekView({
    days,
    span,
    timezone,
    sightKey,
    selected,
    canBook,
    canOpenHours,
    offersFree,
    onDay,
    onBlock,
    onFree,
    onOpenDay,
}: {
    days: WeekDay[];
    span: Span;
    timezone: string;
    /** The week shown: the diary is brought into view once for each. */
    sightKey: string;
    selected: string | null;
    canBook: boolean;
    canOpenHours: boolean;
    /** Whether a column's free time is offered (a person, not paused). */
    offersFree: (column: Column) => boolean;
    onDay: (date: LocalDate) => void;
    onBlock: (block: Block, date: LocalDate) => void;
    onFree: (column: Column, free: Span, date: LocalDate) => void;
    /** Open hours on a day nobody works. */
    onOpenDay: (date: LocalDate) => void;
}) {
    const hasToday = days.some((d) => d.today);
    const nowMinute = useNowMinute(timezone, hasToday);
    const sight = firstSight(
        hasToday ? nowMinute : null,
        hasToday ? [] : days.flatMap((d) => d.blocks),
        hasToday ? [] : days.flatMap((d) => d.hours?.windows ?? []),
        span,
    );
    const lanes = weekLanes(days.map((d) => d.cols));
    const split = lanes.length > 1;
    // On Everyone a person keeps their lane all week; one lane is the day.
    const laneOf = (key: string) =>
        split
            ? {
                  lane: Math.max(
                      0,
                      lanes.findIndex((l) => l.key === key),
                  ),
                  lanes: lanes.length,
              }
            : ONE;
    return (
        <div data-week-view="desk">
            <div className="overflow-auto rounded-[12px] border border-border bg-card">
                <div className="grid min-w-[820px] grid-cols-[52px_repeat(7,minmax(110px,1fr))]">
                    <div className="border-b border-border" />
                    {days.map((d) => (
                        <DayHeading key={d.date} day={d} onOpen={onDay} />
                    ))}
                    <HourRail span={span}>
                        <NowTime minute={nowMinute} span={span} />
                        <FirstSight
                            sightKey={sightKey}
                            minute={sight}
                            span={span}
                        />
                    </HourRail>
                    {days.map((d) => (
                        <WeekColumn
                            key={d.date}
                            day={d}
                            span={span}
                            laneOf={laneOf}
                            selected={selected}
                            canBook={canBook}
                            canOpenHours={canOpenHours}
                            offersFree={offersFree}
                            nowMinute={nowMinute}
                            onBlock={onBlock}
                            onFree={onFree}
                            onOpenDay={onOpenDay}
                        />
                    ))}
                </div>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-normal text-muted-foreground">
                {weekHelp({
                    lanes: split ? lanes.map((l) => l.name) : [],
                    canBook,
                    phone: false,
                })}
            </p>
        </div>
    );
}

/**
 * One day of the week under its heading: closed time hatched, a day nobody
 * works said in words, then each person's free time and bookings in their
 * lane, and the now line on today.
 */
function WeekColumn({
    day: d,
    span,
    laneOf,
    selected,
    canBook,
    canOpenHours,
    offersFree,
    nowMinute,
    onBlock,
    onFree,
    onOpenDay,
}: {
    day: WeekDay;
    span: Span;
    laneOf: (key: string) => { lane: number; lanes: number };
    selected: string | null;
    canBook: boolean;
    canOpenHours: boolean;
    offersFree: (column: Column) => boolean;
    nowMinute: number | null;
    onBlock: (block: Block, date: LocalDate) => void;
    onFree: (column: Column, free: Span, date: LocalDate) => void;
    onOpenDay: (date: LocalDate) => void;
}) {
    const [from, to] = span;
    const words = d.closed ? closedWords(d) : null;
    const split = d.cols.some((c) => laneOf(c.key).lanes > 1);
    // Where each block sits: its person's lane, then beside whatever it
    // shares its time with in that lane. Without lanes, the whole day.
    const placed = new Map<string, CSSProperties | undefined>();
    const groups = split
        ? d.cols.map((c) => ({ lane: laneOf(c.key), blocks: c.blocks }))
        : [{ lane: ONE, blocks: d.blocks }];
    for (const g of groups) {
        const inner = drawnLanes(g.blocks);
        for (const b of g.blocks) {
            placed.set(b.key, placeIn(g.lane, inner.get(b.key) ?? ONE));
        }
    }
    return (
        <div
            data-diary-column={d.date}
            className="relative border-l border-border/60"
            style={{ height: tall(from, to) }}
        >
            {d.hours ? (
                <Hatches
                    closed={closedSpans(d.hours, span)}
                    off={offSpans(d.hours, span)}
                    from={from}
                />
            ) : null}
            {words ? (
                <div
                    data-week-closed=""
                    className="absolute inset-x-2 top-6 z-[2] flex flex-col items-center gap-2 rounded-[10px] border border-border bg-card px-2 py-3.5 text-center"
                >
                    <span className="text-[13px] font-semibold">
                        {words.title}
                    </span>
                    <span className="text-[11.5px] leading-[1.45] text-muted-foreground">
                        {words.line}
                    </span>
                    {canOpenHours ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-8 whitespace-normal px-2.5 py-1.5 text-[12px] leading-tight"
                            onClick={() => onOpenDay(d.date)}
                        >
                            Open hours on this day
                        </Button>
                    ) : null}
                </div>
            ) : null}
            {d.cols
                .filter(offersFree)
                .flatMap((c) =>
                    (c.day?.free ?? []).map((f) => (
                        <WeekFree
                            key={`f${c.key}${f[0]}`}
                            column={c}
                            free={f}
                            from={from}
                            short={split}
                            place={placeIn(split ? laneOf(c.key) : ONE, ONE)}
                            onBook={canBook ? () => onFree(c, f, d.date) : null}
                        />
                    )),
                )}
            {d.blocks.map((b) => {
                const props = {
                    block: b,
                    from,
                    selected: selected === b.key,
                    label: `${d.label}, ${blockLabel(b)}`,
                    place: placed.get(b.key),
                    onOpen: () => onBlock(b, d.date),
                };
                return split && isLive(b) ? (
                    <LaneBlock key={b.key} {...props} />
                ) : (
                    <DiaryBlock key={b.key} {...props} />
                );
            })}
            {d.today ? <NowLine minute={nowMinute} span={span} /> : null}
        </div>
    );
}

/** A day's heading: the day, how many are booked, and how full it is. */
function DayHeading({
    day: d,
    onOpen,
}: {
    day: WeekDay;
    onOpen: (date: LocalDate) => void;
}) {
    const n = liveCount(d);
    const full = d.closed ? 0 : dayFullness(d.cols);
    const [weekday, ...rest] = d.label.split(" ");
    return (
        <button
            type="button"
            onClick={() => onOpen(d.date)}
            aria-label={`${d.label}${d.today ? ", today" : ""}, ${d.closed ? "closed" : `${n} booked`}${full !== null && !d.closed ? `, ${fullWords(full)}` : ""}. Open the day`}
            className={cn(
                "flex flex-col items-stretch gap-1 border-b border-l border-b-border border-l-border/60 px-3 pb-2 pt-2.5 text-left transition-colors duration-fast hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted",
                d.selected ? "bg-muted/60" : d.today ? "bg-muted/20" : "",
            )}
        >
            <span className="flex items-baseline gap-1.5">
                <span
                    className={cn(
                        "text-[13px] font-semibold",
                        d.today && "text-destructive",
                    )}
                >
                    {weekday}
                </span>
                <span className="font-display text-[18px] font-semibold">
                    {rest[0]}
                </span>
                <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground">
                    {d.closed ? "Closed" : `${n} booked`}
                </span>
            </span>
            {full !== null ? (
                <span
                    aria-hidden
                    data-fullness={Math.round(full * 100)}
                    className="relative block h-1 overflow-hidden rounded-full bg-muted"
                >
                    <span
                        className="absolute inset-y-0 left-0 rounded-full bg-foreground"
                        style={{ width: `${Math.round(full * 100)}%` }}
                    />
                </span>
            ) : null}
        </button>
    );
}
