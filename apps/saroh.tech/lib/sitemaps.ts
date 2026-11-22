import type { SitemapEntry } from "@saroh/marketing/sitemap-xml";

import { canonicalOf } from "@/lib/seo";
import { indexedPages, indiaPair } from "@/lib/site-map";

/**
 * `/sitemap.xml` is an index of one sitemap per group, `/sitemap/<group>.xml`,
 * as on saroh.in (`apps/saroh.in/lib/sitemaps.ts`). A page is in the group of
 * its first path segment; every other page is in `pages`. A group with no
 * indexed page has no sitemap and no entry.
 */
const GROUPS = [
    "pages",
    "solutions",
    "features",
    "tools",
    "guides",
    "help",
    "changelog",
] as const;

const groupOf = (path: string) =>
    GROUPS.find((g) => g !== "pages" && path.split("/")[1] === g) ?? "pages";

/** One page: the day its words changed, and its saroh.in twin where it has one. */
function entryOf(path: string, updated?: string): SitemapEntry {
    const url = canonicalOf(path);
    const india = indiaPair(path);
    return {
        url,
        ...(updated && { lastModified: updated }),
        ...(india && {
            alternates: { en: url, "en-IN": india, "x-default": url },
        }),
    };
}

/** Each group's entries, in index order, empty groups left out. */
export function sitemapGroups(
    pages = indexedPages(),
): Map<string, SitemapEntry[]> {
    return new Map(
        GROUPS.map((g): [string, SitemapEntry[]] => [
            g,
            pages
                .filter((p) => groupOf(p.path) === g)
                .map((p) => entryOf(p.path, p.updated)),
        ]).filter(([, entries]) => entries.length > 0),
    );
}
