"use client";

import { formatClock, formatClockRange } from "@/lib/format/datetime";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { useState } from "react";

import type { Column, Span } from "@/lib/services/diary";
import { slotIn } from "@/lib/services/diary-view";

import { at, tall } from "@/components/bookings/calendar/geometry";

/**
 * Free time someone can be booked in (U4, BA-04): a green dashed block that
 * says so, "Free · 12:15 to 1:00 pm", with "+ Book" at its end, on the desk
 * and on a phone alike (BKDCalendarDay, BKMBookingsDay). It is a button over
 * the whole gap and opens the free-time sheet, where the time can be booked
 * or blocked.
 *
 * Under a mouse it stays a desk shortcut: the border firms up and "Book"
 * names the quarter hour under the pointer, which is where a click books
 * from. A tap books from the quarter hour nearest the finger; the keyboard
 * from the start of the gap. On a phone it is never under 44px.
 */
export function FreeGap({
    column,
    free,
    from,
    onBook,
}: {
    column: Column;
    free: Span;
    /** The first minute the diary shows. */
    from: number;
    /** Book this person from the first minute of the span given. */
    onBook: (column: Column, free: Span) => void;
}) {
    const [hover, setHover] = useState<number | null>(null);

    // From the share of the gap's height, so it holds at any scale.
    const slotAt = (e: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        const share = r.height > 0 ? (e.clientY - r.top) / r.height : 0;
        return slotIn(
            free,
            free[0] + share * (free[1] - free[0]),
            column.shortest,
        );
    };
    const range = formatClockRange(free[0], free[1]);

    return (
        <button
            type="button"
            data-free-gap=""
            aria-label={`Free ${range} with ${column.name}. Book or block`}
            onClick={(e) =>
                // A keyboard press has no pointer: book from the start.
                onBook(column, e.detail === 0 ? free : [slotAt(e), free[1]])
            }
            onPointerMove={(e) => {
                if (e.pointerType === "mouse") setHover(slotAt(e));
            }}
            onPointerLeave={() => setHover(null)}
            className={cn(
                "absolute inset-x-1 z-[1] box-border flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-[7px] border-[1.5px] border-dashed border-success/50 bg-success-subtle px-2 text-left text-[11.5px] font-semibold text-success-subtle-foreground transition-colors duration-fast",
                "hover:border-solid hover:border-success-subtle-foreground focus-visible:border-solid focus-visible:border-success-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "max-[759px]:min-h-11 max-[759px]:justify-between max-[759px]:gap-2 max-[759px]:rounded-[8px] max-[759px]:px-2.5 max-[759px]:text-[12.5px]",
            )}
            style={{
                top: `calc(${at(free[0], from)} + 2px)`,
                height: `calc(${tall(free[0], free[1])} - 4px)`,
            }}
        >
            <span className="min-w-0 truncate">Free · {range}</span>
            <span
                aria-hidden
                data-free-book=""
                className="ml-auto inline-flex shrink-0 items-center gap-[3px] whitespace-nowrap max-[759px]:ml-0 max-[759px]:gap-1"
            >
                <Plus className="size-[13px] max-[759px]:size-3.5" />
                {hover === null ? "Book" : `Book ${formatClock(hover)}`}
            </span>
        </button>
    );
}
