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
    // Payment taken at the desk (P2): the history says who took it.
    PaidAtDesk: "PAID_AT_DESK",
    // Given to someone else, or to someone when it had nobody (#1157):
    // the line names both people, and the time when it moved too.
    Reassigned: "REASSIGNED",
    // An unpaid hold whose time ran out (#1137): nobody chose it, so it is
    // neither the customer's cancel nor the business's. No actor.
    Lapsed: "LAPSED",
    // The money paid online for it going back, or the provider refusing
    // to (#1137): `data` names the refund, its amount and outcome.
    Refunded: "REFUNDED",
    RefundFailed: "REFUND_FAILED",
} as const;

export type BookingEventType =
    (typeof BookingEventType)[keyof typeof BookingEventType];
