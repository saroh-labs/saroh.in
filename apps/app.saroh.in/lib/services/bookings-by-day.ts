import { apiFetch, orgBase } from "@/lib/api/http";

import type { BookingsCalendar } from "./booking-calendar";

/**
 * All bookings, narrowed by its date filter (`lib/views/date-range.ts`):
 * a preset, or the days, each in the business's zone. The API lists a
 * booking by the day it starts; a day left out reaches as far as a range
 * may from the other. Null when it couldn't be read, as the register.
 */
export async function readBookingsByDay(ask: {
    date?: string;
    from?: string;
    to?: string;
}): Promise<BookingsCalendar | null> {
    const base = await orgBase();
    if (!base) return null;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(ask)) {
        if (value) query.set(key, value);
    }
    try {
        const res = await apiFetch(`${base}/services/bookings?${query}`);
        if (!res.ok) return null;
        return (await res.json()) as BookingsCalendar;
    } catch {
        return null;
    }
}
