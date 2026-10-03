import { featureHref } from "@/content/features";
import { solutionHref } from "@/content/solutions";
import { FEATURE_SLUGS, SOLUTION_SLUGS } from "@/content/types";
import type { LaunchMode } from "@/lib/links";

/**
 * The site's indexable pages, one list for the sitemap and the redirect test
 * (plan U26): Home, Pricing, the eight features, the three solutions, and the
 * waitlist while it is the site's ask (`launchMode=waitlist`, KTD-16).
 */
export function indexedPaths(mode: LaunchMode): string[] {
    return [
        "/",
        "/pricing",
        ...FEATURE_SLUGS.map(featureHref),
        ...SOLUTION_SLUGS.map(solutionHref),
        ...(mode === "waitlist" ? ["/waitlist"] : []),
    ];
}

/** Every page the site serves, whatever the mode: a redirect may land on any. */
export const SERVED_PATHS: readonly string[] = indexedPaths("waitlist");

/**
 * What robots.txt keeps crawlers out of: the pricing draft and the link that
 * opens it (staff-only; noindex by header and meta too), and the site's own
 * API routes.
 */
export const CRAWL_DISALLOWED = ["/api/", "/pricing/draft", "/pricing/preview"];
