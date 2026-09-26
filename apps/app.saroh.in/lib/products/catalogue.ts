import type {
    CatalogueListing,
    CatalogueProduct,
    ProductStatus,
} from "./service";

/** One storefront that sells a catalogue row, and its stock there. */
export type CataloguePlace = CatalogueListing;

/**
 * One row of the business's catalogue.
 *
 * The catalogue belongs to the business (#531, the "Saroh Products Screen"
 * design, after Square's single item library): the API returns one product
 * per row, with each storefront that sells it — its listings — and the
 * stock on each shelf. Read under the storefront filter (#519), the row's
 * stock is that storefront's; otherwise the shelves added up. Nothing is
 * matched or merged here.
 */
export interface CatalogueRow {
    /** The product's id: one row per catalogue product. */
    key: string;
    id: string;
    name: string;
    /** The cover photo; the tile falls back to initials without one. */
    image: string | null;
    sku: string | null;
    variantCount: number;
    /** Each variant it sells in this view, with its own price if any. */
    variants: CatalogueProduct["variants"];
    status: ProductStatus;
    price: string;
    /** Lowest and highest variant price when they differ, else null. */
    priceRange: { low: string; high: string } | null;
    currency: string;
    /** On hand; `null` when nothing here counts stock. */
    stock: number | null;
    /** Promised to open orders. */
    promised: number;
    /** On hand minus promised, never below 0 — what the shop sells. */
    canSell: number | null;
    /** The product's own warning level (the lowest of its shelves). */
    lowStockAlert: number | null;
    /**
     * Untracked and marked sold out by hand (#515) wherever it is counted:
     * the stock column says "Sold out", not "Not tracked".
     */
    soldOut: boolean;
    updatedAt: string;
    categoryId: string | null;
    /** Where it is sold; empty when no storefront sells it just now. */
    places: CataloguePlace[];
}

export function catalogueRows(
    products: readonly CatalogueProduct[],
): CatalogueRow[] {
    return products.map((p) => {
        const inv = p.inventory;
        return {
            key: p.id,
            id: p.id,
            name: p.name,
            image: p.image,
            sku: p.sku,
            variantCount: p.variantCount,
            variants: p.variants,
            status: p.status,
            price: p.price,
            priceRange: priceRange(p.price, p.variants),
            currency: p.currency,
            stock: inv ? inv.quantity : null,
            promised: inv ? inv.promised : 0,
            canSell: inv ? Math.max(0, inv.quantity - inv.promised) : null,
            lowStockAlert: inv ? inv.lowStockAlert : null,
            soldOut: !inv && p.soldOut === true,
            updatedAt: p.updatedAt,
            categoryId: p.categoryId,
            places: p.listings,
        };
    });
}

/**
 * A price range is the variants', never a storefront's (the design): a
 * variant without its own price sells at the product's.
 */
export function priceRange(
    price: string,
    variants: readonly { price: string | null }[],
): { low: string; high: string } | null {
    if (variants.length < 2) return null;
    const prices = variants.map((v) => v.price ?? price);
    const sorted = [...prices].sort((a, b) => Number(a) - Number(b));
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    return Number(low) === Number(high) ? null : { low, high };
}

/**
 * The row's second line, as the design writes it: "2 variants · SKU ·
 * where it sells". A product without variants says nothing about them —
 * never "0 variants" — so it reads as its SKU (if any) and its
 * storefronts. `places` is left out when the view needn't say where.
 */
export function rowFacts(
    row: Pick<CatalogueRow, "variantCount" | "sku" | "places">,
    showPlaces: boolean,
): { variants: string | null; sku: string | null; places: string | null } {
    const n = row.variantCount;
    return {
        variants: n > 0 ? `${n} ${n === 1 ? "variant" : "variants"}` : null,
        sku: row.sku?.trim() ? row.sku : null,
        places:
            showPlaces && row.places.length > 0
                ? row.places.map((p) => p.storeName).join(" · ")
                : null,
    };
}

/** Stock as the row says it, and the colour role that reinforces it. */
export type StockTone = "plain" | "warn" | "danger" | "muted";

/**
 * The Inventory column: "30 in stock", "Out of stock", "Not tracked",
 * "Sold out". Coloured by what can be sold: nothing to sell is danger, at or
 * under the product's own warning level is the accent, else plain. `null`
 * stock means nothing here counts it, never a failed read: the stock comes
 * in the catalogue read itself, and that read failing fails the page (its
 * error boundary), so no row ever shows a guessed zero or "Not tracked".
 */
export function stockWords(
    row: Pick<CatalogueRow, "stock" | "canSell" | "lowStockAlert" | "soldOut">,
): { text: string; tone: StockTone } {
    if (row.stock === null || row.canSell === null) {
        return row.soldOut
            ? { text: "Sold out", tone: "danger" }
            : { text: "Not tracked", tone: "muted" };
    }
    if (row.stock <= 0) return { text: "Out of stock", tone: "danger" };
    const text = `${row.stock} in stock`;
    if (row.canSell <= 0) return { text, tone: "danger" };
    if (row.lowStockAlert !== null && row.lowStockAlert > 0) {
        if (row.canSell <= row.lowStockAlert) return { text, tone: "warn" };
    }
    return { text, tone: "plain" };
}

/** Two letters from the product's words: "Rye & caraway loaf" → "RC". */
export function initials(name: string): string {
    return name
        .split(/[\s&]+/)
        .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
}
