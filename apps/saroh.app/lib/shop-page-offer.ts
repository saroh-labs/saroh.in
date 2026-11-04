import {
    PRODUCT_GRID_DEFAULT_COUNT,
    PRODUCT_GRID_MAX,
} from "@saroh/block-contract";
import type { ProductGridFeed } from "@saroh/site-blocks";

import type { PublicationPage, Section } from "./publication";

/**
 * What a published Shop page offers (`/shop`), as a Book page does: it is the
 * way to the shop, so everything sold is within reach of it. Its grids keep
 * what the merchant set (a grid holds 12 at most, and may hold fewer on
 * purpose), and:
 *
 * - products sold beyond what they draw: "See all products" opens the shop's
 *   own listing (`/shop?all=1`);
 * - grids that draw nothing (the picked ones all gone, say): the route draws
 *   that listing, which says so in words when nothing is on sale;
 * - a page with no grid gets one, as a new Shop page starts with.
 *
 * A grid whose own read failed says so itself (`FeedFailed`), and is not
 * "nothing". Pure, so it is tested without a server.
 */

/** The shop's own listing, past a Shop page (`moduleRoute`'s deep link). */
export const ALL_PRODUCTS_HREF = "/shop?all=1";

/** A Shop page's grid where the page has none (`defaultModuleSections`). */
const EVERY_PRODUCT: Section = {
    type: "productGrid",
    contractVersion: 1,
    content: {
        title: "All products",
        source: "newest",
        count: PRODUCT_GRID_MAX,
    },
};

/** The page to draw: its own, with a grid when it has none. */
export function withShopGrid(page: PublicationPage): PublicationPage {
    return page.sections.some((s) => s.type === "productGrid")
        ? page
        : { ...page, sections: [...page.sections, EVERY_PRODUCT] };
}

/**
 * The grids' feeds with the way on from the first that draws something, or
 * null when the page's grids draw nothing at all.
 */
export function shopPageFeeds(
    sections: readonly Section[],
    feeds: readonly (ProductGridFeed | undefined)[] | undefined,
    sold: readonly { slug: string }[],
): (ProductGridFeed | undefined)[] | null {
    const drawn = new Set<string>();
    let failed = false;
    sections.forEach((section, i) => {
        const feed = feeds?.[i];
        if (!feed) return;
        failed ||= feed.failed === true;
        const count =
            (section.content as { count?: number } | null)?.count ??
            PRODUCT_GRID_DEFAULT_COUNT;
        for (const p of feed.products.slice(0, count)) drawn.add(p.slug);
    });
    if (drawn.size === 0 && !failed) return null;
    const more = sold.some((p) => !drawn.has(p.slug));
    const first = feeds?.findIndex((f) => (f?.products.length ?? 0) > 0) ?? -1;
    return sections.map((_, i) => {
        const feed = feeds?.[i];
        return feed && i === first && more
            ? { ...feed, moreHref: ALL_PRODUCTS_HREF }
            : feed;
    });
}
