import { formatMoney } from "@/lib/format/money";

import type { BookingEvent } from "./service";

/*
 * The lines of a booking's What happened that nobody's hand made (#1137):
 * a hold that lapsed unpaid, and the money paid online going back. Pure,
 * so every word is tested; the card draws them.
 */

/** The kinds that follow from the system, not from a person. */
const NOBODYS = new Set<BookingEvent["type"]>([
    "LAPSED",
    "REFUNDED",
    "REFUND_FAILED",
]);

/**
 * Whether a line names who did it. A lapse or a refund has no actor and
 * isn't the customer's doing either, so it says neither name nor "by the
 * customer".
 */
export function namesWho(event: Pick<BookingEvent, "type">): boolean {
    return !NOBODYS.has(event.type);
}

/** The money a refund line is about, from its `data`; null when unreadable. */
function refundAmount(event: Pick<BookingEvent, "data">): string | null {
    const data = event.data;
    if (!data || typeof data.amountCents !== "number") return null;
    return formatMoney(data.amountCents, data.currency ?? null);
}

/**
 * The words of a lapse or refund line, or null for any other kind:
 * "Lapsed: not paid in time", "Refunded ₹500 to how they paid",
 * "Refund failed".
 */
export function systemEventTitle(
    event: Pick<BookingEvent, "type" | "data">,
): string | null {
    switch (event.type) {
        case "LAPSED":
            return "Lapsed: not paid in time";
        case "REFUNDED": {
            const amount = refundAmount(event);
            return amount
                ? `Refunded ${amount} to how they paid`
                : "Refunded to how they paid";
        }
        case "REFUND_FAILED":
            return "Refund failed";
        default:
            return null;
    }
}

/**
 * The reason a whole class was cancelled with, on its place's CANCELLED
 * line (DEC-178, #1172), in the business's own words; null for any other
 * line, and for a class cancelled before reasons were asked.
 */
export function classCancelReason(
    event: Pick<BookingEvent, "type" | "data">,
): string | null {
    if (event.type !== "CANCELLED") return null;
    const reason = event.data?.reason;
    return typeof reason === "string" && reason.trim() !== ""
        ? reason.trim()
        : null;
}

/** A place in a class the business cancelled as a whole (U17). */
export function isClassCancel(
    event: Pick<BookingEvent, "type" | "data">,
): boolean {
    return event.type === "CANCELLED" && event.data?.classCancelled === true;
}
