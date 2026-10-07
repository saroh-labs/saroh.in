/**
 * New order v2's rules (plan B, B13), pure so the sheet and its tests share
 * them: the cash change, what each payment says before the button, the
 * button's words, what stops it, and a line's allergy clash. The ways an
 * order may leave are the API's (`GET stores/:id/orders/new-order`); nothing
 * here works them out.
 */

import type { CustomerPick } from "@/lib/customers/picker";

/** How it is paid, as the API takes it. */
export type NewOrderPay = "CASH" | "UPI" | "CARD" | "LINK" | "LATER";

/** A way it can leave, as the API offers it. */
export interface NewOrderWay {
    type: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING" | "DIGITAL";
    label: string;
    /** "60.00", or null when it adds nothing. */
    fee: string | null;
}

export interface AllergenRef {
    id: string;
    name: string;
}

export interface LineAllergens {
    contains: AllergenRef[];
    mayContain: AllergenRef[];
}

/** One sellable thing: a product, or one of its variants. */
export interface NewOrderSellable {
    key: string;
    productId: string;
    variantId: string | null;
    /** The product's name. */
    name: string;
    /** The variant's title; null for a product without variants. */
    variantTitle: string | null;
    /** Minor units. */
    priceCents: number;
    /**
     * How many are left at this storefront; null when the shelf isn't
     * counted (the API still refuses what it can't promise).
     */
    left: number | null;
    soldOut: boolean;
}

export interface CartLine {
    key: string;
    quantity: number;
}

/** Whether a way goes to an address (DEC-045). */
export function goesToAddress(type: NewOrderWay["type"] | null): boolean {
    return type === "LOCAL_DELIVERY" || type === "SHIPPING";
}

/** Cents from what was typed: "500", "₹ 1,200.50". NaN for nothing useful. */
export function centsOf(typed: string): number {
    const clean = typed.replace(/[^0-9.]/g, "");
    if (!clean || !/^\d*\.?\d{0,2}$/.test(clean)) return Number.NaN;
    return Math.round(Number(clean) * 100);
}

/** The cash line under "Cash given": change to give, or how short it is. */
export type CashChange =
    | { kind: "none" }
    | { kind: "change"; cents: number }
    | { kind: "short"; cents: number };

export function cashChange(given: string, totalCents: number): CashChange {
    if (!given.trim()) return { kind: "none" };
    const cents = centsOf(given);
    if (!Number.isFinite(cents)) return { kind: "none" };
    return cents >= totalCents
        ? { kind: "change", cents: cents - totalCents }
        : { kind: "short", cents: totalCents - cents };
}

/** Who can be reached: the picked person's phone or email. */
export function reachOf(pick: CustomerPick | null): string | null {
    if (!pick) return null;
    const [first = null] = [pick.phone, "email" in pick ? pick.email : null]
        .map((v) => v?.trim() ?? "")
        .filter((v) => v.length > 0);
    return first;
}

/** The payment chips, each with why it is off when it is. */
export function payOptions(input: {
    pick: CustomerPick | null;
    way: NewOrderWay["type"] | null;
    /** A pay link can be made here: `order:create` (B16) and a provider. */
    canLink: boolean;
    /**
     * The plan takes payment online (`takesOnlinePayment`). When it
     * doesn't, the link isn't offered at all — not even greyed out — and
     * the counter ways are the choices (R33). Absent: yes.
     */
    online?: boolean;
}): { key: NewOrderPay; label: string; off: string | null }[] {
    const reach = reachOf(input.pick);
    return [
        { key: "CASH", label: "Cash", off: null },
        { key: "UPI", label: "UPI at the counter", off: null },
        { key: "CARD", label: "Card machine", off: null },
        ...(input.online === false
            ? []
            : [
                  {
                      key: "LINK" as const,
                      label: "Send a payment link",
                      off: !input.canLink
                          ? "Connect a payment provider to send a link"
                          : !reach
                            ? "Needs a customer with a phone or email"
                            : null,
                  },
              ]),
        {
            key: "LATER",
            label: "Pay on collection",
            off: goesToAddress(input.way)
                ? "Deliveries are paid before they go"
                : null,
        },
    ];
}

/**
 * Whether "Handed over now" applies (UX-059): paid at the counter, now,
 * and picked up there — the sale the customer walks out with. The API
 * makes such an order Collected at once, and refuses the flag otherwise.
 */
export function canHandOver(
    pay: NewOrderPay,
    way: NewOrderWay["type"] | null,
): boolean {
    return (
        way === "PICKUP" && (pay === "CASH" || pay === "UPI" || pay === "CARD")
    );
}

/** What the payment will do, said before the button (the design's note). */
export function payNote(
    pay: NewOrderPay,
    total: string,
    reach: string | null,
): string {
    switch (pay) {
        case "CASH":
            return "Paid now. It goes in the till, not a payout.";
        case "UPI":
            return `Show the counter QR. Create once ${total} shows on your UPI app.`;
        case "CARD":
            return `Key ${total} into the machine; create once it approves.`;
        case "LINK":
            return `You get the link to send to ${reach ?? "the customer"}. The order waits unpaid, and nobody starts it until it's paid.`;
        case "LATER":
            return "Nothing taken now. It shows as unpaid until they pay at the counter.";
    }
}

/** The button's words (the design's). */
export function createLabel(
    pay: NewOrderPay,
    total: string,
    hasItems: boolean,
): string {
    if (!hasItems) return "Create order";
    switch (pay) {
        case "CASH":
            return `Take ${total} cash · create`;
        case "UPI":
            return "UPI received · create";
        case "CARD":
            return "Card approved · create";
        case "LINK":
            return "Create and get the link";
        case "LATER":
            return "Create · pay on collection";
    }
}

/** The address fields a delivery needs (the API's `address`). */
export interface AddressDraft {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
}

export const EMPTY_ADDRESS: AddressDraft = {
    line1: "",
    city: "",
    state: "",
    postalCode: "",
};

/**
 * What stops the button, first thing first; null when it can be made. The
 * same order as the design: items, who, the address, then the money.
 */
export function sheetProblem(input: {
    lines: number;
    pick: CustomerPick | null;
    way: NewOrderWay["type"] | null;
    address: AddressDraft;
    pay: NewOrderPay;
    payOff: string | null;
    cash: CashChange;
    format: (cents: number) => string;
}): string | null {
    if (input.lines === 0) return "Add at least one item.";
    if (!input.pick) return "Pick a customer, or take a walk-in's name.";
    if (!input.way) return "Pick how it leaves.";
    if (goesToAddress(input.way)) {
        const a = input.address;
        if (!a.line1.trim()) return "Add the delivery address.";
        if (!a.city.trim() || !a.state.trim() || !a.postalCode.trim()) {
            return "Add the town, state and PIN code.";
        }
        if (!reachOf(input.pick)) {
            return "Deliveries need a customer to send the tracking to.";
        }
    }
    if (input.payOff) return input.payOff;
    if (input.pay === "CASH" && input.cash.kind === "short") {
        return `That's ${input.format(input.cash.cents)} short.`;
    }
    return null;
}

/**
 * A line's allergy clash: what it contains, over what it may contain, that
 * the customer's Allergy entries name — by allergen id, never by spelling,
 * as Order Detail's `allergyCheck` does. Empty when none.
 */
export function clashText(
    line: LineAllergens | undefined,
    theirs: ReadonlySet<string>,
): string {
    if (!line || theirs.size === 0) return "";
    const words = (list: AllergenRef[]) =>
        list.map((a) => a.name.toLowerCase()).join(", ");
    const has = line.contains.filter((a) => theirs.has(a.id));
    if (has.length) return `Contains ${words(has)}`;
    const may = line.mayContain.filter((a) => theirs.has(a.id));
    return may.length ? `May contain ${words(may)}` : "";
}

/** "1 item", "3 items", or "Nothing yet". */
export function itemCount(lines: readonly CartLine[]): string {
    const n = lines.reduce((sum, l) => sum + l.quantity, 0);
    if (n === 0) return "Nothing yet";
    return `${n} ${n === 1 ? "item" : "items"}`;
}

/** Add one of a thing, or take one away; a line at 0 goes. */
export function bump(
    lines: readonly CartLine[],
    key: string,
    by: 1 | -1,
): CartLine[] {
    const at = lines.findIndex((l) => l.key === key);
    if (at < 0) return by > 0 ? [...lines, { key, quantity: 1 }] : [...lines];
    const next = lines.map((l, i) =>
        i === at ? { ...l, quantity: l.quantity + by } : l,
    );
    return next.filter((l) => l.quantity > 0);
}

/** How many more of a thing can be added here; null when not counted. */
export function roomFor(
    sellable: Pick<NewOrderSellable, "left" | "soldOut">,
    inCart: number,
): number | null {
    if (sellable.soldOut) return 0;
    return sellable.left === null ? null : Math.max(0, sellable.left - inCart);
}

/**
 * A picker chip's words (UX-026): the size and price, and — said, not only
 * greyed — "Sold out" when none can be added here, or "2 left" when few.
 */
export function chipWords(
    variantTitle: string | null,
    price: string,
    room: number | null,
): string {
    const what = variantTitle ?? "Add";
    if (room === 0) return `${what} · Sold out`;
    if (room !== null && room <= 3) return `${what} · ${price} · ${room} left`;
    return `${what} · ${price}`;
}

/** The products the search shows: 5 before typing, 8 once typed. */
export function findSellables<T extends { name: string }>(
    products: readonly T[],
    query: string,
): T[] {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 5);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
}

/**
 * The line under the picked customer's name: how to reach them. A walk-in
 * with only a name says so; one with a phone is kept as a customer by it
 * (B13b), and says that.
 */
export function pickMeta(pick: CustomerPick): string {
    if (pick.kind === "walk-in") {
        const phone = pick.phone.trim();
        return phone ? `${phone} · kept as a customer` : "Walk-in";
    }
    return (
        [pick.phone, pick.email].filter(Boolean).join(" · ") ||
        "No contact details"
    );
}

/**
 * What the API is sent for who the order is for. A walk-in's phone is sent
 * when given, and the API keeps them as a customer by it (B13b).
 */
export function partyOf(
    pick: CustomerPick,
):
    | { contactId: string }
    | { customer: { email: string; name?: string; phone?: string } }
    | { walkIn: { name: string; phone?: string } } {
    if (pick.kind === "contact") return { contactId: pick.id };
    if (pick.kind === "new") {
        return {
            customer: {
                email: pick.email.trim(),
                ...(pick.name.trim() ? { name: pick.name.trim() } : {}),
                ...(pick.phone.trim() ? { phone: pick.phone.trim() } : {}),
            },
        };
    }
    return {
        walkIn: {
            name: pick.name.trim(),
            ...(pick.phone.trim() ? { phone: pick.phone.trim() } : {}),
        },
    };
}
