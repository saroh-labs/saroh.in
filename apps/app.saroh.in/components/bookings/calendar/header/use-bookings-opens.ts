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
    // Changes on their way to the API.
    const [saving, setSaving] = useState(0);
    // A new read of the page that says something new (another business,
    // a change made elsewhere) wins. One that says what the last did is
    // only a refresh; and while a change is on its way, a read is from
    // before it (a pick navigates first, then keeps the choice).
    if (!sameOpens(from, initial)) {
        setFrom(initial);
        if (saving === 0) setOpens(initial);
    }

    async function change(next: Partial<BookingsOpens>) {
        const was = opens;
        setOpens({ ...opens, ...next });
        setSaving((n) => n + 1);
        const res = await runAction(() => saveBookingsOpens(next));
        setSaving((n) => n - 1);
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

function sameOpens(a: BookingsOpens, b: BookingsOpens): boolean {
    return (
        a.start === b.start &&
        a.showFor === b.showFor &&
        a.lastPerson === b.lastPerson
    );
}
