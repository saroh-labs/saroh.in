import type {
    ForPageEntry,
    Question,
    ToolPageEntry,
} from "@saroh/search-pages";
import { listSearchPages } from "@saroh/search-pages";

import type { PublishContext } from "@/content/resources";
import { routeExists, shownTools } from "@/content/resources";
import { solutionHref } from "@/content/solutions";
import type { SolutionSlug } from "@/content/types";
import { env } from "@/env";
import { faqPageLd } from "@/lib/structured-data";

/**
 * The /for/ pages and free tools this build has (DEC-193, #1253). `search-pages.config.js` reads
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

/** Whether the page at `path` is live; a preview draws the rest as drafts. */
export const isPublished = (path: string) => publishList().live.includes(path);

/** A page's questions as FAQPage data, each answer's paragraphs joined. */
export const questionsLd = (questions: Question[]) =>
    faqPageLd(
        questions.map((q) => ({ q: q.question, a: q.answer.join("\n\n") })),
    );

/** The /for/ pages this build draws: every page on a preview, the live ones otherwise. */
export function builtSearchPages(
    list: PublishList = publishList(),
): ForPageEntry[] {
    const live = new Set(list.live);
    return listSearchPages({ kind: "for" }).filter(
        (p) => list.preview || live.has(p.path),
    );
}

/** The live /for/ pages in the code: the sitemap's, `/llms.txt`'s and the hub's on production. */
export function liveSearchPages(
    list: PublishList = publishList(),
): ForPageEntry[] {
    const live = new Set(list.live);
    return listSearchPages({ kind: "for" }).filter((p) => live.has(p.path));
}

/**
 * "See all trades" under the Solutions menus and footer column, once a /for/
 * page is live: the same rule as the Resources hubs (`docHubLinks`).
 */
export function tradesHubLinks(list: PublishList = publishList()) {
    return liveSearchPages(list).length > 0
        ? [
              {
                  name: "See all trades",
                  line: "Find the page for your trade.",
                  href: FOR_HUB.path,
              },
          ]
        : [];
}

/** The /tools hub: the menus' "Free tools" and every tool's breadcrumb. */
export const TOOLS_HUB = { name: "Free tools", path: "/tools" } as const;

/**
 * The free tools this build has (#1253): every tool on a preview, the live
 * ones otherwise; the two app tools (`inApp`) included, whose own routes
 * obey the same list (`content/resources.ts`).
 */
export function builtTools(list: PublishList = publishList()): ToolPageEntry[] {
    const live = new Set(list.live);
    return listSearchPages({ kind: "tools" }).filter(
        (p) => list.preview || live.has(p.path),
    );
}

/** The live tools in the code: the menus', the sitemap's and `/llms.txt`'s. */
export function liveTools(list: PublishList = publishList()): ToolPageEntry[] {
    const live = new Set(list.live);
    return listSearchPages({ kind: "tools" }).filter((p) => live.has(p.path));
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

/** A tool as the menus, the footer and `/llms.txt` list it. */
export interface ToolLink {
    name: string;
    line: string;
    href: string;
}

/**
 * The Tools menu, the footer's Tools column and `/llms.txt`'s Tools
 * (#1253): the app's own tools shown at `ctx` (`content/resources.ts`,
 * which asks the publish list), then the package's live tools whose route
 * this build has. A draft tool is never listed, on a preview either.
 */
export function shownToolLinks(
    ctx: PublishContext,
    list: PublishList = publishList(),
): ToolLink[] {
    return [
        ...shownTools(ctx).map((p) => ({
            name: p.name,
            line: p.line,
            href: p.href,
        })),
        ...liveTools(list)
            .filter((t) => !t.inApp && routeExists(t.path, ctx.routes))
            .map((t) => ({ name: t.name, line: t.line, href: t.path })),
    ];
}
