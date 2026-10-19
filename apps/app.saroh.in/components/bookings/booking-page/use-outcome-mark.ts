"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { useHold } from "@/components/shared/use-hold";
import { recordBookingOutcome } from "@/lib/services/actions";
import type { BookingOutcome } from "@/lib/services/booking-state";
import { BOOKING_WORDS } from "@/lib/services/booking-words";

/**
 * Came / Didn't come on a booking's page (U12): shown at once, held ten
 * seconds with Undo on the toast and beside the buttons, then recorded.
 * A refusal says why and puts back what it was (`useHold`).
 */
export function useOutcomeMark({
    bookingId,
    saved,
    first,
    hold,
    undo,
    pending,
}: {
    bookingId: string;
    /** How it went, as the page read it. */
    saved: BookingOutcome | null;
    first: string;
} & Pick<ReturnType<typeof useHold>, "hold" | "undo" | "pending">) {
    const router = useRouter();
    const [mark, setMark] = useState<BookingOutcome | null | undefined>(
        undefined,
    );
    const key = `outcome:${bookingId}`;
    const outcome = mark === undefined ? saved : mark;

    const markOutcome = (next: BookingOutcome) => {
        const was = outcome;
        if (next === was) return;
        setMark(next);
        hold(
            key,
            next === "ATTENDED"
                ? `${first || "They"} ${BOOKING_WORDS.came.toLowerCase()}.`
                : `Marked ${first || "them"} as ${BOOKING_WORDS.didntCome.toLowerCase()}.`,
            async () => {
                try {
                    return await recordBookingOutcome(bookingId, next);
                } finally {
                    router.refresh();
                }
            },
            // Undone, refused or never got there: back to what it was,
            // unless a newer mark has been made on top of this one since.
            () =>
                setMark((now) =>
                    now === next ? (was === saved ? undefined : was) : now,
                ),
        );
    };

    return {
        outcome,
        /** Marked here, not yet read back from the server. */
        markedHere: mark !== undefined,
        markOutcome,
        /** Undo for a mark still held, or null. */
        undoMark: pending.includes(key) ? () => undo(key) : null,
    };
}
