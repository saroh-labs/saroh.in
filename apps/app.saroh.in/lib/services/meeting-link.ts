/**
 * The link a booking is joined by (ADR-007), read from its frozen snapshot —
 * the terms agreed when it was made, so a link changed on the service later
 * reaches new bookings, never this one. The API's booker answer reads it the
 * same way (`toPublicBooking`).
 *
 * The booking's own Google Meet link comes first (#1047, GC-07): a service
 * that makes Meet links gives each booking its own room, written on the
 * booking once Google made it, so the team joins the room the customer was
 * invited to, not the service's typed fallback.
 *
 * Null for an in-person booking, one made before services could be online,
 * and a cancelled one, which no longer holds a place in the class.
 */
export function joinLink(booking: {
    snapshot: unknown;
    status: string;
    meetingUrl?: string | null;
}): string | null {
    if (booking.status === "CANCELLED") return null;
    const own = booking.meetingUrl;
    if (typeof own === "string" && own.startsWith("https://")) return own;
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
