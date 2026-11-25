"use client";

import { formatClock } from "@/lib/format/datetime";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";

import { BOOKING_WORDS } from "@/lib/services/booking-words";
import type { Block, Column, Span } from "@/lib/services/diary";

import { firstName } from "@/lib/names";
import { BlockLine } from "./booking-line";

/**
 * The rows of a day's list on the phone's week (U5, BKMBookingsWeek): a
 * free time to book, and a booking to open.
 */

const ROW =
    "flex w-full gap-2.5 border-b border-border/60 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** "12:15 pm  Free · Meera until 1:00 pm  + Book". */
export function FreeRow({
    column,
    free,
    onBook,
}: {
    column: Column;
    free: Span;
    onBook: (() => void) | null;
}) {
    const body = (
        <>
            <span className="w-[76px] shrink-0 whitespace-nowrap text-[14px] font-bold tabular-nums">
                {formatClock(free[0])}
            </span>
            <span className="min-w-0 flex-1">
                Free · {firstName(column.name)} until {formatClock(free[1])}
            </span>
            {onBook ? (
                <span className="inline-flex shrink-0 items-center gap-1">
                    <Plus aria-hidden className="size-3.5" />
                    {BOOKING_WORDS.book}
                </span>
            ) : null}
        </>
    );
    const look = cn(
        ROW,
        "min-h-12 items-center bg-success-subtle py-1.5 text-[13px] font-semibold text-success-subtle-foreground",
    );
    return (
        <li data-week-free="">
            {onBook ? (
                <button
                    type="button"
                    onClick={onBook}
                    aria-label={`Book ${column.name}, free ${formatClock(free[0])} to ${formatClock(free[1])}`}
                    className={cn(look, "active:brightness-95")}
                >
                    {body}
                </button>
            ) : (
                <div className={look}>{body}</div>
            )}
        </li>
    );
}

/** A booking: the one line every view draws (`BlockLine`). */
export function BookingRow({
    block,
    selected,
    onOpen,
}: {
    block: Block;
    selected: boolean;
    onOpen: () => void;
}) {
    return (
        <li className="border-b border-border/60 last:border-b-0">
            <BlockLine block={block} selected={selected} onOpen={onOpen} />
        </li>
    );
}
