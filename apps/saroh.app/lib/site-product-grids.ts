import { cache } from "react";

import type { ProductGridFeed } from "@saroh/site-blocks";
import { productCardsOf, productGridQuery } from "@saroh/site-blocks";

import { shopFetch } from "./catalogue";
import { dontCachePage, listsProducts } from "./page-cache/site-rules";
import { productGridFeeds } from "./product-grid-feed";
import { getCheckoutOptions } from "./shop-checkout";

/**
 * A Product grid's products (round-2 G12), server to server, never cached:
 * `GET /public/sites/:siteId/shop/products?source=…`. The API serves only
 * published products listed at the site's storefront and 404s while the
 * shop isn't open for the business, an empty list here, so the grid draws
 * nothing. A read that failed is null, and the page isn't kept. The call
 * carries the signed relay, as the shop's reads do, so the API's per-visitor
 * limit counts the visitor. `cache` is one read for the menu and the page
 * within a request.
 */
const getGridProducts = cache(async function getGridProducts(
    siteId: string,
    query: string,
): Promise<ProductGridFeed["products"] | null> {
    // Its cards' prices and stock are on the page (#863).
    listsProducts(siteId);
    const res = await shopFetch(
        `${encodeURIComponent(siteId)}/shop/products?${query}`,
    );
    // A shop that isn't open is an empty grid, as kept as any page; a read
    // that failed is not what every visitor should see for minutes.
    if (res?.status === 404) return [];
    const cards = res?.ok
        ? productCardsOf(await res.json().catch(() => null))
        : null;
    if (!cards) dontCachePage("grid unavailable");
    return cards;
});

/** The grid's query, from a snapshot section's content (JSON). */
function queryOf(content: unknown): string | null {
    if (typeof content !== "object" || content === null) return null;
    // Snapshot content passed its contract at publish.
    return productGridQuery(content);
}

/**
 * The Product grids' feeds for a live page, by section index, or undefined
 * when the page has none. Cards open the site's `/shop/<product>`.
 */
export async function getProductGridFeeds(
    sections: readonly { type: string; content: unknown }[],
    siteId: string | null,
    /** The page is the Shop page itself (UX-082). */
    atShop = false,
): Promise<(ProductGridFeed | undefined)[] | undefined> {
    const [feeds, checkout] = await Promise.all([
        productGridFeeds(
            sections,
            "/shop",
            queryOf,
            (query) =>
                siteId ? getGridProducts(siteId, query) : Promise.resolve([]),
            atShop,
        ),
        // A card's Add fills the bag only where the site takes orders now,
        // as the product page's Add does: the header's read, shared.
        siteId && sections.some(addsInPlace)
            ? getCheckoutOptions(siteId)
            : null,
    ]);
    const bagSite = checkout?.canOrder ? siteId : null;
    return bagSite ? feeds?.map((f) => f && { ...f, bagSite }) : feeds;
}

/** A grid whose cards add to the bag in place (DEC-237). */
function addsInPlace(section: { type: string; content: unknown }): boolean {
    return (
        section.type === "productGrid" &&
        (section.content as { addInPlace?: unknown } | null)?.addInPlace ===
            true
    );
}

/**
 * The same behind a preview token: the products on sale now (a draft
 * product never shows, even here). A preview has no shop of its own, so the
 * cards draw without links.
 */
export function getPreviewProductGridFeeds(
    sections: readonly { type: string; content: unknown }[],
    siteId: string | null,
): Promise<(ProductGridFeed | undefined)[] | undefined> {
    return productGridFeeds(sections, null, queryOf, (query) =>
        siteId ? getGridProducts(siteId, query) : Promise.resolve([]),
    );
}
