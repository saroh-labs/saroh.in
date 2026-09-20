/**
 * Statuses that mean the goods have not gone out yet.
 *
 * ONE definition, imported by both the Home read model (which badges the count
 * on the rail) and the row serializer (which decides what each row says). They
 * were separately-written lists that happened to agree; a screen that reports
 * "3 unfulfilled" over a list showing four of them is the bug that shape
 * produces, and it would have looked like a caching problem.
 */
export const UNFULFILLED_STATUSES = ["PENDING", "PROCESSING"] as const;

/**
 * What a row says in its status column.
 *
 * An order carries TWO independent states — `status` (where the goods are) and
 * `paymentStatus` (where the money is) — and the column has to show one thing.
 * Money wins: an order that was refunded reads as refunded even though its
 * goods state still says DELIVERED, because that is the fact a merchant
 * scanning this list is looking for. Cancelled next, then the goods states.
 *
 * Resolved once, here, rather than in the screen — otherwise every surface
 * that lists orders re-derives the precedence and one of them gets it wrong.
 */
export function orderStanding(
    status: string,
    paymentStatus: string,
): "REFUNDED" | "CANCELLED" | "FULFILLED" | "UNFULFILLED" {
    if (paymentStatus === "REFUNDED") return "REFUNDED";
    if (status === "CANCELLED") return "CANCELLED";
    return (UNFULFILLED_STATUSES as readonly string[]).includes(status)
        ? "UNFULFILLED"
        : "FULFILLED";
}
