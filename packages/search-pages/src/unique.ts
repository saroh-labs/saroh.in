/** What `checkUnique` reads of a page, of any kind. */
export interface UniqueEntry {
    path: string;
    slug: string;
    search: string;
}

/**
 * Pages of every kind must not share a slug (the admin's detail address is
 * `/search-pages/<slug>`) nor a search (two pages would compete for it).
 */
export function checkUnique(entries: readonly UniqueEntry[]): void {
    const slugs = new Map<string, string>();
    const searches = new Map<string, string>();
    for (const p of entries) {
        const otherSlug = slugs.get(p.slug);
        if (otherSlug)
            throw new Error(
                `${p.path} and ${otherSlug} share the slug "${p.slug}"`,
            );
        slugs.set(p.slug, p.path);
        const key = p.search.toLowerCase();
        const other = searches.get(key);
        if (other)
            throw new Error(`${p.path} and ${other} both answer "${p.search}"`);
        searches.set(key, p.path);
    }
}
