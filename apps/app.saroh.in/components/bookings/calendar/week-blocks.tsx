"use client";

import { formatClockRange } from "@/lib/format/datetime";
import { cn } from "@saroh/ui/lib/utils";
import type { CSSProperties } from "react";

import type { Block, Column, Span } from "@/lib/services/diary";
import { blockTitle } from "@/lib/services/diary";

import { blockColour } from "./diary-block";
import { at, tall } from "./geometry";

/** What the desk's week draws in a day (U5, BKDCalendarWeek). */

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/**
 * Free time on the week: a dashed green box over the gap. It books (or
 * blocks) from where it starts; for a role that only reads the calendar it
 * is drawn, not pressed.
 */
export function WeekFree({
    column,
    free,
    from,
    short,
    place,
    onBook,
}: {
    column: Column;
    free: Span;
    from: number;
    /** Lanes are narrow: "Free" alone. */
    short: boolean;
    place?: CSSProperties;
    onBook: (() => void) | null;
}) {
    const text = short
        ? "Free"
        : `Free · ${formatClockRange(free[0], free[1])}`;
    const style: CSSProperties = {
        top: `calc(${at(free[0], from)} + 1px)`,
        height: `calc(${tall(free[0], free[1])} - 2px)`,
        ...place,
    };
    const look =
        "absolute inset-x-1 z-[1] box-border flex items-center overflow-hidden whitespace-nowrap rounded-[7px] border-[1.5px] border-dashed border-success/60 bg-success-subtle px-[5px] text-left text-[10.5px] font-semibold text-success-subtle-foreground";
    if (!onBook) {
        return (
            <div data-week-free="" className={look} style={style}>
                <span className="truncate">{text}</span>
            </div>
        );
    }
    return (
        <button
            type="button"
            data-week-free=""
            onClick={onBook}
            aria-label={`Free ${formatClockRange(free[0], free[1])}, ${column.name}. Book or block`}
            className={cn(
                look,
                "cursor-pointer transition-colors duration-fast hover:border-solid hover:border-success-subtle-foreground",
                FOCUS,
            )}
            style={style}
        >
            <span className="truncate">{text}</span>
        </button>
    );
}

/**
 * A booking in a person's lane on Everyone: the lane is narrow, so the
 * first name (or the class) alone; its full name is its label.
 */
export function LaneBlock({
    block,
    from,
    selected,
    label,
    place,
    onOpen,
}: {
    block: Block;
    from: number;
    selected: boolean;
    label: string;
    place?: CSSProperties;
    onOpen: () => void;
}) {
    const title = blockTitle(block);
    const name = block.kind === "one" ? (title.split(" ")[0] ?? title) : title;
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={label}
            data-diary-block={block.kind}
            className={cn(
                "absolute inset-x-1 z-[2] box-border flex cursor-pointer items-center overflow-hidden rounded-[7px] px-[5px] text-left transition-[filter] duration-fast hover:brightness-110 active:brightness-90",
                FOCUS,
                blockColour(block),
                selected && "ring-2 ring-foreground ring-offset-0",
            )}
            style={{
                top: `calc(${at(block.start, from)} + 1px)`,
                height: `calc(${tall(block.start, block.end)} - 2px)`,
                minHeight: tall(0, 28),
                ...place,
            }}
        >
            <span className="min-w-0 truncate text-[11px] font-bold">
                {name}
            </span>
        </button>
    );
}
