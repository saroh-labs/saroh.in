"use client";

import { formatClock, formatClockRange } from "@/lib/format/datetime";
import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import type { Block, Column, Span } from "@/lib/services/diary";
import { UNASSIGNED } from "@/lib/services/diary";
import {
    closedSpans,
    drawnLanes,
    firstSight,
    offSpans,
} from "@/lib/services/diary-view";

import { blockLabel, DiaryBlock, lanePlace } from "./diary-block";
import { FreeGap } from "./free-gap";
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

/**
 * The day by person, the default layout: one column per person under their
 * avatar and name. Bookings are the only solid colour. Free time is the
 * plain page and books on a click; closed time is a quiet hatch and opens
 * hours; time off is hatched the other way and says so. A thin line marks
 * now on today. On a phone one person shows at a time, picked by the switch
 * above.
 */
export function DayByPerson({
    columns,
    span,
    today,
    timezone,
    sightKey,
    phoneKey,
    selected,
    canBook,
    canOpenHours,
    dayText,
    onBlock,
    onFree,
    onClosed,
    onAddPerson,
}: {
    columns: Column[];
    span: Span;
    /** The day shown is today: draw the now line. */
    today: boolean;
    timezone: string;
    /** The day and layout: the diary is brought into view once for each. */
    sightKey: string;
    /** The one column a phone shows. */
    phoneKey: string;
    selected: string | null;
    canBook: boolean;
    canOpenHours: boolean;
    dayText: string;
    onBlock: (block: Block) => void;
    onFree: (column: Column, free: Span) => void;
    onClosed: (column: Column, minute: number) => void;
    /** "Add who takes bookings", from the head of the services' own column. */
    onAddPerson?: () => void;
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

    function closedAt(column: Column, e: MouseEvent<HTMLButtonElement>) {
        // A keyboard press has no pointer: open from the first closed hour.
        if (e.detail === 0) {
            const open = column.day?.windows ?? [];
            let m = from;
            while (m < to && open.some(([a, b]) => m >= a && m < b)) m += 30;
            onClosed(column, Math.min(m, to - 60));
            return;
        }
        // From the share of the column's height, so it holds at any scale.
        const r = e.currentTarget.getBoundingClientRect();
        const share = r.height > 0 ? (e.clientY - r.top) / r.height : 0;
        const m = Math.round((from + share * (to - from)) / 30) * 30;
        onClosed(column, Math.max(from, Math.min(to - 60, m)));
    }

    return (
        <div className="overflow-auto rounded-[12px] border border-border bg-card [--ppm:0.8px] coarse:[--ppm:1.6px]">
            <div
                className="grid min-w-[560px] grid-cols-[52px_repeat(var(--cols),minmax(170px,1fr))] max-[759px]:min-w-0 max-[759px]:grid-cols-[52px_minmax(0,1fr)]"
                style={{ "--cols": columns.length } as CSSProperties}
            >
                <div className="border-b border-border" />
                {columns.map((c) => (
                    <ColumnHead
                        key={c.key}
                        column={c}
                        hidden={c.key !== phoneKey}
                        onAddPerson={onAddPerson}
                    />
                ))}
                <HourRail span={span}>
                    <NowTime minute={nowMinute} span={span} />
                    <FirstSight
                        sightKey={sightKey}
                        minute={sight}
                        span={span}
                    />
                </HourRail>
                {columns.map((c) => {
                    const lanes = drawnLanes(c.blocks);
                    // The services' own hours have nobody to book with a
                    // click: New booking takes any service at any open time.
                    const bookable = canBook && c.key !== UNASSIGNED;
                    return (
                        <div
                            key={c.key}
                            data-diary-column={c.key}
                            className={cn(
                                "relative border-l border-border/60",
                                c.key !== phoneKey && "max-[759px]:hidden",
                            )}
                            style={{ height }}
                        >
                            {canOpenHours && c.key !== UNASSIGNED && c.day ? (
                                <button
                                    type="button"
                                    aria-label={`Open hours for ${c.name} on ${dayText}`}
                                    onClick={(e) => closedAt(c, e)}
                                    className="absolute inset-0 z-0 w-full cursor-pointer transition-colors duration-fast hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/60"
                                />
                            ) : null}
                            {c.day ? (
                                <Hatches
                                    closed={closedSpans(c.day, span)}
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
                                <DiaryBlock
                                    key={b.key}
                                    block={b}
                                    from={from}
                                    selected={selected === b.key}
                                    label={blockLabel(b)}
                                    onOpen={() => onBlock(b)}
                                    place={lanePlace(
                                        lanes.get(b.key) ?? {
                                            lane: 0,
                                            lanes: 1,
                                        },
                                    )}
                                />
                            ))}
                            <NowLine minute={nowMinute} span={span} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * A column's head: the person's initials and name, then their hours. The
 * services' own column (nobody on the diary yet) is not a person, so it has
 * no avatar; it is where "Add who takes bookings" lives.
 */
function ColumnHead({
    column: c,
    hidden,
    onAddPerson,
}: {
    column: Column;
    /** Not the one a phone shows. */
    hidden: boolean;
    onAddPerson?: () => void;
}) {
    const person = c.key !== UNASSIGNED;
    return (
        <div
            className={cn(
                "flex min-w-0 items-center gap-2.5 border-b border-l border-b-border border-l-border/60 px-3 py-2.5",
                hidden && "max-[759px]:hidden",
            )}
        >
            {person ? (
                <Avatar size="table" aria-hidden>
                    <AvatarFallback>{avatarInitials(c.name)}</AvatarFallback>
                </Avatar>
            ) : null}
            <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">
                    {c.name}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                    {columnSub(c)}
                </div>
                {!person && c.day && onAddPerson ? (
                    <TextLink
                        onClick={onAddPerson}
                        className="text-[12px] coarse:inline-flex coarse:min-h-11 coarse:items-center"
                    >
                        Add who takes bookings
                    </TextLink>
                ) : null}
            </div>
        </div>
    );
}

/** "Trainer · 06:00–10:00, 17:00–21:00", or "· off today". */
export function columnSub(c: Column): string {
    const hours = c.day
        ? c.day.windows.length
            ? c.day.windows.map(([a, b]) => formatClockRange(a, b)).join(", ")
            : "off today"
        : null;
    return [c.title, hours].filter(Boolean).join(" · ");
}
