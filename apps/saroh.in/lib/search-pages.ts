import type { SearchPageEntry } from "@saroh/search-pages";
import { listSearchPages } from "@saroh/search-pages";

import { solutionHref } from "@/content/solutions";
import type { SolutionSlug } from "@/content/types";
import { env } from "@/env";

/**
 * The /for/ pages this build has (DEC-193). `search-pages.config.js` reads
 * `GET /public/search-pages` before `next build` and `next.config.js`
 * inlines it as `SAROH_SEARCH_PAGES`; this module is what every page,
 * the sitemap, `/llms.txt`, the menus and the footer ask. Server only.
 *
 * - Production builds only the live pages, and refuses to build without
 *   the list.
 * - A preview build (dev, CI, local) builds every page in the code; a page
 *   not live says Draft and `noindex`, and is in no sitemap or list.
 */
export interface PublishList {
    preview: boolean;
    live: string[];
    takenOff: { path: string; at: string }[];
}

/** The inlined list, or (outside production) a preview with nothing live. */
export function parsePublishList(
    raw: string | undefined,
    vercelEnv: string | undefined,
): PublishList {
    let list: PublishList | null = null;
    try {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        const p = parsed as PublishList | null;
        if (p && Array.isArray(p.live) && Array.isArray(p.takenOff)) list = p;
    } catch {
        list = null;
    }
    if (vercelEnv === "production") {
        if (!list) {
            throw new Error(
                "saroh.in: no /for/ publish list for a production build. `pnpm build` reads it first (search-pages.config.js); a production build never guesses which pages are live (DEC-193).",
            );
        }
        return { ...list, preview: false };
    }
    return list ?? { preview: true, live: [], takenOff: [] };
}

/**
 * The /for hub as the pages' breadcrumb names it, drawn and in JSON-LD:
 * "Solutions", the nav's word for the same pages.
 */
export const FOR_HUB = { name: "Solutions", path: "/for" } as const;

export function publishList(): PublishList {
    return parsePublishList(env.SAROH_SEARCH_PAGES, env.VERCEL_ENV);
}

/** The pages this build draws: every page on a preview, the live ones otherwise. */
export function builtSearchPages(
    list: PublishList = publishList(),
): SearchPageEntry[] {
    const live = new Set(list.live);
    return listSearchPages().filter((p) => list.preview || live.has(p.path));
}

/** The live pages in the code: the sitemap's, `/llms.txt`'s and the hub's on production. */
export function liveSearchPages(
    list: PublishList = publishList(),
): SearchPageEntry[] {
    const live = new Set(list.live);
    return listSearchPages().filter((p) => live.has(p.path));
}

/**
 * Where a solution is linked: its /for/ page once that is live (the
 * /solutions/ address then 301s there, `redirects.js`), else /solutions/.
 */
export function solutionLink(
    slug: SolutionSlug,
    list: PublishList = publishList(),
): string {
    const page = `/for/${slug}`;
    return liveSearchPages(list).some((p) => p.path === page)
        ? page
        : solutionHref(slug);
}
