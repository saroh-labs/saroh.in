import { checkDeliveryPlace, splitDeliveryPlace } from "@saroh/block-contract";

import type { DeliveryAddress, FulfilmentType, OrderRead } from "./read";

/** A delivery as the order's edit sheets hold it, every field as text. */
export interface DeliveryDraft {
    line1: string;
    city: string;
    /** India's state, or a Global delivery's region alone. */
    state: string;
    postalCode: string;
    /** A Global delivery's ISO country; "" for India's, which sends none. */
    country: string;
}

/**
 * The draft an edit sheet opens with. `home` is a Global business's country
 * (null for India): its delivery keeps region and country apart (DEC-207),
 * an older "Texas, United States" line read apart, and starts on `home`.
 */
export function deliveryDraftOf(
    a: DeliveryAddress | null,
    home: string | null,
): DeliveryDraft {
    const place =
        home && !a?.country
            ? splitDeliveryPlace(a?.state)
            : { region: a?.state ?? "", country: a?.country ?? null };
    return {
        line1: a?.line1 ?? "",
        city: a?.city ?? "",
        state: place.region,
        postalCode: a?.postalCode ?? "",
        country: home ? (place.country ?? home) : "",
    };
}

/**
 * What stops a delivery saving, in a sentence; null when nothing does.
 * India: every field. Global: the first line and town, then the region and
 * postcode by the address's own country (`checkDeliveryPlace`).
 */
export function deliveryDraftProblem(
    d: DeliveryDraft,
    india: boolean,
    noun: "A delivery" | "An address",
): string | null {
    if (india) {
        return [d.line1, d.city, d.state, d.postalCode].some((v) => !v.trim())
            ? `${noun} needs its first line, town, state and PIN code.`
            : null;
    }
    if (!d.line1.trim() || !d.city.trim()) {
        return `${noun} needs its first line and town.`;
    }
    const place = checkDeliveryPlace(d.country, d.state, d.postalCode);
    return "problem" in place ? place.problem : null;
}

/**
 * Whether "Change how it's fulfilled…" and "Cancel order…" can open, for
 * this viewer: null when it can, else why not (the button's title). The
 * API's refusals come first; then the viewer's powers (B16): a change of
 * way is `order:edit`'s, and a cancel — a refund in full — is
 * `order:refund`'s, paid or not. Undefined when the API is from before B9:
 * the buttons aren't drawn.
 */
export function changeAccess(
    order: Pick<OrderRead, "next" | "paymentStatus">,
    can: { edit: boolean; refund: boolean },
): { fulfilment?: string | null; cancel?: string | null } {
    const { fulfilment, cancel } = order.next;
    return {
        ...(fulfilment
            ? {
                  fulfilment: !can.edit
                      ? "Your role can't change orders"
                      : fulfilment.refusal,
              }
            : {}),
        ...(cancel
            ? {
                  cancel: !can.refund
                      ? "Your role can't refund or cancel orders"
                      : cancel.pending
                        ? "Cancelling. Waiting for the refund to be confirmed"
                        : cancel.refusal,
              }
            : {}),
    };
}

/**
 * "Change how it's fulfilled…" (round-2 B9), the sheet's own rules, pure.
 * The API decides which ways are offered and works the money out again
 * under the order's lock; these say only what the sheet shows before it
 * asks.
 */

/** Local delivery and Shipping go to an address and carry a delivery charge. */
export function isDeliveryType(type: FulfilmentType): boolean {
    return type === "LOCAL_DELIVERY" || type === "SHIPPING";
}

/**
 * The delivery charge the sheet starts from (decided 2026-09-27): the
 * order's own when it moves between delivery types, nothing when it moves
 * to Pick-up or Digital, and nothing typed yet when it becomes a delivery
 * (there is no fee per storefront to start from).
 */
export function prefillCharge(
    from: FulfilmentType,
    to: FulfilmentType,
    shipping: number,
): string {
    if (!isDeliveryType(to)) return "0";
    if (isDeliveryType(from)) return moneyText(Math.round(shipping * 100));
    return "";
}

/** Cents as the field shows them: "40", "40.50". */
export function moneyText(cents: number): string {
    const whole = Math.floor(cents / 100);
    const part = cents % 100;
    return part === 0
        ? String(whole)
        : `${whole}.${String(part).padStart(2, "0")}`;
}

export type ChargeInput =
    | { kind: "ok"; cents: number; money: string }
    | { kind: "empty" }
    | { kind: "bad"; error: string };

/** The delivery charge as typed: money (≥ 0, two decimals), or why not. */
export function parseCharge(raw: string): ChargeInput {
    const typed = raw.trim();
    if (!typed) return { kind: "empty" };
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(typed)) {
        return { kind: "bad", error: "Type a charge like 40 or 40.50." };
    }
    const cents = Math.round(Number(typed) * 100);
    return {
        kind: "ok",
        cents,
        money: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
    };
}

/** How the order stands for money, as the sheet words the difference. */
export type PaidHow = "unpaid" | "online" | "by-hand";

/**
 * What saving does to the money, before the button: more to pay, money
 * back, or nothing. `refundTo` is where money handed back goes.
 */
export function differenceNote(input: {
    differenceCents: number;
    paid: PaidHow;
    first: string;
    refundTo: string;
    /** A payment link can be made for what is owed. */
    linkable: boolean;
    format: (cents: number) => string;
}): string {
    const { differenceCents: d, paid, first } = input;
    const amount = input.format(Math.abs(d));
    if (d === 0) return "Same charge. Nothing to take or give back.";
    if (paid === "unpaid") {
        return d > 0
            ? `${amount} more to pay. The order's total goes up by it.`
            : `${amount} less to pay. The order's total goes down by it.`;
    }
    if (paid === "by-hand") {
        return d > 0
            ? `${amount} more to pay. Take it at the counter.`
            : `${amount} back to them. Give it back from the till.`;
    }
    return d > 0
        ? input.linkable
            ? `${amount} more to pay. Saving makes a payment link for it to send ${first}.`
            : `${amount} more to pay. It shows as due on the order.`
        : `${amount} back to them. It goes back to ${input.refundTo} when you save.`;
}

/** The sheet's button, worded by what saving does. */
export function saveLabel(input: {
    differenceCents: number;
    paid: PaidHow;
    linkable: boolean;
    format: (cents: number) => string;
}): string {
    const d = input.differenceCents;
    if (input.paid === "online" && d < 0) {
        return `Save and refund ${input.format(-d)}`;
    }
    if (input.paid === "online" && d > 0 && input.linkable) {
        return "Save and make payment link";
    }
    return "Save";
}
