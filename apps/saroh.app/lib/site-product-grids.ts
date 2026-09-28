import type { ProductGridFeed } from "@saroh/site-blocks";
import { productCardsOf, productGridQuery } from "@saroh/site-blocks";

import { shopFetch } from "./catalogue";
import { productGridFeeds } from "./product-grid-feed";

/**
 * A Product grid's products (round-2 G12), server to server, never cached:
 * `GET /public/sites/:siteId/shop/products?source=…`. The API serves only
 * published products listed at the site's storefront and 404s while the
 * shop isn't open for the business. Either way a miss is an empty list
 * here, so the grid draws nothing. The call carries the signed relay, as
 * the shop's reads do, so the API's per-visitor limit counts the visitor.
 */
async function getGridProducts(
    siteId: string,
    query: string,
): Promise<ProductGridFeed["products"]> {
    const res = await shopFetch(
        `${encodeURIComponent(siteId)}/shop/products?${query}`,
    );
    if (!res?.ok) return [];
    return productCardsOf(await res.json().catch(() => null)) ?? [];
}

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
export function getProductGridFeeds(
    sections: readonly { type: string; content: unknown }[],
    siteId: string | null,
): Promise<(ProductGridFeed | undefined)[] | undefined> {
    return productGridFeeds(sections, "/shop", queryOf, (query) =>
        siteId ? getGridProducts(siteId, query) : Promise.resolve([]),
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
