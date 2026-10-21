import { dateText } from "../booking-flow/model";
import { formatAmount } from "./money";
import type { OpeningHoursDay } from "./opening-hours";
import { clockText, nextOpening, openState } from "./opening-hours";

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

/** What a way to receive an order is called mid-sentence. */
const WAY_WORDS: Partial<Record<string, string>> = {
    PICKUP: "pick-up",
    LOCAL_DELIVERY: "local delivery",
    SHIPPING: "shipping",
};

/** What the shop's lead line reads: the checkout's options, as served. */
export interface ShopLeadInput {
    canOrder: boolean;
    currency: string;
    ways: readonly { type?: string; label: string; fee: string | null }[];
    freeDeliveryOver?: string | null;
}

/**
 * The one line under the shop's heading: how an order reaches the customer,
 * from what the location's checkout offers now. "Order online for pick-up
 * or local delivery. Free delivery from ₹999."
 *
 * Only what the read says: the ways, in the order the location offers them,
 * and "Free delivery from" by the same rule as the product page's line.
 * Null, and so no line at all, for a shop that isn't taking online orders,
 * a read that failed, or a location with no way set. It names no place and
 * no area: the read carries neither.
 */
export function shopLeadLine(
    input: ShopLeadInput | null | undefined,
    locale = "en-IN",
): string | null {
    if (!input?.canOrder || input.ways.length === 0) return null;
    const words: string[] = [];
    for (const way of input.ways) {
        const word =
            (way.type ? WAY_WORDS[way.type] : undefined) ??
            way.label.trim().toLowerCase();
        if (word && !words.includes(word)) words.push(word);
    }
    if (words.length === 0) return null;
    const last = words.at(-1) ?? "";
    const list =
        words.length === 1
            ? last
            : `${words.slice(0, -1).join(", ")} or ${last}`;
    const over = input.freeDeliveryOver;
    const free =
        over && Number(over) > 0 && input.ways.some((way) => way.fee)
            ? ` Free delivery from ${formatAmount(over, input.currency, locale)}.`
            : "";
    return `Order online for ${list}.${free}`;
}

/** "7 am", "8:30 pm": a time as the word list writes it (WV2Voice). */
export function shopClock(clock: string): string {
    return clockText(clock).replace(/(am|pm)$/, " $1");
}

/**
 * When a pick-up order can be collected, from the business hours alone
 * (DEC-172, U11): there are no pick-up slots and no real cut-off yet, so
 * Saroh says only what the hours say, and never "today" or "tomorrow".
 *
 * - Closed now: "Ready from 7 am Tue 20 Oct." — the next opening.
 * - Open now: "Come for it any time we're open, till 8 pm." — the business
 *   says when it is ready by email; nothing here claims it is ready now.
 * - No hours saved: null, and the checkout says the place and its hours
 *   line instead.
 */
export function pickupReadyWords(
    week: readonly OpeningHoursDay[] | null | undefined,
    now: Date,
    timeZone: string,
    closedDates: readonly string[] = [],
): string | null {
    const state = openState(week, now, timeZone, closedDates);
    if (!state) return null;
    if (state.open) {
        return `Come for it any time we're open, till ${shopClock(state.closesAt)}.`;
    }
    const next = nextOpening(week, now, timeZone, closedDates);
    if (!next) return null;
    return `Ready from ${shopClock(next.opensAt)} ${dateText(next.date, true)}.`;
}
