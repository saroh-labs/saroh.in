import { apiFetch, orgBase } from "@/lib/api/http";

import type { BookingLinkView } from "./booking-link";
import { decodeBookingLink } from "./booking-link";

/**
 * "Your booking page" (DEC-175, `GET organizations/:id/booking-page`),
 * once per page. Server-only.
 *
 * Tolerant on purpose, never `getJson`: the row sits on the Services
 * screen, and a read it can't make (Bookings switched off, a role that
 * can't see services, an API without the route yet, the API down) must
 * not take the screen down with it. Null leaves the row out.
 */
export async function readBookingLink(): Promise<BookingLinkView | null> {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}/booking-page`);
        if (!res.ok) return null;
        return decodeBookingLink(await res.json());
    } catch {
        return null;
    }
}
