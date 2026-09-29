import type { ProductPageData, ShopListingCard } from "@saroh/site-blocks";

/**
 * The public catalogue's answers (round-2 G11), and the checks that narrow
 * them. Kept apart from `catalogue.ts`, which reads the app's env, so they
 * can be tested without one — the checkout-shape pattern.
 *
 * A body that fails a check is treated as the API being unavailable: the
 * page says so rather than drawing half a product.
 */

export interface Catalogue {
    storefront: { name: string };
    products: ShopListingCard[];
}

/** A product page: what `ProductPage` draws, plus its address and search text. */
export type CatalogueProduct = ProductPageData & {
    slug: string;
    /**
     * The listing at the site's storefront, what the bag holds (G13).
     * Absent from an API before G13; such a page offers no bag.
     */
    listingId?: string;
    seoTitle: string | null;
    seoDescription: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
const isString = (v: unknown): v is string => typeof v === "string";
const isStringOrNull = (v: unknown): v is string | null =>
    v === null || isString(v);
const STOCK_WORDS = new Set(["IN_STOCK", "LOW", "SOLD_OUT", "UNTRACKED"]);

function isCard(v: unknown): v is ShopListingCard {
    return (
        isRecord(v) &&
        isString(v.slug) &&
        isString(v.name) &&
        isString(v.currency) &&
        isString(v.price) &&
        isStringOrNull(v.mrp) &&
        typeof v.priceFrom === "boolean" &&
        (v.image === null ||
            (isRecord(v.image) &&
                isString(v.image.url) &&
                isString(v.image.alt))) &&
        Array.isArray(v.variantTitles) &&
        v.variantTitles.every(isString) &&
        isStringOrNull(v.blurb) &&
        typeof v.soldOut === "boolean" &&
        // What the card's Add to bag holds (an older API sends neither).
        (v.listingId === undefined || isString(v.listingId)) &&
        (v.bagVariantId === undefined || isStringOrNull(v.bagVariantId))
    );
}

export function isCatalogue(v: unknown): v is Catalogue {
    return (
        isRecord(v) &&
        isRecord(v.storefront) &&
        isString(v.storefront.name) &&
        Array.isArray(v.products) &&
        v.products.every(isCard)
    );
}

function isVariant(v: unknown): boolean {
    return (
        isRecord(v) &&
        isString(v.id) &&
        isString(v.title) &&
        isStringOrNull(v.price) &&
        isStringOrNull(v.mrp) &&
        isStringOrNull(v.imageId) &&
        isString(v.stock) &&
        STOCK_WORDS.has(v.stock) &&
        (v.left === null || typeof v.left === "number")
    );
}

function isImage(v: unknown): boolean {
    return isRecord(v) && isString(v.id) && isString(v.url) && isString(v.alt);
}

export function isCatalogueProduct(v: unknown): v is CatalogueProduct {
    return (
        isRecord(v) &&
        isString(v.slug) &&
        isString(v.name) &&
        isString(v.currency) &&
        isString(v.price) &&
        isStringOrNull(v.mrp) &&
        isStringOrNull(v.description) &&
        Array.isArray(v.keyPoints) &&
        v.keyPoints.every(isString) &&
        Array.isArray(v.images) &&
        v.images.every(isImage) &&
        Array.isArray(v.variants) &&
        v.variants.every(isVariant) &&
        (v.stock === null ||
            (isRecord(v.stock) &&
                isString(v.stock.word) &&
                STOCK_WORDS.has(v.stock.word))) &&
        Array.isArray(v.reviews) &&
        Array.isArray(v.extras) &&
        isStringOrNull(v.seoTitle) &&
        isStringOrNull(v.seoDescription) &&
        (v.listingId === undefined || isString(v.listingId))
    );
}

/** What a read came to: the data, nothing to show (404), or trouble. */
export type CatalogueLookup<T> =
    { ok: true; data: T } | { ok: false; reason: "missing" | "unavailable" };

/** Turn a response into a lookup, with `check` narrowing the body. */
export async function lookupOf<T>(
    res: Response,
    check: (v: unknown) => v is T,
): Promise<CatalogueLookup<T>> {
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body: unknown = await res.json().catch(() => null);
    return check(body)
        ? { ok: true, data: body }
        : { ok: false, reason: "unavailable" };
}
