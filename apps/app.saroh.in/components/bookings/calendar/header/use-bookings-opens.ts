"use client";

import { showError } from "@saroh/ui/toast";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import type { BookingsOpens } from "@/lib/services/bookings-opens";
import { saveBookingsOpens } from "@/lib/services/bookings-opens-actions";

/**
 * Where Bookings opens for this person (DEC-170), as the "…" sheet and
 * Whose bookings change it: shown at once, kept by the API behind, and put
 * back with the reason when keeping it fails. Nothing on the calendar
 * waits for it.
 */
export function useBookingsOpens(initial: BookingsOpens) {
    const [opens, setOpens] = useState(initial);
    const [from, setFrom] = useState(initial);
    // A new read of the page (a refresh, another business) wins.
    if (from !== initial) {
        setFrom(initial);
        setOpens(initial);
    }

    async function change(next: Partial<BookingsOpens>) {
        const was = opens;
        setOpens({ ...opens, ...next });
        const res = await runAction(() => saveBookingsOpens(next));
        if (!res) {
            setOpens(was);
            return;
        }
        if (!res.ok) {
            setOpens(was);
            showError(res.error);
        }
    }

    return { opens, change };
}
