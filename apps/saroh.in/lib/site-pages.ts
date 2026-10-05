import { changelogHref, liveEntries } from "@/content/changelog";
import { featureHref } from "@/content/features";
import type { PublishContext } from "@/content/resources";
import { resourcePaths, routeExists } from "@/content/resources";
import { solutionHref } from "@/content/solutions";
import { FEATURE_SLUGS, SOLUTION_SLUGS } from "@/content/types";
import type { LaunchMode } from "@/lib/links";

/**
 * The site's indexable pages, one list for the sitemap and the redirect test
 * (plan U26): Home, the eight features, the three solutions, and the
 * waitlist while it is the site's ask (`launchMode=waitlist`, KTD-16).
 * No `/pricing`: Pricing isn't published yet (it redirects to the waitlist,
 * `redirects.js`).
 *
 * Given a publish context (plan U1), the Resources and legal pages that are
 * published and built, and the changelog's live entries, follow. Without
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
    return [
        "/",
        ...FEATURE_SLUGS.map(featureHref),
        ...SOLUTION_SLUGS.map(solutionHref),
        ...(mode === "waitlist" ? ["/waitlist"] : []),
        ...resources,
        ...entries,
    ];
}

/** Every page the site serves, whatever the mode: a redirect may land on any. */
export const SERVED_PATHS: readonly string[] = indexedPaths("waitlist");

/** What robots.txt keeps crawlers out of: the site's own API routes. */
export const CRAWL_DISALLOWED = ["/api/"];
