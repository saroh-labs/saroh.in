/**
 * The product page's arithmetic, pure: what can be sold, what the shop says
 * about stock, and how the ratings spread. The service gathers rows; these
 * turn them into the numbers the page shows, so a screen never re-derives
 * them and a unit test can pin every edge.
 */

import type { ShelfNeed } from "../stock/stock-words";

export type StockWord = "IN_STOCK" | "LOW" | "SOLD_OUT";

export interface StockRow {
    quantity: number;
    reserved: number;
    lowStockAlert: number;
}

export interface StockLine {
    onHand: number;
    promised: number;
    /** On hand minus promised, never below zero — the number the shop uses. */
    canSell: number;
    warnAt: number;
    word: StockWord;
}

/**
 * The word customers see. Sold out at nothing to sell; low once what can be
 * sold is at or under the warning level (a warning level of 0 never warns);
 * in stock otherwise.
 */
export function stockLine(row: StockRow): StockLine {
    const canSell = Math.max(0, row.quantity - row.reserved);
    let word: StockWord = "IN_STOCK";
    if (canSell <= 0) word = "SOLD_OUT";
    else if (row.lowStockAlert > 0 && canSell <= row.lowStockAlert)
        word = "LOW";
    return {
        onHand: row.quantity,
        promised: row.reserved,
        canSell,
        warnAt: row.lowStockAlert,
        word,
    };
}

export interface StockTotals {
    onHand: number;
    promised: number;
    canSell: number;
    /** Variants (or the product itself) at LOW or SOLD_OUT. */
    lowCount: number;
}

/**
 * The whole product: the sum of its variants, plus whatever the product's own
 * row still holds. In variant mode that row carries only what open order
 * lines without a variant promise (on hand = promised), so it adds nothing
 * to what can be sold.
 */
export function stockTotals(
    lines: StockLine[],
    productRow: StockRow | null,
): StockTotals {
    const onHand =
        lines.reduce((sum, l) => sum + l.onHand, 0) +
        (productRow?.quantity ?? 0);
    const promised =
        lines.reduce((sum, l) => sum + l.promised, 0) +
        (productRow?.reserved ?? 0);
    return {
        onHand,
        promised,
        canSell:
            lines.reduce((sum, l) => sum + l.canSell, 0) +
            (productRow
                ? Math.max(0, productRow.quantity - productRow.reserved)
                : 0),
        lowCount: lines.filter((l) => l.word !== "IN_STOCK").length,
    };
}

/**
 * The Stock tab's badge (#523): how many of the product's lines — each
 * variant, or the product counted as a whole — need someone, across every
 * open storefront. `short` is lines short for orders somewhere; `low` is
 * lines that need someone at all (short, sold out, or at the warning
 * level), judged per shelf where it is sold, as Stock's "Needs you" does.
 * It rides on the page's one read so the badge says the same on every
 * tab, not only on those that load the levels.
 */
export interface StockNeeds {
    short: number;
    low: number;
}

export function stockNeeds(
    lines: readonly { cells: readonly { need: ShelfNeed | null }[] }[],
): StockNeeds {
    return {
        short: lines.filter((l) => l.cells.some((c) => c.need === "short"))
            .length,
        low: lines.filter((l) => l.cells.some((c) => c.need !== null)).length,
    };
}

export interface RatingSummary {
    average: number | null;
    count: number;
    /** Index 0 is 1★ … index 4 is 5★. */
    distribution: [number, number, number, number, number];
}

/** Published reviews only — what customers see is what the page summarises. */
export function ratingSummary(ratings: number[]): RatingSummary {
    const distribution: [number, number, number, number, number] = [
        0, 0, 0, 0, 0,
    ];
    for (const r of ratings) {
        if (r >= 1 && r <= 5) distribution[r - 1] += 1;
    }
    const count = distribution.reduce((a, b) => a + b, 0);
    const total = distribution.reduce((sum, n, i) => sum + n * (i + 1), 0);
    return {
        average: count === 0 ? null : Math.round((total / count) * 10) / 10,
        count,
        distribution,
    };
}
