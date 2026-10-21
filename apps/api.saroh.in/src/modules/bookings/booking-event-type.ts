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

/**
 * `data` on the CANCELLED of a place in a class the business cancelled as
 * a whole (U17, DEC-178 #1172): that it was the class, and the reason the
 * business gave, in its own words. A cancel made before #1172 has no
 * reason (and no `data`); its words stay as they were.
 */
export interface ClassCancelledData {
    classCancelled: true;
    reason?: string;
}

/** The CANCELLED event's `data` for a class cancelled as a whole. */
export function classCancelledData(
    reason: string | null | undefined,
): ClassCancelledData {
    return reason ? { classCancelled: true, reason } : { classCancelled: true };
}

/** The reason a class was cancelled with, from its event's `data`. */
export function classCancelReasonOf(data: unknown): string | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const reason = (data as { reason?: unknown }).reason;
    return typeof reason === "string" && reason.trim() !== ""
        ? reason.trim()
        : null;
}
