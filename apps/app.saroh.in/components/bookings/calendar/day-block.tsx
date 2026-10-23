"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { CSSProperties } from "react";

import { dayLine, dayPill } from "@/lib/services/day-view";
import type { Block } from "@/lib/services/diary";
import { blockTitle, isLive } from "@/lib/services/diary";
import { MIN_BLOCK_MINUTES } from "@/lib/services/diary-view";

import { blockColour, blockLabel, DiaryBlock } from "./diary-block";
import { at, tall } from "./geometry";

/**
 * Under this many minutes a desk block has one row: the name, its line and
 * its pill side by side. 55 minutes is 44px at the desk's 0.8px a minute,
 * where the board turns a block into rows (BKDCalendarDay, `.blk.tall`).
 */
const DESK_ROWS_FROM_MINUTES = 55;

/**
 * One booking or class on the Day calendar (U4, #1020), as the boards draw
 * it: the name in bold, one pill (Came, Didn't come, Awaiting payment, Pays
 * at the visit, Paid, "2 to pay"), and one line, "9:00 to 9:45 am · Physio
 * assessment". On the desk the pill sits under the line, or beside it in a
 * short block; on a phone it sits beside the name, and the block is never
 * under 44px. On Everyone's day on a phone the name says whose it is,
 * "Ananya Desai · Meera". A tap opens the quick look.
 *
 * A cancelled booking, when they are shown, is the diary's thin struck line
 * (`DiaryBlock`), which takes no room from the time it gave back.
 */
export function DayBlock({
    block,
    from,
    selected,
    who,
    onOpen,
    place,
}: {
    block: Block;
    /** The first minute the diary shows. */
    from: number;
    selected: boolean;
    /** Whose it is, on Everyone's day on a phone. */
    who?: string;
    onOpen: () => void;
    /** Its lane: left and width, when it shares its time with another. */
    place?: CSSProperties;
}) {
    const label = who ? `${blockLabel(block)}, with ${who}` : blockLabel(block);
    if (!isLive(block)) {
        return (
            <DiaryBlock
                block={block}
                from={from}
                selected={selected}
                label={label}
                onOpen={onOpen}
                place={place}
            />
        );
    }
    const title = who ? `${blockTitle(block)} · ${who}` : blockTitle(block);
    const pill = dayPill(block);
    const oneRow = block.end - block.start < DESK_ROWS_FROM_MINUTES;
    const quiet = block.state === "noshow";
    const pillClass = cn(
        "shrink-0 whitespace-nowrap rounded-[4px] px-[5px] text-[10.5px] font-semibold leading-4",
        quiet
            ? "bg-card text-muted-foreground"
            : "bg-diary-foreground/90 text-diary-one",
    );
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={label}
            data-diary-block={block.kind}
            data-day-block=""
            className={cn(
                "absolute inset-x-1 z-[2] box-border flex cursor-pointer overflow-hidden text-left transition-[filter] duration-fast hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:brightness-90",
                // The desk: one row in a short block, else rows centred.
                "rounded-[7px] px-[7px]",
                oneRow
                    ? "flex-row items-center gap-1.5"
                    : "flex-col items-stretch justify-center gap-px",
                // A phone: always rows from the top, never under 44px.
                "max-[759px]:flex-col max-[759px]:items-stretch max-[759px]:justify-start max-[759px]:gap-px max-[759px]:rounded-[8px] max-[759px]:px-[9px] max-[759px]:py-1.5",
                blockColour(block),
                selected && "ring-2 ring-foreground ring-offset-0",
            )}
            style={{
                top: `calc(${at(block.start, from)} + 1px)`,
                height: `calc(${tall(block.start, block.end)} - 2px)`,
                minHeight: tall(0, MIN_BLOCK_MINUTES),
                ...place,
            }}
        >
            <span
                className={cn(
                    "flex min-w-0 items-center gap-1.5",
                    oneRow && "min-[760px]:max-w-[45%] min-[760px]:shrink-0",
                )}
            >
                <span
                    data-day-block-name=""
                    className="min-w-0 flex-1 truncate text-[12px] font-bold max-[759px]:text-[13px]"
                >
                    {title}
                </span>
                {/* On a phone the pill rides beside the name. */}
                {pill ? (
                    <span
                        aria-hidden
                        className={cn(pillClass, "min-[760px]:hidden")}
                    >
                        {pill}
                    </span>
                ) : null}
            </span>
            <span
                className={cn(
                    "block min-w-0 truncate text-[11px] max-[759px]:text-[11.5px]",
                    oneRow && "min-[760px]:flex-1",
                )}
            >
                {dayLine(block)}
            </span>
            {/* On the desk it sits under the line, or at the end of a row. */}
            {pill ? (
                <span
                    data-day-pill=""
                    aria-hidden
                    className={cn(
                        pillClass,
                        "max-[759px]:hidden",
                        oneRow ? "self-center" : "self-start",
                    )}
                >
                    {pill}
                </span>
            ) : null}
        </button>
    );
}
