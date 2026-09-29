import { stockLine } from "./product-overview";

/**
 * The public catalogue's allow-list (round-2 G11): what a merchant's site
 * may show about a product sold at its storefront, and nothing else.
 *
 * Every field is named here and copied by hand — never a spread of a row —
 * so a column added to Product later can't reach the public by accident.
 * No cost, no supplier code, no stock numbers: a line says Sold out, "Only
 * N left" (at or under its warning level, the one time a number is shown),
 * in stock, or nothing for a product that counts no stock (DEC-032).
 *
 * The shapes match `ProductPageData` in `@saroh/site-blocks`, so the site
 * renders the product with the same component the workspace's Customer view
 * previews it with.
 */

export type PublicStockWord = "IN_STOCK" | "LOW" | "SOLD_OUT" | "UNTRACKED";

export interface PublicStock {
    word: PublicStockWord;
    /** Only for LOW: "Only 2 left". Null otherwise. */
    left: number | null;
}

export interface PublicImage {
    id: string;
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
    kind: "photo" | "video";
    durationSec: number | null;
    posterUrl: string | null;
}

export interface PublicVariant {
    id: string;
    title: string;
    price: string | null;
    mrp: string | null;
    imageId: string | null;
    stock: PublicStockWord;
    left: number | null;
}

/** One card on `/shop`. */
export interface PublicCatalogueCard {
    slug: string;
    name: string;
    currency: string;
    /** The lowest price offered here; `priceFrom` when variants differ. */
    price: string;
    mrp: string | null;
    priceFrom: boolean;
    /** The cover, or null. A video's poster stands in for a video cover. */
    image: { url: string; alt: string } | null;
    /** "Small · Large", when it is chosen by variant. */
    variantTitles: string[];
    /**
     * What the options are ("Size"), for the card's "2 sizes" (DEC-073
     * #12). Null for a product without options.
     */
    optionName: string | null;
    /** Two sentences at most of the description, as plain text. */
    blurb: string | null;
    /** Nothing offered here can be sold now. */
    soldOut: boolean;
    /** The listing at the site's storefront: what the bag holds (G13). */
    listingId: string;
    /**
     * The option the card's Add to bag adds: the first one offered here
     * that can be sold now. Null for a product without options (or when
     * every option is sold out).
     */
    bagVariantId: string | null;
}

export interface PublicCatalogue {
    storefront: { name: string };
    products: PublicCatalogueCard[];
}

/** One product's page: `ProductPageData`, plus its address and search text. */
export interface PublicProduct {
    slug: string;
    /** The listing at the site's storefront: what the bag holds (G13). */
    listingId: string;
    name: string;
    currency: string;
    price: string;
    mrp: string | null;
    categoryName: string | null;
    description: string | null;
    keyPoints: string[];
    howToUse: string | null;
    materials: string | null;
    materialsLabel: string;
    maker: string | null;
    warranty: string | null;
    returns: string | null;
    extras: { label: string; value: string }[];
    images: PublicImage[];
    optionName: string | null;
    variants: PublicVariant[];
    stock: PublicStock | null;
    rating: { average: number; count: number } | null;
    reviews: {
        id: string;
        rating: number;
        body: string | null;
        displayName: string;
        variantTitle: string | null;
        reply: string | null;
        dateLabel: string;
    }[];
    seoTitle: string | null;
    seoDescription: string | null;
}

/** A shelf row at the storefront, as the reader loads it. */
export interface ShelfRow {
    productId: string;
    variantId: string | null;
    onHand: number;
    promised: number;
    lowStockAlert: number;
}

/**
 * The word for one line at the storefront.
 *
 * - Untracked (its switch or the business's is off): Sold out only where
 *   the storefront marked it so by hand; otherwise it sells, and says
 *   nothing about stock.
 * - Tracked: its shelf here — the variant's own row, else the product's
 *   whole row. No shelf at all is nothing to sell. On hand minus promised
 *   at 0 is Sold out (on hand equal to promised included).
 */
export function publicStock(input: {
    tracked: boolean;
    markedSoldOut: boolean;
    row: ShelfRow | undefined;
}): PublicStock {
    if (!input.tracked) {
        return input.markedSoldOut
            ? { word: "SOLD_OUT", left: null }
            : { word: "UNTRACKED", left: null };
    }
    if (!input.row) return { word: "SOLD_OUT", left: null };
    const line = stockLine({
        quantity: input.row.onHand,
        reserved: input.row.promised,
        lowStockAlert: input.row.lowStockAlert,
    });
    return line.word === "LOW"
        ? { word: "LOW", left: line.canSell }
        : { word: line.word, left: null };
}

/** The row a line sells from: the variant's own, else the whole product's. */
export function shelfFor(
    rows: readonly ShelfRow[],
    productId: string,
    variantId: string | null,
): ShelfRow | undefined {
    const mine = rows.filter((r) => r.productId === productId);
    return (
        (variantId ? mine.find((r) => r.variantId === variantId) : undefined) ??
        mine.find((r) => r.variantId === null)
    );
}

/** Plain words from sanitised HTML, cut to two sentences and 160 characters. */
export function blurbOf(html: string | null): string | null {
    if (!html) return null;
    const text = html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Last, so "&amp;lt;" reads "&lt;" and is never unescaped twice.
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return null;
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    const two = sentences ? sentences.slice(0, 2).join("").trim() : text;
    return two.length > 160 ? `${two.slice(0, 157).trimEnd()}…` : two;
}

/** Money as the API sends it: two decimals, from a Decimal or a string. */
export function money(value: { toString(): string } | null): string | null {
    if (value === null) return null;
    const n = Number(value.toString());
    return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** The cheapest line offered, and whether prices differ between lines. */
export function priceOf(
    base: { price: string; mrp: string | null },
    lines: readonly { price: string | null; mrp: string | null }[],
): { price: string; mrp: string | null; priceFrom: boolean } {
    if (lines.length === 0) return { ...base, priceFrom: false };
    const priced = lines.map((l) => ({
        price: l.price ?? base.price,
        mrp: l.mrp ?? base.mrp,
    }));
    const cheapest = priced.reduce((a, b) =>
        Number(b.price) < Number(a.price) ? b : a,
    );
    const distinct = new Set(priced.map((p) => Number(p.price)));
    return { ...cheapest, priceFrom: distinct.size > 1 };
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/** A custom field's value as people read it: "Yes", "24 Sep 2026", "12". */
export function fieldText(type: string, value: string): string {
    if (type === "YES_NO") return value === "true" ? "Yes" : "No";
    if (type === "DATE") {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        return m
            ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`
            : value;
    }
    return value;
}

/** "Contains gluten. May contain nuts." — or null when none are ticked. */
export function allergenText(
    rows: readonly { kind: string; name: string }[],
): string | null {
    const list = (kind: string) =>
        rows
            .filter((r) => r.kind === kind)
            .map((r) => r.name.toLowerCase())
            .join(", ");
    const contains = list("CONTAINS");
    const may = list("MAY_CONTAIN");
    const text = [
        contains ? `Contains ${contains}.` : "",
        may ? `May contain ${may}.` : "",
    ]
        .filter(Boolean)
        .join(" ");
    return text || null;
}

/** Whether a detail is switched on for the shop (on unless switched off). */
export function onTheShop(shopFields: unknown, key: string): boolean {
    if (typeof shopFields !== "object" || shopFields === null) return true;
    return (shopFields as Record<string, unknown>)[key] !== false;
}

/**
 * The product page's "Made by" line (P5): the product's own maker or
 * supplier, and where it is made, each on its own switch. Null hides the
 * row. A product made here has neither (the editor clears both), so it
 * shows no row rather than the storefront's name ("Online"), which is
 * where it sells, never who makes it.
 */
export function madeByLine(p: {
    maker: string | null;
    madeIn: string | null;
    shopFields: unknown;
}): string | null {
    const parts = [
        onTheShop(p.shopFields, "maker") ? p.maker?.trim() : null,
        onTheShop(p.shopFields, "madeIn") ? p.madeIn?.trim() : null,
    ].filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(", ") : null;
}

/** A review's day, pinned to UTC so every reader prints the same text. */
export function reviewDay(at: Date): string {
    return at.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });
}
