/**
 * What can happen to a booking. A closed set so call sites never pass a raw,
 * typo-prone string, and so the screen can render each kind deliberately.
 */
export const BookingEventType = {
    Booked: "BOOKED",
    Rescheduled: "RESCHEDULED",
    Cancelled: "CANCELLED",
    Attended: "ATTENDED",
    NoShow: "NO_SHOW",
} as const;

export type BookingEventType =
    (typeof BookingEventType)[keyof typeof BookingEventType];
