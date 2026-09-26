"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { CSSProperties, MouseEvent } from "react";

import type { Block, Column, Span } from "@/lib/services/diary";
import {
    blockLine,
    blockTitle,
    clock,
    STATE_LABEL,
    UNASSIGNED,
} from "@/lib/services/diary";

/** Pixels a minute takes on the diary: an hour is 48px (the design's 0.8). */
export const PX = 0.8;

const at = (minute: number, from: number) => `${(minute - from) * PX}px`;
const tall = (a: number, b: number) => `${Math.max(0, b - a) * PX}px`;

/** Closed time: a faint hatch you can click to open hours. */
export const CLOSED_HATCH =
    "bg-[repeating-linear-gradient(135deg,transparent_0_7px,hsl(var(--muted)/0.7)_7px_9px)] dark:bg-[repeating-linear-gradient(135deg,transparent_0_7px,hsl(var(--muted))_7px_9px)]";

/** Time off: the danger tint, hatched. */
export const OFF_HATCH =
    "bg-[repeating-linear-gradient(135deg,hsl(var(--destructive-subtle))_0_6px,transparent_6px_12px)]";

export function blockColour(block: Block): string {
    if (block.state === "cancelled" || block.state === "noshow") {
        return "bg-muted text-muted-foreground";
    }
    return block.kind === "class"
        ? "bg-diary-class text-diary-foreground"
        : "bg-diary-one text-diary-foreground";
}

export function blockLabel(block: Block): string {
    return `${clock(block.start)}–${clock(block.end)} ${blockTitle(block)}, ${blockLine(block)}, ${STATE_LABEL[block.state]}`;
}

/** The hour marks down the left edge. */
export function HourRail({ span }: { span: Span }) {
    const marks: number[] = [];
    for (let m = span[0]; m < span[1]; m += 60) marks.push(m);
    return (
        <div
            aria-hidden
            className="relative"
            style={{ height: tall(span[0], span[1]) }}
        >
            {marks.map((m) => (
                <div
                    key={m}
                    className="absolute inset-x-0 h-px"
                    style={{ top: at(m, span[0]) }}
                >
                    <span className="absolute -top-[7px] left-0 text-[11px] tabular-nums text-muted-foreground">
                        {clock(m)}
                    </span>
                </div>
            ))}
        </div>
    );
}

/**
 * Layout 3a, the default: one column per person, their free gaps to book,
 * closed time to open, time off hatched red, and the now line on today.
 * On a phone one person shows at a time — the switch above picks who.
 */
export function DayByPerson({
    columns,
    span,
    nowMinute,
    phoneKey,
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
    /** Minutes from midnight now, when the day shown is today. */
    nowMinute: number | null;
    /** The one column a phone shows. */
    phoneKey: string;
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

    function closedAt(column: Column, e: MouseEvent<HTMLButtonElement>) {
        // A keyboard press has no pointer: open from the first closed hour.
        if (e.detail === 0) {
            const open = column.day?.windows ?? [];
            let m = from;
            while (m < to && open.some(([a, b]) => m >= a && m < b)) m += 30;
            onClosed(column, Math.min(m, to - 60));
            return;
        }
        const r = e.currentTarget.getBoundingClientRect();
        const m = Math.round(((e.clientY - r.top) / PX + from) / 30) * 30;
        onClosed(column, Math.max(from, Math.min(to - 60, m)));
    }

    return (
        <div className="overflow-auto rounded-[12px] border border-border bg-card">
            <div
                className="grid min-w-[560px] grid-cols-[52px_repeat(var(--cols),minmax(170px,1fr))] max-[759px]:min-w-0 max-[759px]:grid-cols-[52px_minmax(0,1fr)]"
                style={{ "--cols": columns.length } as CSSProperties}
            >
                <div className="border-b border-border" />
                {columns.map((c) => (
                    <div
                        key={c.key}
                        className={cn(
                            "min-w-0 border-b border-l border-b-border border-l-border/60 px-3 py-2.5",
                            c.key !== phoneKey && "max-[759px]:hidden",
                        )}
                    >
                        <div className="truncate text-[13px] font-semibold">
                            {c.name}
                        </div>
                        <div className="truncate text-[11.5px] text-muted-foreground">
                            {columnSub(c)}
                        </div>
                    </div>
                ))}
                <HourRail span={span} />
                {columns.map((c) => (
                    <div
                        key={c.key}
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
                                className={cn(
                                    "absolute inset-0 z-0 w-full cursor-copy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                    CLOSED_HATCH,
                                )}
                            />
                        ) : (
                            <div
                                aria-hidden
                                className={cn("absolute inset-0", CLOSED_HATCH)}
                            />
                        )}
                        {c.day?.off.map(([a, b]) => (
                            <div
                                key={`o${a}`}
                                aria-hidden
                                className={cn(
                                    "pointer-events-none absolute inset-x-0",
                                    OFF_HATCH,
                                )}
                                style={{
                                    top: at(Math.max(a, from), from),
                                    height: tall(
                                        Math.max(a, from),
                                        Math.min(b, to),
                                    ),
                                }}
                            />
                        ))}
                        {canBook
                            ? c.day?.free.map((f) => (
                                  <button
                                      key={`f${f[0]}`}
                                      type="button"
                                      onClick={() => onFree(c, f)}
                                      aria-label={`Book ${c.name} at ${clock(f[0])}, free until ${clock(f[1])}`}
                                      className="absolute inset-x-1 z-[1] box-border flex cursor-pointer flex-col items-start justify-start overflow-hidden rounded-[7px] border border-dashed border-success-subtle-foreground bg-success-subtle px-[7px] py-[3px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                                      style={{
                                          top: at(f[0], from),
                                          height: tall(f[0], f[1]),
                                      }}
                                  >
                                      <span className="block text-[11px] font-semibold text-success-subtle-foreground">
                                          Free {clock(f[0])}–{clock(f[1])}
                                      </span>
                                  </button>
                              ))
                            : null}
                        {c.blocks.map((b) => (
                            <button
                                key={b.key}
                                type="button"
                                onClick={() => onBlock(b)}
                                aria-label={blockLabel(b)}
                                className={cn(
                                    "absolute inset-x-1 z-[2] box-border flex cursor-pointer flex-col items-stretch justify-start overflow-hidden rounded-[7px] px-[7px] py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                    blockColour(b),
                                    selected === b.key &&
                                        "ring-2 ring-highlight ring-offset-0",
                                    b.state === "cancelled" && "line-through",
                                )}
                                style={{
                                    top: at(b.start, from),
                                    height: tall(b.start, b.end),
                                    // A cancelled booking over the time it
                                    // gave back steps aside, so the free
                                    // gap under it can still be booked.
                                    ...(b.state === "cancelled" &&
                                    c.day?.free.some(
                                        ([fa, fb]) =>
                                            fa < b.end && b.start < fb,
                                    )
                                        ? { left: "auto", width: "34%" }
                                        : {}),
                                }}
                            >
                                <span className="block truncate text-[12px] font-bold">
                                    {blockTitle(b)}
                                </span>
                                <span className="block truncate text-[11px]">
                                    {clock(b.start)}–{clock(b.end)} ·{" "}
                                    {blockLine(b)}
                                </span>
                            </button>
                        ))}
                        {nowMinute !== null &&
                        nowMinute >= from &&
                        nowMinute <= to ? (
                            <div
                                aria-hidden
                                className="pointer-events-none absolute inset-x-0 z-[3] h-[2px] bg-highlight"
                                style={{ top: at(nowMinute, from) }}
                            />
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** "Trainer · 06:00–10:00, 17:00–21:00", or "· off today". */
export function columnSub(c: Column): string {
    const hours = c.day
        ? c.day.windows.length
            ? c.day.windows
                  .map(([a, b]) => `${clock(a)}–${clock(b)}`)
                  .join(", ")
            : "off today"
        : null;
    return [c.title, hours].filter(Boolean).join(" · ");
}
