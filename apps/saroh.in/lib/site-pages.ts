import { ABOUT } from "@/content/about";
import {
    CHANGELOG_ENTRIES,
    changelogHref,
    liveEntries,
} from "@/content/changelog";
import { CONTACT_PAGE } from "@/content/contact-page";
import { featureHref } from "@/content/features";
import { helpHref, liveArticles, summarise } from "@/content/help";
import type { PublishContext } from "@/content/resources";
import { LEGAL_PAGES, resourcePaths, routeExists } from "@/content/resources";
import { solutionHref } from "@/content/solutions";
import { galleryTemplates, templateHref } from "@/content/templates";
import { FEATURE_SLUGS, SOLUTION_SLUGS } from "@/content/types";
import { helpArticles } from "@/lib/help-docs";
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

/**
 * The day a page's words last changed, for the sitemap's `lastmod`, where
 * the content says one: a legal page's `publishOn` (its "Last updated"), a
 * Help article's `updated`, a changelog entry's `publishOn`. Every other
 * page has no date of its own, and the sitemap gives none: a made-up date
 * (the build's, say) teaches a search engine to ignore the real ones.
 */
export function lastModified(path: string): string | undefined {
    const legal = LEGAL_PAGES.find((p) => p.href === path);
    if (legal) return dayInIndia(legal.publishOn);
    const entry = CHANGELOG_ENTRIES.find((e) => changelogHref(e.slug) === path);
    if (entry) return dayInIndia(entry.publishOn);
    const article = helpArticles().find((a) => helpHref(a.slug) === path);
    if (article) return dayInIndia(article.updated);
    return undefined;
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
