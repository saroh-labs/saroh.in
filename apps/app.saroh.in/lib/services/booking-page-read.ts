import { getJson, orgBase } from "@/lib/api/http";

import type { PageBooking } from "./booking-page";

/**
 * One booking for its page (U12, #1028). Server-only.
 *
 * Null for a booking that isn't there for this person: missing, another
 * business's, or one a calendar-only person may not open (the API answers
 * 404 for all three, so nothing can be probed). Any other failure THROWS,
 * so the page's boundary says "Couldn't load this booking" with Try again
 * rather than a "Page not found" that isn't true (`getJson`).
 */
export async function readBookingPage(
    bookingId: string,
): Promise<PageBooking | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<PageBooking>(
        `${base}/services/bookings/${encodeURIComponent(bookingId)}`,
    );
}
