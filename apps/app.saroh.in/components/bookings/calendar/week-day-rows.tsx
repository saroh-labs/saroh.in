"use client";

import { formatClock } from "@/lib/format/datetime";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import type { Block, Column, Span } from "@/lib/services/diary";
import {
    blockLine,
    blockTitle,
    isLive,
    STATE_LABEL,
} from "@/lib/services/diary";

import { STATE_TONE } from "./parts";

/**
 * The rows of a day's list on the phone's week (U5, BKMBookingsWeek): a
 * free time to book, and a booking to open.
 */

const firstName = (name: string) => name.split(" ")[0] ?? name;

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

/** A booking: its times, a bar in the kind's colour, who and what, its state. */
export function BookingRow({
    block: b,
    selected,
    onOpen,
}: {
    block: Block;
    selected: boolean;
    onOpen: () => void;
}) {
    const cancelled = !isLive(b);
    return (
        <li>
            <button
                type="button"
                onClick={onOpen}
                className={cn(
                    ROW,
                    "min-h-[60px] items-stretch bg-card py-2.5 active:bg-muted",
                    selected && "ring-2 ring-inset ring-foreground",
                    cancelled && "text-muted-foreground",
                )}
            >
                <span className="w-[76px] shrink-0 whitespace-nowrap tabular-nums">
                    <span className="block text-[14px] font-bold">
                        {formatClock(b.start)}
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground">
                        {formatClock(b.end)}
                    </span>
                </span>
                <span
                    aria-hidden
                    className={cn(
                        "w-1 shrink-0 rounded-sm",
                        cancelled
                            ? "bg-border-strong"
                            : b.kind === "class"
                              ? "bg-diary-class"
                              : "bg-diary-one",
                    )}
                />
                <span className="min-w-0 flex-1">
                    <span
                        className={cn(
                            "block text-[14px] font-semibold",
                            cancelled && "line-through",
                        )}
                    >
                        {blockTitle(b)}
                    </span>
                    <span className="block text-[12.5px] text-muted-foreground">
                        {blockLine(b)}
                    </span>
                </span>
                <StatusBadge tone={STATE_TONE[b.state]} className="self-center">
                    {STATE_LABEL[b.state]}
                </StatusBadge>
            </button>
        </li>
    );
}
