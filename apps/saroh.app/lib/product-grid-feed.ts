import type { ProductGridFeed } from "@saroh/site-blocks";

/**
 * Each Product grid's products, for a page that has any (G12).
 *
 * A grid is bound to the catalogue, so the page that serves the site reads
 * each grid's own products on the server and hands them in by the section's
 * index. Every grid asks its own question (the newest, a collection or
 * picked, and a count), so each is one read; a page with none costs nothing
 * extra, and a grid that can show nothing yet (no collection or products
 * chosen) is not read at all.
 *
 * Pure apart from `read`, so the rule is testable without the app's env.
 */

/** The most grids one page reads; past it, a grid draws nothing. */
export const MAX_GRIDS_READ = 6;

export async function productGridFeeds(
    sections: readonly { type: string; content: unknown }[],
    /** Where product pages live, or null for cards without links. */
    basePath: string | null,
    /** The grid's read, by its query; null when there is nothing to read. */
    query: (content: unknown) => string | null,
    read: (query: string) => Promise<ProductGridFeed["products"]>,
    /** The page is the Shop page itself: no "Shop →" back to it (UX-082). */
    atShop = false,
): Promise<(ProductGridFeed | undefined)[] | undefined> {
    const grids = sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => section.type === "productGrid")
        .slice(0, MAX_GRIDS_READ);
    if (grids.length === 0) return undefined;
    const feeds: (ProductGridFeed | undefined)[] = sections.map(
        () => undefined,
    );
    await Promise.all(
        grids.map(async ({ section, index }) => {
            const q = query(section.content);
            // A failed read, the shop not open or nothing on sale is an empty
            // list (the reader never throws), and an empty grid draws
            // nothing: the page still serves.
            feeds[index] = {
                products: q ? await read(q) : [],
                basePath,
                ...(atShop ? { atShop } : {}),
            };
        }),
    );
    // A grid past the cap gets an empty feed, never a read of its own from
    // the visitor's browser.
    sections.forEach((section, index) => {
        if (section.type === "productGrid" && feeds[index] === undefined) {
            feeds[index] = {
                products: [],
                basePath,
                ...(atShop ? { atShop } : {}),
            };
        }
    });
    return feeds;
}
