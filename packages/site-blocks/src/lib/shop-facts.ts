import { formatAmount } from "./money";

/**
 * What an order costs to receive, said under the product's price before
 * anything is in the bag: "Pick-up free · Local delivery ₹60 · Free
 * delivery from ₹999".
 *
 * Built only from what the location's checkout offers now: each way an
 * order can leave with its fee, and "Free delivery from" when the location
 * set an amount and a delivery here has a fee for it to waive. Nothing is
 * said for a shop that isn't taking orders, and nothing is guessed.
 */
export interface ShopFactsInput {
    currency: string;
    /** The ways the location offers, in its own words, with each fee. */
    ways: readonly { label: string; fee: string | null }[];
    /** "999.00": delivery is free once the items reach it; null for none. */
    freeDeliveryOver?: string | null;
}

export function shopFactsLine(
    input: ShopFactsInput | null | undefined,
    locale = "en-IN",
): string | null {
    if (!input || input.ways.length === 0) return null;
    const parts = input.ways.map((way) =>
        way.fee
            ? `${way.label} ${formatAmount(way.fee, input.currency, locale)}`
            : `${way.label} free`,
    );
    const over = input.freeDeliveryOver;
    if (over && Number(over) > 0 && input.ways.some((way) => way.fee)) {
        // "from", not "over": an order of exactly the amount is free too.
        parts.push(
            `Free delivery from ${formatAmount(over, input.currency, locale)}`,
        );
    }
    return parts.join(" · ");
}
