"use client";

import { formatClock } from "@/lib/format/datetime";
import { cn } from "@saroh/ui/lib/utils";
import type { MouseEvent, PointerEvent } from "react";
import { useState } from "react";

import type { Column, Span } from "@/lib/services/diary";
import { slotIn } from "@/lib/services/diary-view";

import { at, tall } from "./geometry";

/**
 * Free time someone can be booked in. It is the plain page: nothing is
 * drawn at rest, so the bookings are what the eye lands on. It is still a
 * button over the whole gap. Under a mouse the quarter hour it would book
 * shows as "Book 10:00 am"; on the keyboard the gap takes the focus ring and
 * shows where it starts; a tap books at the nearest quarter hour to the
 * finger. The keyboard books from the start of the gap.
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
    const shown = hover ?? free[0];

    return (
        <button
            type="button"
            data-free-gap=""
            aria-label={`Book ${column.name} at ${formatClock(free[0])}, free until ${formatClock(free[1])}`}
            onClick={(e) =>
                // A keyboard press has no pointer: book from the start.
                onBook(column, e.detail === 0 ? free : [slotAt(e), free[1]])
            }
            onPointerMove={(e) => {
                if (e.pointerType === "mouse") setHover(slotAt(e));
            }}
            onPointerLeave={() => setHover(null)}
            className="group absolute inset-x-0 z-[1] cursor-pointer rounded-[7px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            style={{ top: at(free[0], from), height: tall(free[0], free[1]) }}
        >
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute inset-x-1 min-h-[22px] items-center rounded-[6px] border border-border-strong bg-muted px-[7px] text-left text-[11px] font-semibold text-foreground",
                    hover === null ? "hidden group-focus-visible:flex" : "flex",
                )}
                style={{
                    top: at(shown, free[0]),
                    height: tall(shown, Math.min(shown + 30, free[1])),
                }}
            >
                Book {formatClock(shown)}
            </span>
        </button>
    );
}
