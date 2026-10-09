/**
 * The Resources pages (plan U1): ONE list that drives the nav's Resources
 * menu, the footer's Resources column, the sitemap and the breadcrumbs.
 *
 * A page is shown — linked anywhere, or listed in the sitemap — only when
 * both hold:
 *
 * - it is **published**: its `publishOn` day has begun in India
 *   (`isPublished`, KTD-2), or the deployment is a preview with
 *   `RESOURCES_PREVIEW` on (`lib/resources-context.ts`);
 * - its **route exists** in this build (`SAROH_BUILT_ROUTES`, written by
 *   `next.config.js`), so a page listed here before its route lands never
 *   links to a 404.
 *
 * Templates (`/templates`, plan U6) is listed now the industry templates
 * exist: its gallery shows only templates a merchant can pick
 * (`content/templates.ts`), and its detail pages follow it into the
 * sitemap (`lib/site-pages.ts`).
 */

/** A day, `YYYY-MM-DD`, read in India time. */
export type IsoDay = string;

export interface ResourcePage {
    id: string;
    /** The menu's and footer's name. */
    name: string;
    /** The menu's line under the name. */
    line: string;
    href: string;
    /** The day it goes live, in India (Asia/Kolkata). */
    publishOn: IsoDay;
    /**
     * Pages under it the sitemap lists with it, each shown only when its
     * route exists (`/integrations/razorpay` needs `/integrations/[provider]`).
     */
    children?: readonly string[];
}

/** In the plan's order: Help, Integrations, Changelog, Templates, Link preview tool. */
export const RESOURCE_PAGES: readonly ResourcePage[] = [
    {
        id: "help",
        name: "Help",
        line: "Step-by-step answers for the first things you set up.",
        href: "/help",
        // Help goes live with early access, not before (decided 3 Oct).
        publishOn: "2026-10-17",
    },
    {
        id: "integrations",
        name: "Integrations",
        line: "Razorpay, Cashfree and your own email, and how to connect them.",
        href: "/integrations",
        publishOn: "2026-10-05",
        children: [
            "/integrations/razorpay",
            "/integrations/cashfree",
            "/integrations/email",
        ],
    },
    {
        id: "changelog",
        name: "Changelog",
        line: "What's new in Saroh, written for the people who use it.",
        href: "/changelog",
        publishOn: "2026-10-05",
    },
    {
        id: "templates",
        name: "Templates",
        line: "Sites made for your kind of business, ready to start from.",
        href: "/templates",
        // With early access, as Help (industry templates plan U13).
        publishOn: "2026-10-17",
    },
    {
        id: "link-preview",
        name: "Link preview tool",
        line: "See how your link looks when it's shared, and what to fix.",
        href: "/tools/link-preview",
        publishOn: "2026-10-05",
    },
];

/**
 * The footer's legal pages. Live from 5 Oct 2026 so Razorpay's review can read
 * them (owner, 5 Oct); "Last updated" is each page's `publishOn`.
 */
export const LEGAL_PAGES: readonly ResourcePage[] = [
    {
        id: "privacy",
        name: "Privacy",
        line: "What Saroh collects, why, and what you can ask for.",
        href: "/privacy",
        // 8 Oct: merchants' own trackers (DEC-108). 9 Oct: Vercel removed
        // from the processors; Cloudflare serves every site (DEC-107).
        publishOn: "2026-10-09",
    },
    {
        id: "terms",
        name: "Terms",
        line: "The agreement for using Saroh.",
        href: "/terms",
        // 7 Oct: the term ends with a request to pay (DEC-100). 8 Oct:
        // merchants' own trackers (DEC-108).
        publishOn: "2026-10-08",
    },
    {
        id: "refunds",
        name: "Refunds",
        line: "Cancelling a plan, and why payments aren't refunded.",
        href: "/refunds",
        publishOn: "2026-10-05",
    },
];

/** Who makes Saroh, as the footer says it (R6). */
export const MADE_BY = "A product of Virashi Softwares LLP";

/** India is UTC+05:30 all year (no daylight saving). */
const INDIA_OFFSET = "+05:30";

/** The instant a day begins in India: midnight IST. */
export function dayStartsAt(day: IsoDay): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw new Error(`Not a day (YYYY-MM-DD): ${day}`);
    }
    return new Date(`${day}T00:00:00${INDIA_OFFSET}`);
}

/**
 * Whether a page dated `publishOn` is live at `now`: from midnight in India
 * on that day (KTD-2). One rule for every Resources page, entry and legal
 * page, so they all appear at the same moment, without a deploy.
 */
export function isPublished(publishOn: IsoDay, now: Date): boolean {
    return now.getTime() >= dayStartsAt(publishOn).getTime();
}

/** What decides whether a page is shown, read once per render. */
export interface PublishContext {
    now: Date;
    /** A preview deployment asked to show unpublished pages. Never production. */
    preview: boolean;
    /**
     * The build's page routes (`/changelog/[slug]`), or null when unknown
     * (a unit test that does not care): then every route counts as built.
     */
    routes: readonly string[] | null;
}

/** Whether `path` is answered by one of the build's routes, dynamic segments included. */
export function routeExists(
    path: string,
    routes: readonly string[] | null,
): boolean {
    if (routes === null) return true;
    const parts = path.split("/").filter(Boolean);
    return routes.some((route) => {
        const pattern = route.split("/").filter(Boolean);
        if (pattern.length !== parts.length) return false;
        return pattern.every(
            (seg, i) => /^\[[^.\]]+\]$/.test(seg) || seg === parts[i],
        );
    });
}

/** Whether a dated page is live: published (or previewed) at `ctx.now`. */
export function isLive(
    page: { publishOn: IsoDay },
    ctx: PublishContext,
): boolean {
    return ctx.preview || isPublished(page.publishOn, ctx.now);
}

/** Whether a page may be linked: live, and its route is in this build. */
export function isShown(
    page: { publishOn: IsoDay; href: string },
    ctx: PublishContext,
): boolean {
    return isLive(page, ctx) && routeExists(page.href, ctx.routes);
}

/** The Resources pages the nav and footer list now. */
export function shownResources(ctx: PublishContext): ResourcePage[] {
    return RESOURCE_PAGES.filter((p) => isShown(p, ctx));
}

/** The legal pages the footer links now. */
export function shownLegal(ctx: PublishContext): ResourcePage[] {
    return LEGAL_PAGES.filter((p) => isShown(p, ctx));
}

/** Every Resources and legal address the sitemap lists now, children included. */
export function resourcePaths(ctx: PublishContext): string[] {
    const paths: string[] = [];
    for (const page of [...RESOURCE_PAGES, ...LEGAL_PAGES]) {
        if (!isShown(page, ctx)) continue;
        paths.push(page.href);
        for (const child of page.children ?? []) {
            if (routeExists(child, ctx.routes)) paths.push(child);
        }
    }
    return paths;
}

/**
 * Whether a link to `href` on a page may be drawn: an address inside a
 * Resources or legal page only once that page is shown (and its own route
 * exists); any other address always. The launch entry's "See Razorpay" uses
 * it, so it never points at a page that isn't there yet.
 */
export function linkShown(href: string, ctx: PublishContext): boolean {
    const path = href.split(/[?#]/)[0] ?? href;
    const page = [...RESOURCE_PAGES, ...LEGAL_PAGES].find(
        (p) => path === p.href || path.startsWith(`${p.href}/`),
    );
    if (!page) return true;
    return isShown(page, ctx) && routeExists(path, ctx.routes);
}

/** The Resources page a path is in, for the breadcrumbs and the nav's underline. */
export function resourceOf(pathname: string): ResourcePage | undefined {
    return RESOURCE_PAGES.find(
        (p) => pathname === p.href || pathname.startsWith(`${p.href}/`),
    );
}
