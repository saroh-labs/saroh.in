import type { SitemapEntry } from "@saroh/marketing/sitemap-xml";
import {
    sitemapIndexXml as indexXml,
    urlsetXml,
    xmlResponse,
} from "@saroh/marketing/sitemap-xml";
import { DOC_KINDS } from "@saroh/search-pages/kinds";

import type { PublishContext } from "@/content/resources";
import { routeExists } from "@/content/resources";
import type { LaunchMode } from "@/lib/links";
import { LAUNCH_MODE } from "@/lib/links";
import { readLivePricingVersion } from "@/lib/pricing";
import { resourcesContext } from "@/lib/resources-context";
import { liveDocPages } from "@/lib/search-page-route";
import type { PublishList } from "@/lib/search-pages";
import { publishList } from "@/lib/search-pages";
import { SITE_URL } from "@/lib/seo";
import { indexedPaths, lastModified } from "@/lib/site-pages";

/**
 * `/sitemap.xml` is an index of one sitemap per group, `/sitemap/<group>.xml`
 * (plan 2026-10-31-002, R5): `pages` (every page but /for/ and /tools/),
 * `for`, `tools`, then one per kind on the kind list. A group with no page
 * has no sitemap and no entry. Next 16's `generateSitemaps` writes no index,
 * so `app/sitemap.xml/route.ts` and `app/sitemap/[group]/route.ts` write
 * these by hand, static at build.
 *
 * Every page says the day its words last changed (`lastModified`), never the
 * build's. The XML is `@saroh/marketing/sitemap-xml`, shared with saroh.tech.
 */
export type { SitemapEntry };

const inGroup = (path: string, hub: string) =>
    path === hub || path.startsWith(`${hub}/`);

/** Each group's entries, in index order, empty groups left out. */
export function sitemapGroups(
    mode: LaunchMode,
    ctx: PublishContext,
    pricingLiveAt: string | null = null,
    list: PublishList = publishList(),
): Map<string, SitemapEntry[]> {
    const entry = (path: string): SitemapEntry => {
        const changed = lastModified(path, pricingLiveAt, ctx.now, list);
        return {
            url: `${SITE_URL}${path}`,
            ...(changed && { lastModified: changed }),
        };
    };
    const today = indexedPaths(mode, ctx, list);
    const groups: [string, string[]][] = [
        [
            "pages",
            today.filter((p) => !inGroup(p, "/for") && !inGroup(p, "/tools")),
        ],
        ["for", today.filter((p) => inGroup(p, "/for"))],
        ["tools", today.filter((p) => inGroup(p, "/tools"))],
        ...DOC_KINDS.map((k): [string, string[]] => {
            const pages = liveDocPages(k.id, list)
                .map((p) => p.path)
                .filter((p) => routeExists(p, ctx.routes));
            const hub =
                pages.length && routeExists(k.hub, ctx.routes) ? [k.hub] : [];
            return [k.sitemap, [...hub, ...pages]];
        }),
    ];
    return new Map(
        groups
            .filter(([, paths]) => paths.length > 0)
            .map(([g, paths]) => [g, paths.map(entry)]),
    );
}

/** The groups as this build lists them: launch mode, live pricing, the build's routes. */
export async function builtSitemapGroups(): Promise<
    Map<string, SitemapEntry[]>
> {
    // /pricing is listed only once the launch switch is open (`indexedPaths`).
    const pricing =
        LAUNCH_MODE === "open" ? await readLivePricingVersion() : null;
    return sitemapGroups(LAUNCH_MODE, resourcesContext(), pricing?.goLiveAt);
}

/** The index, with saroh.in's address (`@saroh/marketing/sitemap-xml`). */
export const sitemapIndexXml = (
    groups: ReadonlyMap<string, readonly SitemapEntry[]>,
) => indexXml(SITE_URL, groups);

export { urlsetXml, xmlResponse };
