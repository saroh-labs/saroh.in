"use client";

import { count } from "@/lib/format/plural";
import { cn } from "@saroh/ui/lib/utils";

import type { Block, LocalDate, Span } from "@/lib/services/diary";
import { isLive } from "@/lib/services/diary";
import type { DayHours } from "@/lib/services/diary-view";
import {
    closedSpans,
    drawnLanes,
    firstSight,
    offSpans,
} from "@/lib/services/diary-view";

import { Hatches, HourRail } from "./day-by-person";
import { blockLabel, DiaryBlock, lanePlace } from "./diary-block";
import { tall } from "./geometry";
import { FirstSight, NowLine, NowTime, useNowMinute } from "./now-line";

export interface WeekDay {
    date: LocalDate;
    label: string;
    blocks: Block[];
    /** When anybody works that day; null when hours are not known. */
    hours: DayHours | null;
    today: boolean;
    selected: boolean;
}

/**
 * The week, Monday first, drawn as the day is: the same blocks over the same
 * hours, closed time hatched, free time plain, and the now line on today's
 * column. Blocks that share a time sit side by side. A day's heading opens
 * that day by person. Phones get the agenda instead.
 */
export function WeekView({
    days,
    span,
    timezone,
    sightKey,
    selected,
    onDay,
    onBlock,
}: {
    days: WeekDay[];
    span: Span;
    timezone: string;
    /** The week shown: the diary is brought into view once for each. */
    sightKey: string;
    selected: string | null;
    onDay: (date: LocalDate) => void;
    onBlock: (block: Block, date: LocalDate) => void;
}) {
    const [from, to] = span;
    const hasToday = days.some((d) => d.today);
    const nowMinute = useNowMinute(timezone, hasToday);
    const sight = firstSight(
        hasToday ? nowMinute : null,
        hasToday ? [] : days.flatMap((d) => d.blocks),
        hasToday ? [] : days.flatMap((d) => d.hours?.windows ?? []),
        span,
    );
    return (
        <div className="overflow-auto rounded-[12px] border border-border bg-card">
            <div className="grid min-w-[820px] grid-cols-[52px_repeat(7,minmax(110px,1fr))]">
                <div className="border-b border-border" />
                {days.map((d) => {
                    const n = d.blocks.filter(isLive).length;
                    return (
                        <button
                            key={d.date}
                            type="button"
                            onClick={() => onDay(d.date)}
                            aria-label={`${d.label}${d.today ? ", today" : ""}, ${count(n, "booking")}. Open the day`}
                            className={cn(
                                "border-b border-l border-b-border border-l-border/60 px-2.5 py-2 text-left transition-colors duration-fast hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted",
                                d.selected ? "bg-muted/60" : "bg-transparent",
                                // Today wears the Ink rule a chosen tab does;
                                // its column stays plain so the hatch reads.
                                d.today &&
                                    "shadow-[inset_0_2px_0_hsl(var(--foreground))]",
                            )}
                        >
                            <div
                                className={cn(
                                    "text-[12px]",
                                    d.today ? "font-bold" : "font-semibold",
                                )}
                            >
                                {d.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                {d.today ? "Today · " : ""}
                                {count(n, "booking")}
                            </div>
                        </button>
                    );
                })}
                <HourRail span={span}>
                    <NowTime minute={nowMinute} span={span} />
                    <FirstSight
                        sightKey={sightKey}
                        minute={sight}
                        span={span}
                    />
                </HourRail>
                {days.map((d) => {
                    const lanes = drawnLanes(d.blocks);
                    return (
                        <div
                            key={d.date}
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
                            {d.blocks.map((b) => (
                                <DiaryBlock
                                    key={b.key}
                                    block={b}
                                    from={from}
                                    selected={selected === b.key}
                                    label={`${d.label}, ${blockLabel(b)}`}
                                    onOpen={() => onBlock(b, d.date)}
                                    place={lanePlace(
                                        lanes.get(b.key) ?? {
                                            lane: 0,
                                            lanes: 1,
                                        },
                                    )}
                                />
                            ))}
                            {d.today ? (
                                <NowLine minute={nowMinute} span={span} />
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
