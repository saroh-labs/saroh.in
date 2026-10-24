import { ABOUT, UPDATED as ABOUT_UPDATED } from "@/content/about";
import {
    CHANGELOG_ENTRIES,
    UPDATED as CHANGELOG_UPDATED,
    changelogHref,
    liveEntries,
} from "@/content/changelog";
import {
    CONTACT_PAGE,
    UPDATED as CONTACT_UPDATED,
} from "@/content/contact-page";
import { UPDATED as CUSTOMERS_UPDATED } from "@/content/customers";
import { featureHref, UPDATED as FEATURES_UPDATED } from "@/content/features";
import {
    HELP_PATH,
    UPDATED as HELP_UPDATED,
    helpHref,
    liveArticles,
    summarise,
} from "@/content/help";
import { UPDATED as HOME_UPDATED } from "@/content/home";
import {
    INTEGRATION_SLUGS,
    integrationHref,
    INTEGRATIONS_PATH,
    UPDATED as INTEGRATIONS_UPDATED,
} from "@/content/integrations";
import { UPDATED as LINK_PREVIEW_UPDATED } from "@/content/link-preview";
import { UPDATED as QR_CODE_MAKER_UPDATED } from "@/content/qr-code-maker";
import type { PublishContext } from "@/content/resources";
import { LEGAL_PAGES, resourcePaths, routeExists } from "@/content/resources";
import {
    solutionHref,
    UPDATED as SOLUTIONS_UPDATED,
} from "@/content/solutions";
import {
    galleryTemplates,
    templateHref,
    TEMPLATES_PATH,
    UPDATED as TEMPLATES_UPDATED,
} from "@/content/templates";
import { FEATURE_SLUGS, SOLUTION_SLUGS } from "@/content/types";
import { UPDATED as WAITLIST_UPDATED } from "@/content/waitlist";
import { helpArticles } from "@/lib/help-docs";
import { integrationMeta } from "@/lib/integration-docs";
import type { LaunchMode } from "@/lib/links";

/**
 * The site's indexable pages, one list for the sitemap and the redirect test
 * (plan U26): Home, Pricing, the eight features, the three solutions, the
 * waitlist while it is the site's ask (`launchMode=waitlist`, KTD-16),
 * About and Contact (DEC-137), and /customers, for customers of a business
 * on Saroh (Terms rev 46).
 * `/pricing` only once the launch switch is open: before that it redirects
 * to the waitlist (`redirects.js`), and a sitemap never lists a redirect.
 *
 * Given a publish context (plan U1), the Resources and legal pages that are
 * published and built, the changelog's live entries, Help's live
 * articles and the gallery's templates, follow. Without
 * one, only the fixed pages: what a redirect may always land on.
 */
export function indexedPaths(mode: LaunchMode, ctx?: PublishContext): string[] {
    const resources = ctx ? resourcePaths(ctx) : [];
    const entries =
        ctx && resources.includes("/changelog")
            ? liveEntries(ctx)
                  .map((e) => changelogHref(e.slug))
                  .filter((path) => routeExists(path, ctx.routes))
            : [];
    const help =
        ctx && resources.includes("/help")
            ? liveArticles(helpArticles().map(summarise), ctx)
                  .map((a) => helpHref(a.slug))
                  .filter((path) => routeExists(path, ctx.routes))
            : [];
    const templates =
        ctx && resources.includes("/templates")
            ? galleryTemplates()
                  .map((t) => templateHref(t.slug))
                  .filter((path) => routeExists(path, ctx.routes))
            : [];
    return [
        "/",
        ...(mode === "open" ? ["/pricing"] : []),
        ...FEATURE_SLUGS.map(featureHref),
        ...SOLUTION_SLUGS.map(solutionHref),
        ...(mode === "waitlist" ? ["/waitlist"] : []),
        // Who makes Saroh and how to write to it (DEC-137): pages in
        // either launch mode, with no publish date.
        ABOUT.href,
        CONTACT_PAGE.href,
        // For customers of a business on Saroh (Terms rev 46): every
        // merchant site's footer links here, whatever the launch mode.
        "/customers",
        ...resources,
        ...entries,
        ...help,
        ...templates,
    ];
}

/** The start of a day in India, as a sitemap writes a date. */
const dayInIndia = (day: string) => `${day}T00:00:00+05:30`;

/** The day in India a moment falls on (YYYY-MM-DD). */
const indiaDayOf = (iso: string) =>
    new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Each page's content module's `UPDATED`: the day its words last changed. */
const PAGE_DAYS: Readonly<Record<string, string>> = {
    "/": HOME_UPDATED,
    ...Object.fromEntries(
        FEATURE_SLUGS.map((s) => [featureHref(s), FEATURES_UPDATED]),
    ),
    ...Object.fromEntries(
        SOLUTION_SLUGS.map((s) => [solutionHref(s), SOLUTIONS_UPDATED]),
    ),
    "/waitlist": WAITLIST_UPDATED,
    [ABOUT.href]: ABOUT_UPDATED,
    [CONTACT_PAGE.href]: CONTACT_UPDATED,
    "/customers": CUSTOMERS_UPDATED,
    [HELP_PATH]: HELP_UPDATED,
    [INTEGRATIONS_PATH]: INTEGRATIONS_UPDATED,
    "/changelog": CHANGELOG_UPDATED,
    [TEMPLATES_PATH]: TEMPLATES_UPDATED,
    "/tools/link-preview": LINK_PREVIEW_UPDATED,
    "/tools/qr-code-maker": QR_CODE_MAKER_UPDATED,
};

/**
 * The day a page's words last changed, for the sitemap's `lastmod` (R3),
 * always a date its content holds: a legal page's `publishOn` (its "Last
 * updated"), a Help article's or a provider page's `updated`, a changelog
 * entry's `publishOn`, and for every other page its content module's
 * `UPDATED`. /pricing is the live catalogue version's go-live day
 * (`pricingLiveAt`, from `GET /public/pricing`), and has none when no
 * catalogue is live. Never the build's day: a made-up date teaches a search
 * engine to ignore the real ones.
 */
export function lastModified(
    path: string,
    pricingLiveAt: string | null = null,
): string | undefined {
    if (path === "/pricing") {
        return pricingLiveAt
            ? dayInIndia(indiaDayOf(pricingLiveAt))
            : undefined;
    }
    const legal = LEGAL_PAGES.find((p) => p.href === path);
    if (legal) return dayInIndia(legal.publishOn);
    const entry = CHANGELOG_ENTRIES.find((e) => changelogHref(e.slug) === path);
    if (entry) return dayInIndia(entry.publishOn);
    const article = helpArticles().find((a) => helpHref(a.slug) === path);
    if (article) return dayInIndia(article.updated);
    const provider = INTEGRATION_SLUGS.find((s) => integrationHref(s) === path);
    if (provider) return dayInIndia(integrationMeta(provider).updated);
    if (path.startsWith(`${TEMPLATES_PATH}/`)) {
        return dayInIndia(TEMPLATES_UPDATED);
    }
    const day = PAGE_DAYS[path];
    return day ? dayInIndia(day) : undefined;
}

/** Every page the site serves, whatever the mode: a redirect may land on any. */
export const SERVED_PATHS: readonly string[] = indexedPaths("waitlist");

/**
 * What robots.txt keeps crawlers out of: the pricing draft and the link that
 * opens it (staff-only; noindex by header and meta too) and the site's own
 * API routes.
 *
 * Not the sign-up hand-off (`/welcome`): it says `noindex` itself, and a
 * crawler that is kept out never reads that, so the address could still be
 * listed bare from a link to it. Left open, the page is read and dropped.
 */
export const CRAWL_DISALLOWED = ["/api/", "/pricing/draft", "/pricing/preview"];
