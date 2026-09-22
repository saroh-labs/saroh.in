/**
 * The link a booking is joined by (ADR-007), read from its frozen snapshot —
 * the terms agreed when it was made, so a link changed on the service later
 * reaches new bookings, never this one. The API's booker answer reads it the
 * same way (`toPublicBooking`).
 *
 * Null for an in-person booking, one made before services could be online,
 * and a cancelled one, which no longer holds a place in the class.
 */
export function joinLink(booking: {
    snapshot: unknown;
    status: string;
}): string | null {
    if (booking.status === "CANCELLED") return null;
    const snapshot = booking.snapshot;
    if (!snapshot || typeof snapshot !== "object") return null;
    const service = (snapshot as { service?: unknown }).service;
    if (!service || typeof service !== "object") return null;
    const { locationType, meetingUrl } = service as {
        locationType?: unknown;
        meetingUrl?: unknown;
    };
    if (locationType !== "ONLINE" || typeof meetingUrl !== "string") {
        return null;
    }
    // Only ever an https link — the API refuses anything else, and this is
    // rendered as an href.
    return meetingUrl.startsWith("https://") ? meetingUrl : null;
}
