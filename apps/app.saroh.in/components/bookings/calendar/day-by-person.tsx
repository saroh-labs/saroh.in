"use client";

import { formatClock, formatClockRange } from "@/lib/format/datetime";
import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { cn } from "@saroh/ui/lib/utils";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import {
    columnCount,
    columnSubline,
    everyoneBlocks,
} from "@/lib/services/day-view";
import type { Block, Column, Span } from "@/lib/services/diary";
import { UNASSIGNED } from "@/lib/services/diary";
import {
    closedSpans,
    drawnLanes,
    firstSight,
    offSpans,
} from "@/lib/services/diary-view";

import { FreeGap } from "@/components/bookings/free-time/free-gap";
import { DayBlock } from "./day-block";
import { lanePlace } from "./diary-block";
import { at, CLOSED_HATCH, OFF_HATCH, tall } from "./geometry";
import { FirstSight, NowLine, NowTime, useNowMinute } from "./now-line";

/** The hour marks down the left edge, and whatever stands on them. */
export function HourRail({
    span,
    children,
}: {
    span: Span;
    /** The time now and the first-sight anchor. */
    children?: ReactNode;
}) {
    const marks: number[] = [];
    for (let m = span[0]; m < span[1]; m += 60) marks.push(m);
    return (
        <div className="relative" style={{ height: tall(span[0], span[1]) }}>
            <div aria-hidden>
                {marks.map((m) => (
                    <div
                        key={m}
                        className="absolute inset-x-0 h-px"
                        style={{ top: at(m, span[0]) }}
                    >
                        <span className="absolute -top-[7px] right-2 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                            {formatClock(m, { short: true })}
                        </span>
                    </div>
                ))}
            </div>
            {children}
        </div>
    );
}

/** The shortest time off that has room for its words: 30 minutes is 24px. */
const OFF_LABEL_MINUTES = 30;

/**
 * Closed time and time off in one column of the diary, inside the hours
 * shown. Free time gets nothing: it is the plain page. Both hatches let a
 * click through to whatever is under them.
 */
export function Hatches({
    closed,
    off,
    from,
}: {
    closed: readonly Span[];
    off: readonly Span[];
    from: number;
}) {
    return (
        <>
            {closed.map(([a, b]) => (
                <div
                    key={`c${a}`}
                    aria-hidden
                    data-hatch="closed"
                    className={cn(
                        "pointer-events-none absolute inset-x-0",
                        CLOSED_HATCH,
                    )}
                    style={{ top: at(a, from), height: tall(a, b) }}
                />
            ))}
            {off.map(([a, b]) => (
                <div
                    key={`o${a}`}
                    data-hatch="off"
                    className={cn(
                        "pointer-events-none absolute inset-x-0",
                        OFF_HATCH,
                    )}
                    style={{ top: at(a, from), height: tall(a, b) }}
                >
                    {/* Said in words, so it is not the colour alone. A
                        stretch too short to hold them keeps the hatch's
                        own direction and width. */}
                    {b - a >= OFF_LABEL_MINUTES ? (
                        <span className="absolute left-1.5 top-1 rounded-[4px] bg-card px-1 text-[11px] font-medium leading-4 text-muted-foreground">
                            Time off
                        </span>
                    ) : null}
                </div>
            ))}
        </>
    );
}

/** The hour lines across a column, under everything drawn on it. */
function HourLines({ span }: { span: Span }) {
    const marks: number[] = [];
    for (let m = span[0] + 60; m < span[1]; m += 60) marks.push(m);
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0">
            {marks.map((m) => (
                <div
                    key={m}
                    className="absolute inset-x-0 h-px bg-border/50"
                    style={{ top: at(m, span[0]) }}
                />
            ))}
        </div>
    );
}

/** The shortest closed time with room for its pill: 30 minutes is 24px. */
const CLOSED_LABEL_MINUTES = 30;

/**
 * Closed time in a person's column (U4): hatched, with a pill that says
 * what a press does, "Closed · click to open" on the desk and "Closed · tap
 * to open" on a phone, and it opens these hours. For someone who can't
 * change hours (Calendar only), and for the services' own hours, it is
 * hatched and says "Closed" only.
 */
function ClosedTime({
    span: [a, b],
    from,
    name,
    dayText,
    onOpen,
}: {
    span: Span;
    from: number;
    name: string;
    dayText: string;
    /** Open hours from a minute; absent when it can't be pressed. */
    onOpen?: (minute: number) => void;
}) {
    const place = { top: at(a, from), height: tall(a, b) };
    const room = b - a >= CLOSED_LABEL_MINUTES;
    const pill =
        "absolute left-1/2 top-2.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground transition-colors duration-fast max-[759px]:top-1.5 max-[759px]:px-[9px] max-[759px]:text-[11px] max-[759px]:font-semibold";
    if (!onOpen) {
        return (
            <div
                data-hatch="closed"
                className={cn("absolute inset-x-0", CLOSED_HATCH)}
                style={place}
            >
                {room ? <span className={pill}>Closed</span> : null}
            </div>
        );
    }
    const pick = (e: MouseEvent<HTMLButtonElement>) => {
        // A keyboard press has no pointer: before opening time, the hour
        // before it; otherwise from when it closes.
        if (e.detail === 0) {
            onOpen(a <= from ? Math.max(a, b - 60) : a);
            return;
        }
        // From the share of its height, so it holds at any scale.
        const r = e.currentTarget.getBoundingClientRect();
        const share = r.height > 0 ? (e.clientY - r.top) / r.height : 0;
        const m = Math.round((a + share * (b - a)) / 30) * 30;
        onOpen(Math.max(a, Math.min(Math.max(a, b - 30), m)));
    };
    const range = formatClockRange(a, b);
    return (
        <button
            type="button"
            data-hatch="closed"
            data-closed-time=""
            aria-label={`Closed ${range}. Open these hours for ${name} on ${dayText}`}
            onClick={pick}
            className={cn(
                "group absolute inset-x-0 z-0 block w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                CLOSED_HATCH,
            )}
            style={place}
        >
            {room ? (
                <span
                    aria-hidden
                    className={cn(
                        pill,
                        "group-hover:border-foreground group-hover:text-foreground",
                    )}
                >
                    <span className="max-[759px]:hidden">
                        Closed · click to open
                    </span>
                    <span className="min-[760px]:hidden">
                        Closed · tap to open
                    </span>
                </span>
            ) : null}
        </button>
    );
}

/**
 * The Day calendar (U4, #1020; BKDCalendarDay on the desk, BKMBookingsDay
 * on a phone). On the desk, a column per person under their face, name,
 * hours and count; on a phone, the one person picked, or Everyone's day as
 * one list where each booking says whose it is.
 *
 * Bookings are the solid colour. Free time long enough for something the
 * person takes is a green "Free · … + Book" that opens the free-time sheet;
 * closed time is hatched and says "Closed · click to open" (a phone: "tap
 * to open"), opening those hours; time off is hatched the other way and
 * says so. A 2px line marks now on today, and the day opens there, else at
 * the first booking or opening hour. On a phone a minute is drawn twice as
 * tall, so every block and free time is a thumb's height.
 */
export function DayByPerson({
    columns,
    span,
    today,
    timezone,
    sightKey,
    everyone = false,
    selected,
    canBook,
    canOpenHours,
    dayText,
    onBlock,
    onFree,
    onClosed,
}: {
    columns: Column[];
    span: Span;
    /** The day shown is today: draw the now line. */
    today: boolean;
    timezone: string;
    /** The day and layout: the diary is brought into view once for each. */
    sightKey: string;
    /** Everyone is shown: a phone draws the day as one list. */
    everyone?: boolean;
    selected: string | null;
    canBook: boolean;
    canOpenHours: boolean;
    dayText: string;
    onBlock: (block: Block) => void;
    onFree: (column: Column, free: Span) => void;
    onClosed: (column: Column, minute: number) => void;
}) {
    const [from, to] = span;
    const height = tall(from, to);
    const nowMinute = useNowMinute(timezone, today);
    const sight = firstSight(
        // On today the aim is now, known only once the browser has drawn.
        today ? nowMinute : null,
        today ? [] : columns.flatMap((c) => c.blocks),
        today ? [] : columns.flatMap((c) => c.day?.windows ?? []),
        span,
    );
    // Everyone on a phone is one list; with one person there is nothing to
    // merge, and their column serves both widths.
    const merged = everyone && columns.length > 1;

    const lane = (c: Column) => {
        const lanes = drawnLanes(c.blocks);
        // The services' own hours have nobody to book with a press: New
        // booking takes any service at any open time.
        const person = c.key !== UNASSIGNED;
        const bookable = canBook && person;
        return (
            <div
                key={c.key}
                data-diary-column={c.key}
                className="relative min-w-0 border-l border-border/60"
                style={{ height }}
            >
                <HourLines span={span} />
                {c.day
                    ? closedSpans(c.day, span).map((s) => (
                          <ClosedTime
                              key={`c${s[0]}`}
                              span={s}
                              from={from}
                              name={c.name}
                              dayText={dayText}
                              onOpen={
                                  canOpenHours && person
                                      ? (m) => onClosed(c, m)
                                      : undefined
                              }
                          />
                      ))
                    : null}
                {c.day ? (
                    <Hatches
                        closed={[]}
                        off={offSpans(c.day, span)}
                        from={from}
                    />
                ) : null}
                {bookable
                    ? c.day?.free.map((f) => (
                          <FreeGap
                              key={`f${f[0]}`}
                              column={c}
                              free={f}
                              from={from}
                              onBook={onFree}
                          />
                      ))
                    : null}
                {c.blocks.map((b) => (
                    <DayBlock
                        key={b.key}
                        block={b}
                        from={from}
                        selected={selected === b.key}
                        onOpen={() => onBlock(b)}
                        place={lanePlace(
                            lanes.get(b.key) ?? { lane: 0, lanes: 1 },
                        )}
                    />
                ))}
                <NowLine minute={nowMinute} span={span} dot />
            </div>
        );
    };

    const rail = (
        <HourRail span={span}>
            <NowTime minute={nowMinute} span={span} />
            <FirstSight sightKey={sightKey} minute={sight} span={span} />
        </HourRail>
    );

    const desk = (
        <div
            data-day-grid=""
            className={cn(
                "overflow-auto rounded-[12px] border border-border bg-card [--ppm:0.8px] coarse:[--ppm:1.6px] max-[759px]:[--ppm:1.6px]",
                merged && "max-[759px]:hidden",
            )}
        >
            <div
                className="grid min-w-[560px] grid-cols-[52px_repeat(var(--cols),minmax(170px,1fr))] max-[759px]:min-w-0 max-[759px]:grid-cols-[50px_minmax(0,1fr)]"
                style={{ "--cols": columns.length } as CSSProperties}
            >
                {/* A phone names whose day it is in the chip above. */}
                <div className="border-b border-border max-[759px]:hidden" />
                {columns.map((c) => (
                    <ColumnHead key={c.key} column={c} />
                ))}
                {rail}
                {columns.map(lane)}
            </div>
        </div>
    );
    if (!merged) return desk;

    const all = everyoneBlocks(columns);
    const lanes = drawnLanes(all.map((e) => e.block));
    return (
        <>
            {desk}
            <div
                data-day-everyone=""
                className="overflow-hidden rounded-[12px] border border-border bg-card [--ppm:1.6px] min-[760px]:hidden"
            >
                <div className="grid grid-cols-[50px_minmax(0,1fr)]">
                    <HourRail span={span}>
                        <NowTime minute={nowMinute} span={span} />
                        <FirstSight
                            sightKey={`${sightKey}:everyone`}
                            minute={sight}
                            span={span}
                        />
                    </HourRail>
                    <div
                        data-everyone-column=""
                        className="relative min-w-0 border-l border-border/60"
                        style={{ height }}
                    >
                        <HourLines span={span} />
                        {all.map(({ block: b, who }) => (
                            <DayBlock
                                key={b.key}
                                block={b}
                                from={from}
                                who={who}
                                selected={selected === b.key}
                                onOpen={() => onBlock(b)}
                                place={lanePlace(
                                    lanes.get(b.key) ?? { lane: 0, lanes: 1 },
                                )}
                            />
                        ))}
                        <NowLine minute={nowMinute} span={span} dot />
                    </div>
                </div>
            </div>
        </>
    );
}

/**
 * A column's head on the desk: the person's face, name and hours, and how
 * many they have on the day at its end. Not drawn on a phone, where the
 * chip above says whose day it is.
 */
function ColumnHead({ column: c }: { column: Column }) {
    return (
        <div
            data-column-head=""
            className="flex min-w-0 items-center gap-2.5 border-b border-l border-b-border border-l-border/60 px-3 py-2.5 max-[759px]:hidden"
        >
            <Avatar size="row" aria-hidden>
                <AvatarFallback>{avatarInitials(c.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">
                    {c.name}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                    {columnSubline(c)}
                </div>
            </div>
            <span className="shrink-0 whitespace-nowrap text-right text-[11.5px] tabular-nums text-muted-foreground">
                {columnCount(c.blocks)}
            </span>
        </div>
    );
}
