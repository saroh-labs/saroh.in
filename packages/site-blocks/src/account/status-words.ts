import type { AccountOrder } from "./model";

export { bookingTag } from "./bookings-model";

/**
 * An order's stage in the customer's words (DEC-172, plan U12): one
 * mapping for every look, so Home, Orders and an order's own page say the
 * same thing.
 *
 * The API words each order by its own fulfilment type's step
 * (`site-accounts/account-track.ts`): the step's label ("New",
 * "Preparing", "Ready", "Collected", "Out for delivery", "Handed to
 * courier", "Delivered", "Paid", "Sent", "Booked", "Attended") or how it
 * ended ("Refunded", "Cancelled"), beside the type's label ("Pick-up",
 * "Local delivery", "Shipping", "Digital", "Booking, in person"…). This
 * turns that pair into what a customer reads.
 *
 * The rule the owner set: a pick-up order is never "on its way"; only a
 * delivery is. A word this build doesn't know is shown as the API sent
 * it, except a delivery word on a pick-up, which reads as the pick-up's
 * own.
 */

export type OrderWay =
    "pick-up" | "delivery" | "shipping" | "digital" | "visit";

/** How the order reaches the customer, from the API's type label. */
export function orderWay(fulfilment: string): OrderWay {
    const label = fulfilment.trim().toLowerCase();
    if (label.startsWith("pick")) return "pick-up";
    if (label.startsWith("local")) return "delivery";
    if (label.startsWith("ship")) return "shipping";
    if (label.startsWith("digital")) return "digital";
    if (label.startsWith("booking")) return "visit";
    // An older API or a type this build doesn't know: nothing it says
    // may promise a journey, so it reads as collected in person.
    return "pick-up";
}

/**
 * Steps that read the same whatever the way: how an order ended, and the
 * words that need no way beside them. (Keys unquoted: the API's own
 * step words, never shown as they are.)
 */
const PLAIN: Record<string, string> = {
    refunded: "Refunded",
    cancelled: "Cancelled",
    new: "Order placed",
    collected: "Picked up",
    paid: "Paid",
    booked: "Booked",
    attended: "Attended",
};

/** A pick-up's own word where another way's would promise a journey. */
const READY = "Ready for pick-up";

/** What goes past the door: never said of a pick-up. */
const ON_ITS_WAY = /on its way|out for delivery|courier|shipped|delivered/i;

/** The order's stage in a customer's words: "Being made · for pick-up". */
export function orderStatusWords(
    order: Pick<AccountOrder, "status" | "fulfilment">,
): string {
    const way = orderWay(order.fulfilment);
    const step = order.status.trim().toLowerCase();
    const plain = PLAIN[step];
    if (plain) return plain;
    switch (step) {
        case "preparing":
            return way === "pick-up"
                ? "Being made · for pick-up"
                : way === "digital"
                  ? "Being prepared"
                  : "Being made and packed";
        case "ready":
            return way === "pick-up" ? READY : "Packed, waiting to leave";
        case "out for delivery":
            return way === "pick-up" ? READY : "On its way";
        case "handed to courier":
            return way === "pick-up" ? READY : "With the courier";
        case "delivered":
            return way === "pick-up"
                ? "Picked up"
                : way === "visit"
                  ? "Done"
                  : "Delivered";
        case "sent":
            return "Sent to your email";
        default:
            if (way === "pick-up" && ON_ITS_WAY.test(order.status)) {
                return READY;
            }
            return order.status;
    }
}
