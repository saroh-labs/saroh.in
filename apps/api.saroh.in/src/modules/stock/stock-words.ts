import type { StockEntryKind } from "@saroh/database";

/**
 * The stock log's words and rules that need no database (#513). Kept apart
 * from the service so the screens' API (U5) and the order flows (U2) say the
 * same thing the same way.
 */

/** What each kind of entry is called in the log. */
export const STOCK_ENTRY_WORDS: Record<StockEntryKind, string> = {
    SOLD: "Sold",
    RETURNED: "Returned",
    BAKED: "Baked",
    RECEIVED: "Received",
    WASTED: "Wasted",
    COUNTED: "Counted",
    MOVED: "Moved",
    REVERSED: "Reversed",
};

/**
 * Entries a person makes by hand, and so the only ones the stock module
 * undoes. Sold and Returned come back only through their order; an undo is
 * never undone.
 */
export const HAND_MADE_KINDS: readonly StockEntryKind[] = [
    "RECEIVED",
    "BAKED",
    "WASTED",
    "COUNTED",
    "MOVED",
];

/** Entries that add or take a number of units, and which way they go. */
export const ADJUST_SIGN = {
    RECEIVED: 1,
    BAKED: 1,
    WASTED: -1,
} as const satisfies Partial<Record<StockEntryKind, 1 | -1>>;

export type AdjustKind = keyof typeof ADJUST_SIGN;

export function isAdjustKind(kind: string): kind is AdjustKind {
    return Object.prototype.hasOwnProperty.call(ADJUST_SIGN, kind);
}

export function isHandMade(kind: StockEntryKind): boolean {
    return HAND_MADE_KINDS.includes(kind);
}

/**
 * Why Saroh wrote a COUNTED entry rather than a person
 * (`StockEntry.system`): Track stock turned off, the switch to counting each
 * variant, a removed variant's stock taken back. Such an entry is never
 * undone — undoing the switch's count, say, would count the same units on
 * the product and on its variants.
 */
export const STOCK_SYSTEM_REASONS = [
    "TRACKING_OFF",
    "PER_VARIANT",
    "VARIANT_REMOVED",
] as const;
export type StockSystemReason = (typeof STOCK_SYSTEM_REASONS)[number];

/** Whether the stock log may undo an entry: hand-made, and not Saroh's. */
export function canUndoEntry(e: {
    kind: StockEntryKind;
    system: string | null;
}): boolean {
    return isHandMade(e.kind) && e.system === null;
}

export const SYSTEM_CANT_UNDO =
    "Saroh made this change when stock tracking or variants changed, so it can't be undone. Count the shelf instead.";

/** The signed change an adjustment of `units` makes. */
export function adjustDelta(kind: AdjustKind, units: number): number {
    return ADJUST_SIGN[kind] * units;
}

/** How many units promised to orders are not on the shelf (0 when none). */
export function shortBy(row: { onHand: number; promised: number }): number {
    return Math.max(0, row.promised - Math.max(0, row.onHand));
}

/** "2 short", or null when the shelf covers what is promised. */
export function shortWords(row: {
    onHand: number;
    promised: number;
}): string | null {
    const n = shortBy(row);
    return n > 0 ? `${n} short` : null;
}

/** What can leave a shelf in a move: what is on it and not promised. */
export function movable(row: { onHand: number; promised: number }): number {
    return Math.max(0, row.onHand - Math.max(0, row.promised));
}

export const COUNT_DIDNT_MATCH = "Count didn't match";

/**
 * A count the counter made against a number the shelf no longer had: they
 * were shown `expected`, and the locked row read `before`.
 */
export function countMismatched(
    expected: number | null | undefined,
    before: number,
): boolean {
    return expected != null && expected !== before;
}

export function moveRefusal(available: number, storefront: string): string {
    return available > 0
        ? `Only ${available} can be moved from ${storefront}. The rest are promised to orders there.`
        : `None can be moved from ${storefront}. They are all promised to orders there.`;
}

export function belowZeroRefusal(storefront: string): string {
    return `That would leave less than none on hand at ${storefront}.`;
}

/** A storefront has none of it left to sell. */
export const SOLD_OUT = "Sold out";

/** "Only 2 left at Hill Road" — fewer than asked for, but some. */
export function onlyLeft(available: number, storefront: string): string {
    return `Only ${available} left at ${storefront}`;
}

/**
 * Why an order can't take a line (#511): "Sourdough — Sold out", or
 * "Sourdough — Only 2 left at Hill Road". A storefront sells what is on hand
 * and not promised.
 */
export function sellRefusal(
    product: string,
    available: number,
    storefront: string,
): string {
    return `${product} — ${
        available > 0 ? onlyLeft(available, storefront) : SOLD_OUT
    }`;
}

/** The customer's words when two payments raced for the last unit (DEC-032). */
export const SOLD_OUT_WHILE_PAYING =
    "Sorry, it sold out while you were paying — your money is on its way back.";

/** The customer's words when their payment reached an order already closed. */
export const ORDER_CLOSED_WHILE_PAYING =
    "Sorry, this order was closed before your payment reached us — your money is on its way back.";

/** Why a kitchen undo can't take a fulfilment back. */
export const RETURNED_CANT_UNDO =
    "Money or items have come back on this order, so it can't be taken back to before it was handed over.";

/** Why a refund can't put that many back on the shelf. */
export function putBackRefusal(returnable: number): string {
    return returnable > 0
        ? `Only ${returnable} of that line can go back in stock.`
        : "None of that line can go back in stock — it wasn't handed over, or it's back already.";
}

/**
 * Why lines of one order that came off the same shelf can't all go back:
 * together they ask for more than the order can bring back there.
 */
export function putBackTogetherRefusal(returnable: number): string {
    return returnable > 0
        ? `Only ${returnable} of these lines can go back in stock together — they came off the same shelf.`
        : "None of these lines can go back in stock — they're back already.";
}

/** Why a return recorded by hand can't bring back that many of an order. */
export function orderReturnRefusal(returnable: number): string {
    return returnable > 0
        ? `Only ${returnable} of that order can come back to this shelf.`
        : "Nothing from that order can come back to this shelf — none was sold from it, or it's back already.";
}

/**
 * Why a variant with sales or a stock log can't be removed (DEC-032: the log
 * is never edited). Archiving the product ("Not sold") keeps it all.
 */
export function variantHasHistory(title: string): string {
    return `${title} has been sold or its stock counted, so it can't be removed — that would erase its stock history. Set the product to Not sold (archive it) instead.`;
}

export const CLOSED_STOREFRONT =
    "This storefront is closed, so its stock can't change.";

export const ALREADY_UNDONE = "This change has already been undone.";

/** Track stock can't go off while open orders hold units (#515). */
export function promisedRefusal(promised: number): string {
    return `${promised} ${promised === 1 ? "is" : "are"} promised to open orders — fulfil or cancel them first.`;
}

/** A product that doesn't track stock is counted only once it does (#515). */
export const UNTRACKED =
    "This product doesn't track stock. Turn on Track stock to count it.";

/** A variant's shelf asked of a product counted as a whole (#513). */
export const COUNTS_AS_A_WHOLE =
    "This product counts its stock as a whole, not per variant. Count the product itself, or switch it to count each variant in the product's Stock section.";

/** The product's own shelf asked of a product counted per variant. */
export const COUNTS_PER_VARIANT =
    "This product counts stock for each variant. Pick the variant to count.";

export const BUSINESS_UNTRACKED =
    "Your business doesn't track stock. Turn on Track stock to count it.";

/** Track stock changes how products sell, so it is Owner/Admin's to change. */
export const CANT_CHANGE_TRACKING =
    "Only someone who can change products can turn Track stock on or off.";

/** The note on the count that empties a shelf when Track stock goes off. */
export const TRACKING_OFF_NOTE = "Track stock turned off";

/** Why an entry can't be undone through the stock module. */
export function cantReverse(kind: StockEntryKind): string {
    switch (kind) {
        case "SOLD":
            return "A sale comes back through its order, not the stock log.";
        case "RETURNED":
            return "A return comes back through its order, not the stock log.";
        case "REVERSED":
            return "An undo can't be undone.";
        default:
            return "This change can't be undone.";
    }
}
