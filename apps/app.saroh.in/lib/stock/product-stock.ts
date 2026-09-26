/**
 * One product's stock, split by storefront, as its page's Stock tab and
 * Overview draw it (#523) — built from the Stock API's levels read, filtered
 * to the product. Pure and client-safe: the API does the arithmetic (on
 * hand, promised, can sell, short); this only arranges and says it.
 */

import type { StockCell, StockEntryKind } from "./levels";

/** How a shelf's pill is drawn. */
export type ShelfTone = "ok" | "low" | "bad" | "muted";

export interface ShelfWord {
    text: string;
    tone: ShelfTone;
}

/** One storefront's shelf of one size. */
export interface ShelfLine {
    storeId: string;
    name: string;
    soldHere: boolean;
    onHand: number;
    promised: number;
    canSell: number;
    short: number;
    warnAt: number;
    stockLevelId: string | null;
    word: ShelfWord;
}

/** A size (or the product counted as a whole) and its shelves. */
export interface SizeStock {
    variantId: string | null;
    onHand: number;
    promised: number;
    canSell: number;
    short: number;
    warnAt: number;
    /** Every storefront it is sold at, or still has stock at. */
    shelves: ShelfLine[];
    /** The one pill when there is one shelf. */
    word: ShelfWord;
}

export interface ProductStock {
    /** "variant" when each size has its own count, else "product". */
    mode: "variant" | "product";
    sizes: SizeStock[];
    totals: {
        onHand: number;
        promised: number;
        canSell: number;
        short: number;
    };
    /** More than one storefront shows: a sub-row per storefront. */
    split: boolean;
    /** What each storefront that sells it can sell, in the levels' order. */
    byStore: { storeId: string; name: string; canSell: number }[];
}

/** The levels read's rows and storefronts — the part this needs. */
export interface LevelsForProduct {
    storefronts: { id: string; name: string }[];
    rows: {
        productId: string;
        variantId: string | null;
        cells: StockCell[];
    }[];
}

/**
 * What a shelf tells the shop, the design's way: short comes first (open
 * orders hold more than is there), then sold out, then "Only N left" at or
 * under its warning level, else in stock. A storefront that doesn't sell it
 * says so.
 */
export function shelfWord(
    cell: Pick<StockCell, "soldHere" | "word" | "canSell" | "short">,
): ShelfWord {
    if (cell.short > 0) return { text: `${cell.short} short`, tone: "bad" };
    if (!cell.soldHere || cell.word === "NOT_SOLD_HERE") {
        return { text: "Not sold here", tone: "muted" };
    }
    if (cell.word === "SOLD_OUT" || cell.canSell <= 0) {
        return { text: "Sold out", tone: "bad" };
    }
    if (cell.word === "LOW") {
        return { text: `Only ${cell.canSell} left`, tone: "low" };
    }
    return { text: "In stock", tone: "ok" };
}

const shows = (c: StockCell) => c.soldHere || c.onHand > 0 || c.promised > 0;

/**
 * The product's stock from the levels read. Null when the read has no row
 * for it — it doesn't count stock (Track stock off).
 */
export function productStock(
    levels: LevelsForProduct,
    productId: string,
): ProductStock | null {
    const rows = levels.rows.filter((r) => r.productId === productId);
    if (rows.length === 0) return null;
    const names = new Map(levels.storefronts.map((s) => [s.id, s.name]));
    const sizes: SizeStock[] = rows.map((row) => {
        const shelves: ShelfLine[] = row.cells.filter(shows).map((c) => ({
            storeId: c.storeId,
            name: names.get(c.storeId) ?? "A storefront",
            soldHere: c.soldHere,
            onHand: c.onHand,
            promised: c.promised,
            canSell: c.soldHere ? c.canSell : 0,
            short: c.short,
            warnAt: c.warnAt,
            stockLevelId: c.stockLevelId,
            word: shelfWord(c),
        }));
        const sum = (k: "onHand" | "promised" | "canSell" | "short") =>
            shelves.reduce((n, s) => n + s[k], 0);
        const selling: ShelfLine | undefined =
            shelves.find((s) => s.soldHere) ?? shelves.at(0);
        return {
            variantId: row.variantId,
            onHand: sum("onHand"),
            promised: sum("promised"),
            canSell: sum("canSell"),
            short: sum("short"),
            warnAt: selling?.warnAt ?? 0,
            shelves,
            word: selling
                ? selling.word
                : { text: "Not sold anywhere", tone: "muted" },
        };
    });
    const stores = new Set(
        sizes.flatMap((s) => s.shelves.map((x) => x.storeId)),
    );
    const total = (k: "onHand" | "promised" | "canSell" | "short") =>
        sizes.reduce((n, s) => n + s[k], 0);
    const byStore = levels.storefronts
        .filter((s) =>
            sizes.some((z) =>
                z.shelves.some((x) => x.storeId === s.id && x.soldHere),
            ),
        )
        .map((s) => ({
            storeId: s.id,
            name: s.name,
            canSell: sizes.reduce(
                (n, z) =>
                    n +
                    (z.shelves.find((x) => x.storeId === s.id)?.canSell ?? 0),
                0,
            ),
        }));
    return {
        mode: sizes.some((s) => s.variantId !== null) ? "variant" : "product",
        sizes,
        totals: {
            onHand: total("onHand"),
            promised: total("promised"),
            canSell: total("canSell"),
            short: total("short"),
        },
        split: stores.size > 1,
        byStore,
    };
}

/** "Hill Road only" when a size sells at one of several storefronts. */
export function shelfName(
    size: SizeStock,
    shelf: ShelfLine,
    split: boolean,
): string {
    return split && size.shelves.length === 1 && shelf.soldHere
        ? `${shelf.name} only`
        : shelf.name;
}

/** "Warns at 6", "Warns at 6 per shop" — or null when it never warns. */
export function warnsAt(size: SizeStock, split: boolean): string | null {
    if (size.warnAt <= 0) return null;
    return `Warns at ${size.warnAt}${split ? " per shop" : ""}`;
}

/** The table's footnote. */
export function stockFootnote(split: boolean): string {
    return split
        ? "Each storefront counts its own stock. Promised is what open orders there have already taken."
        : "Promised is what open orders have already taken.";
}

// ---- Recent changes ----

export interface LogLike {
    kind: StockEntryKind;
    quantity: number;
    createdAt: string;
}

const DAY = 86_400_000;

/**
 * "This week: 4 sold, 38 baked, 3 wasted, −1 unexplained at counts." — the
 * last seven days of the product's log. Baked and received are one figure,
 * named for what the business records.
 */
export function weekLine(entries: readonly LogLike[], now: Date): string {
    const since = now.getTime() - 7 * DAY;
    const week = entries.filter((e) => Date.parse(e.createdAt) >= since);
    const sum = (...kinds: StockEntryKind[]) =>
        week
            .filter((e) => kinds.includes(e.kind))
            .reduce((n, e) => n + Math.abs(e.quantity), 0);
    const baked = week.some((e) => e.kind === "BAKED");
    const received = week.some((e) => e.kind === "RECEIVED");
    const inWord = baked && !received ? "baked" : "received";
    const counted = week
        .filter((e) => e.kind === "COUNTED")
        .reduce((n, e) => n + e.quantity, 0);
    const parts = [
        `${sum("SOLD")} sold`,
        `${sum("BAKED", "RECEIVED")} ${inWord}`,
        `${sum("WASTED")} wasted`,
    ];
    if (counted !== 0) {
        parts.push(
            `${counted > 0 ? "+" : "−"}${Math.abs(counted)} unexplained at counts`,
        );
    }
    return `This week: ${parts.join(", ")}.`;
}

/** "−2", "+5", "0" — and which colour role it takes. */
export function changeTone(quantity: number): "ok" | "bad" | "muted" {
    return quantity > 0 ? "ok" : quantity < 0 ? "bad" : "muted";
}
