"use client";

import { cn } from "@saroh/ui/lib/utils";

import type { Block, LocalDate, Span } from "@/lib/services/diary";
import { blockTitle, clock, laneOf, liveSeats } from "@/lib/services/diary";

import { blockColour, blockLabel, HourRail, PX } from "./day-by-person";

export interface WeekDay {
    date: LocalDate;
    label: string;
    blocks: Block[];
    today: boolean;
    selected: boolean;
}

/**
 * Layout 3b: the week, Monday first. Each block says its start and who;
 * where two people's blocks overlap they take a lane each. A day's heading
 * opens that day by person. Phones get the agenda instead (the design).
 */
export function WeekView({
    days,
    span,
    lanes,
    selected,
    onDay,
    onBlock,
}: {
    days: WeekDay[];
    span: Span;
    /** Column order for overlapping blocks: the people, Unassigned last. */
    lanes: string[];
    selected: string | null;
    onDay: (date: LocalDate) => void;
    onBlock: (block: Block, date: LocalDate) => void;
}) {
    const [from, to] = span;
    return (
        <div className="overflow-auto rounded-[12px] border border-border bg-card">
            <div className="grid min-w-[820px] grid-cols-[52px_repeat(7,minmax(110px,1fr))]">
                <div className="border-b border-border" />
                {days.map((d) => {
                    const n = d.blocks.filter(
                        (b) => b.state !== "cancelled",
                    ).length;
                    return (
                        <button
                            key={d.date}
                            type="button"
                            onClick={() => onDay(d.date)}
                            aria-label={`${d.label}, ${n} ${n === 1 ? "booking" : "bookings"} — open the day`}
                            className={cn(
                                "border-b border-l border-b-border border-l-border/60 px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                d.selected ? "bg-muted/60" : "bg-transparent",
                            )}
                        >
                            <div className="text-[12px] font-semibold">
                                {d.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                {n} {n === 1 ? "booking" : "bookings"}
                            </div>
                        </button>
                    );
                })}
                <HourRail span={span} />
                {days.map((d) => (
                    <div
                        key={d.date}
                        className={cn(
                            "relative border-l border-border/60",
                            d.today && "bg-brand-subtle",
                        )}
                        style={{ height: `${(to - from) * PX}px` }}
                    >
                        {d.blocks.map((b) => {
                            const lane = laneOf(b, d.blocks, lanes);
                            return (
                                <button
                                    key={b.key}
                                    type="button"
                                    onClick={() => onBlock(b, d.date)}
                                    aria-label={`${d.label}, ${blockLabel(b)}`}
                                    className={cn(
                                        "absolute z-[2] box-border flex cursor-pointer flex-col items-stretch justify-start overflow-hidden rounded-[7px] px-[5px] py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                        blockColour(b),
                                        selected === b.key &&
                                            "ring-2 ring-highlight",
                                        b.state === "cancelled" &&
                                            "line-through",
                                    )}
                                    style={{
                                        top: `${(b.start - from) * PX}px`,
                                        height: `${Math.max(0, b.end - b.start) * PX}px`,
                                        ...(lane
                                            ? {
                                                  left: `calc(${(lane.lane * 100) / lane.of}% + 2px)`,
                                                  width: `calc(${100 / lane.of}% - 4px)`,
                                              }
                                            : { left: "3px", right: "3px" }),
                                    }}
                                >
                                    <span className="block truncate text-[12px] font-bold">
                                        {clock(b.start)} {blockTitle(b)}
                                    </span>
                                    <span className="block truncate text-[11px]">
                                        {b.kind === "class"
                                            ? `${liveSeats(b.session).length} of ${b.session.capacity}`
                                            : b.state === "cancelled"
                                              ? "Cancelled"
                                              : b.booking.service.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
