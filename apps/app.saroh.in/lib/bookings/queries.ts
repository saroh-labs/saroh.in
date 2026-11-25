import { z } from "zod";

import type { MomentView } from "@/lib/moments/keys";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { ShareLink } from "@/lib/sites/share-links";
import type { DateRange } from "@/lib/views/date-range";
import { dateRangeAsk } from "@/lib/views/date-range";

/**
 * The bookings list's read (DEC-259). Client-safe: the key, the route and
 * how an address becomes the days read; the service is paired in
 * `access.ts`.
 */

/** Every bookings read of a business: what a save on the list invalidates. */
export const bookingsKeys = (orgId: string): DomainKey =>
    domainKey("bookings", orgId);

/** The list as the screen draws it. */
export interface BookingsList {
    /** Each booking, amounts left out for a role that may not see money. */
    bookings: DiaryBooking[];
    /** The business's zone: every time is read in it (Q10). */
    timezone: string;
    /** The server's now at the read, so the rows and their views agree. */
    now: number;
    /**
     * The business's first booking (wave G), said once: only the whole
     * register (no date asked) can say it is the first.
     */
    moment: MomentView | null;
    /**
     * No bookings at all yet: "Share your booking page" while it is live
     * (DEC-069, L8); null otherwise, or when the web address can't be read.
     */
    share: ShareLink | null;
}

const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional();

/** What the API is asked: a date preset, or the days (`dateRangeAsk`). */
export type BookingsAsk = ReturnType<typeof dateRangeAsk>;

/** The register (no date asked), or the bookings starting on those days. */
export const bookingsRead = defineRead<BookingsList>()({
    key: (orgId, ask) => domainKey("bookings", orgId, "list", ask),
    route: {
        path: "/api/bookings",
        params: {
            date: z.enum(["today", "yesterday", "7d", "month"]).optional(),
            from: day,
            to: day,
        },
    },
});

/**
 * The address's date filter as the read's params. An `undefined` field is
 * no param, and drops out of the key's hash too.
 */
export function bookingsAsk(dates: DateRange): BookingsAsk {
    return dateRangeAsk(dates);
}
