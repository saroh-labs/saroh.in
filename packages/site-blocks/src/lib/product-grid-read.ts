import type { RenderedProductGrid } from "@saroh/block-contract";
import { PRODUCT_GRID_DEFAULT_COUNT } from "@saroh/block-contract";

import type { ShopListingCard } from "../product/shop-listing";

/**
 * The Product grid's public read (G12), in a module with no "use client"
 * directive: saroh.app's server builds each grid's query and narrows its
 * answer with these. Exported from the Product grid block's own (client)
 * module they were only client references on the server, the call threw,
 * and any live or preview page holding a Product grid failed to load
 * ("This page isn't loading").
 */

/**
 * The public read's query for this grid, or null when it can show nothing
 * yet (a collection or products still to be chosen): no read is made.
 */
export function productGridQuery(content: RenderedProductGrid): string | null {
    const q = new URLSearchParams();
    const source = content.source ?? "newest";
    q.set("source", source);
    if (source === "collection") {
        if (!content.collectionId) return null;
        q.set("collection", content.collectionId);
    }
    if (source === "picked") {
        const ids = content.productIds ?? [];
        if (ids.length === 0) return null;
        q.set("ids", ids.join(","));
    }
    q.set("count", String(content.count ?? PRODUCT_GRID_DEFAULT_COUNT));
    return q.toString();
}

export function isShopListingCard(value: unknown): value is ShopListingCard {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    const image = v.image as Record<string, unknown> | null | undefined;
    return (
        typeof v.slug === "string" &&
        typeof v.name === "string" &&
        typeof v.currency === "string" &&
        typeof v.price === "string" &&
        (v.mrp === null || typeof v.mrp === "string") &&
        typeof v.priceFrom === "boolean" &&
        (image === null ||
            (typeof image === "object" &&
                typeof image.url === "string" &&
                typeof image.alt === "string")) &&
        Array.isArray(v.variantTitles) &&
        v.variantTitles.every((t) => typeof t === "string") &&
        (v.optionName === undefined ||
            v.optionName === null ||
            typeof v.optionName === "string") &&
        (v.blurb === null || typeof v.blurb === "string") &&
        typeof v.soldOut === "boolean"
    );
}

/** The cards in a read's body, narrowed rather than cast (#264); else null. */
export function productCardsOf(body: unknown): ShopListingCard[] | null {
    const rows = (body as { products?: unknown } | null)?.products;
    if (!Array.isArray(rows)) return null;
    return rows.filter(isShopListingCard);
}
