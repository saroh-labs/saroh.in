import { createHash } from "node:crypto";

import type { EventInput } from "./google/google-calendar.port";

/**
 * What a booking looks like in Google (#1047, R7): a plain default until
 * the owner decides the wording from a real booking. Pure: the handler
 * reads the rows, this shapes them.
 */

/**
 * The event's id in Google, chosen by Saroh: the same booking on the same
 * connection is always the same event, so a retried job finds the one it
 * made instead of making a second. Google's ids are base32hex (0-9, a-v),
 * 5 to 1024 characters; a hex digest fits.
 */
export function eventIdFor(bookingId: string, connectionId: string): string {
    const digest = createHash("sha256")
        .update(`${bookingId}:${connectionId}`)
        .digest("hex");
    return `saroh${digest.slice(0, 40)}`;
}

export interface BookingForEvent {
    id: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    bookerName: string | null;
    bookerEmail: string | null;
    serviceName: string;
    online: boolean;
}

/** One line of the business's address, or null when it has none. */
export function addressLine(
    p: {
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        postalCode: string | null;
    } | null,
): string | null {
    if (!p) return null;
    const parts = [p.addressLine1, p.addressLine2, p.city, p.postalCode]
        .map((part) => part?.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
}

export function eventFor(
    booking: BookingForEvent,
    opts: { connectionId: string; meet: boolean; address: string | null },
): EventInput {
    const eventId = eventIdFor(booking.id, opts.connectionId);
    const who = booking.bookerName?.trim();
    const email = booking.bookerEmail?.trim();
    const location = booking.online ? "Online" : opts.address;
    return {
        eventId,
        title: who ? `${booking.serviceName} with ${who}` : booking.serviceName,
        description: "Booked through Saroh.",
        ...(location ? { location } : {}),
        startAt: booking.startAt,
        endAt: booking.endAt,
        timeZone: booking.timezone,
        // The customer is invited, so Google emails them (R6).
        ...(email ? { guest: { email, ...(who ? { name: who } : {}) } } : {}),
        bookingId: booking.id,
        // One request id per event: asking again returns the same Meet.
        ...(opts.meet ? { meetRequestId: eventId } : {}),
    };
}
