"use client";

import { formatClock, formatClockRange } from "@/lib/format/datetime";
import { cn } from "@saroh/ui/lib/utils";
import type { CSSProperties } from "react";

import type { Block } from "@/lib/services/diary";
import {
    blockLine,
    blockTitle,
    isLive,
    STATE_LABEL,
} from "@/lib/services/diary";
import {
    MIN_BLOCK_MINUTES,
    ONE_LINE_UNDER_MINUTES,
    toPayText,
} from "@/lib/services/diary-view";

import { at, tall } from "./geometry";

/** A booking's one solid colour by kind; a no-show steps back to grey. */
export function blockColour(block: Block): string {
    if (block.state === "noshow") return "bg-muted text-muted-foreground";
    return block.kind === "class"
        ? "bg-diary-class text-diary-foreground"
        : "bg-diary-one text-diary-foreground";
}

/** "9:00 to 10:00 am Tariq Ali, Personal training, Booked, to pay". */
export function blockLabel(block: Block): string {
    const owes = toPayText(block);
    return `${formatClockRange(block.start, block.end)} ${blockTitle(block)}, ${blockLine(block)}, ${STATE_LABEL[block.state]}${owes ? `, ${owes.toLowerCase()}` : ""}`;
}

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/**
 * One thing on the diary, drawn the same on the day and the week.
 *
 * A booking that still happens is the only solid colour on the page. It is
 * never shorter than one readable line, and the name comes first: a short
 * booking keeps its name and gives up its time before that. A booking with
 * money still to take wears a small "To pay", and says so in its name for a
 * screen reader.
 *
 * A cancelled booking, when they are shown, is a thin struck line at its
 * start: it takes no room from the time it gave back.
 */
export function DiaryBlock({
    block,
    from,
    selected,
    label,
    onOpen,
    place,
}: {
    block: Block;
    /** The first minute the diary shows. */
    from: number;
    selected: boolean;
    /** Its accessible name; the week adds the day before it. */
    label: string;
    onOpen: () => void;
    /** Its lane: left and width, when it shares its time with another. */
    place?: CSSProperties;
}) {
    if (!isLive(block)) {
        return (
            <button
                type="button"
                onClick={onOpen}
                aria-label={label}
                data-diary-block="cancelled"
                className={cn(
                    "absolute inset-x-1 z-[2] box-border flex h-[18px] cursor-pointer items-center rounded-[5px] border bg-card px-1.5 text-left text-[11px] leading-none text-muted-foreground transition-colors duration-fast hover:border-border-strong hover:text-foreground coarse:after:absolute coarse:after:-inset-y-[13px] coarse:after:inset-x-0 coarse:after:content-['']",
                    FOCUS,
                    selected ? "border-foreground" : "border-border",
                )}
                style={{ top: at(block.start, from), ...place }}
            >
                <span className="min-w-0 truncate line-through">
                    {blockTitle(block)} · {formatClock(block.start)}
                </span>
            </button>
        );
    }

    const oneLine = block.end - block.start < ONE_LINE_UNDER_MINUTES;
    const owes = toPayText(block);
    const mark = owes ? (
        <span
            data-to-pay=""
            className="shrink-0 whitespace-nowrap rounded-[4px] border border-current px-1 text-[11px] font-medium leading-[14px]"
        >
            {owes}
        </span>
    ) : null;
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={label}
            data-diary-block={block.kind}
            className={cn(
                "absolute inset-x-1 z-[2] box-border flex cursor-pointer overflow-hidden rounded-[7px] px-[7px] text-left transition-[filter] duration-fast hover:brightness-110 active:brightness-90",
                FOCUS,
                oneLine
                    ? "flex-row items-center gap-1.5"
                    : "flex-col items-stretch justify-start py-1",
                blockColour(block),
                selected && "ring-2 ring-foreground ring-offset-0",
            )}
            style={{
                top: at(block.start, from),
                height: tall(block.start, block.end),
                minHeight: tall(0, MIN_BLOCK_MINUTES),
                ...place,
            }}
        >
            {oneLine ? (
                <>
                    <span className="min-w-0 truncate text-[12px] font-bold">
                        {blockTitle(block)}
                    </span>
                    {mark}
                    {/* The time gives way before the name does. */}
                    <span className="min-w-0 shrink-[99] overflow-hidden whitespace-nowrap text-[11px]">
                        {formatClock(block.start)}
                    </span>
                </>
            ) : (
                <>
                    <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold">
                            {blockTitle(block)}
                        </span>
                        {mark}
                    </span>
                    <span className="block truncate text-[11px]">
                        {formatClockRange(block.start, block.end)} ·{" "}
                        {blockLine(block)}
                    </span>
                </>
            )}
        </button>
    );
}

/** A lane's left and width, for a block that shares its time with another. */
export function lanePlace(lane: {
    lane: number;
    lanes: number;
}): CSSProperties | undefined {
    if (lane.lanes <= 1) return undefined;
    return {
        left: `calc(${(lane.lane / lane.lanes) * 100}% + 2px)`,
        width: `calc(${100 / lane.lanes}% - 4px)`,
        right: "auto",
    };
}
