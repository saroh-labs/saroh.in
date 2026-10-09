import { dontCachePage, keepPageAtMost, tagPage } from "./record";
import { productTag, siteProductsTag, siteTag } from "./tags";

/**
 * What the site's pages tell the page cache (#863). One place, so the rules
 * are read and tested together; the layout and the pages call these. None
 * of them ever throws into a render: an id that can't be a tag leaves the
 * page unkept instead.
 */

/**
 * The most seconds a page carrying the live head read may be kept: the
 * merchant's trackers and verification codes are read on every render,
 * outside the publication (DEC-108), and Saroh's switch must take effect
 * within this. The read itself stays uncached (`lib/site-head.ts`).
 */
export const LIVE_HEAD_MAX_AGE_SECONDS = 60;

export interface LayoutFacts {
    /** The live site, or null when the host resolved to none. */
    siteId: string | null | undefined;
    /** A test host, or a release shown on one (DEC-071). */
    test: boolean;
    /** The page carries trackers or verification codes. */
    liveHead: boolean;
    /** The shop's read failed (not "closed": failed). */
    catalogueFailed: boolean;
}

function tagSafely(make: () => string): void {
    try {
        tagPage(make());
    } catch {
        dontCachePage("untaggable id");
    }
}

/** The layout's part: whose page this is, and what limits keeping it. */
export function pageCacheRules(facts: LayoutFacts): void {
    if (facts.test) {
        dontCachePage("test release");
        return;
    }
    const siteId = facts.siteId;
    if (!siteId) return;
    tagSafely(() => siteTag(siteId));
    if (facts.liveHead) keepPageAtMost(LIVE_HEAD_MAX_AGE_SECONDS);
    // The header's Order and the shop's pages follow this read: a failure
    // must not be what every visitor sees for the next few minutes.
    if (facts.catalogueFailed) dontCachePage("catalogue unavailable");
}

/** `/shop` and every page with a Product grid: they list products. */
export function listsProducts(siteId: string): void {
    tagSafely(() => siteProductsTag(siteId));
}

/**
 * A product's page: its own tag when the API names the product, else the
 * site's products (an API from before #863), so it is never left stale.
 */
export function showsProduct(
    siteId: string,
    productId: string | undefined,
): void {
    tagSafely(() =>
        productId ? productTag(siteId, productId) : siteProductsTag(siteId),
    );
}

export { dontCachePage };
