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

/** Why a kitchen undo can't take a fulfilment back. */
export const RETURNED_CANT_UNDO =
    "Money or items have come back on this order, so it can't be taken back to before it was handed over.";

/** Why a refund can't put that many back on the shelf. */
export function putBackRefusal(returnable: number): string {
    return returnable > 0
        ? `Only ${returnable} of that line can go back in stock.`
        : "None of that line can go back in stock — it wasn't handed over, or it's back already.";
}

export const CLOSED_STOREFRONT =
    "This storefront is closed, so its stock can't change.";

export const ALREADY_UNDONE = "This change has already been undone.";

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
