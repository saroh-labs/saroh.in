/**
 * The page cache's tags (#863): what a cached page was drawn from, so the API
 * can say "these changed" and every page drawn from them is drawn again.
 *
 *   site:<siteId>                         every page of the site
 *   site:<siteId>:products                pages that list products (/shop, grids)
 *   site:<siteId>:product:<productId>     one product's page
 *
 * Every tag starts with its site, so the tag store is kept per site and one
 * site's changes never touch another's pages. The API builds the same strings
 * (`apps/api.saroh.in/src/modules/sites/page-cache.job.ts`); both test files
 * pin them.
 */

/** Ids as the API mints them (cuid): letters, digits, `_` and `-`. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const TAG =
    /^site:([A-Za-z0-9_-]{1,64})(?::products|:product:[A-Za-z0-9_-]{1,64})?$/;

function id(value: string, what: string): string {
    if (!ID.test(value)) throw new Error(`page cache: not a ${what} id`);
    return value;
}

/** Every page of the site. */
export function siteTag(siteId: string): string {
    return `site:${id(siteId, "site")}`;
}

/** Pages that list the site's products: `/shop` and Product grids. */
export function siteProductsTag(siteId: string): string {
    return `site:${id(siteId, "site")}:products`;
}

/** One product's page on the site. */
export function productTag(siteId: string, productId: string): string {
    return `site:${id(siteId, "site")}:product:${id(productId, "product")}`;
}

/** The site a tag belongs to, or null when it isn't one of ours. */
export function siteOfTag(tag: string): string | null {
    return TAG.exec(tag)?.[1] ?? null;
}

/** Tags grouped by site; anything malformed is left out. */
export function tagsBySite(tags: Iterable<string>): Map<string, string[]> {
    const out = new Map<string, string[]>();
    Array.from(tags).forEach((tag) => {
        const site = siteOfTag(tag);
        if (!site) return;
        const list = out.get(site) ?? [];
        if (!list.includes(tag)) list.push(tag);
        out.set(site, list);
    });
    return out;
}
