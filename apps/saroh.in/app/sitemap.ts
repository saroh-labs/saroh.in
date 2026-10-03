import type { MetadataRoute } from "next";

import { LAUNCH_MODE } from "@/lib/links";
import { SITE_URL } from "@/lib/seo";
import { indexedPaths } from "@/lib/site-pages";

/**
 * Every page worth indexing (plan U26, `lib/site-pages.ts`). The pricing
 * draft and its preview link are never listed: they are noindex, and
 * robots.txt keeps crawlers out of them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return indexedPaths(LAUNCH_MODE).map((path) => ({
        url: `${SITE_URL}${path}`,
        changeFrequency:
            path === "/" || path === "/pricing" ? "weekly" : "monthly",
        priority: path === "/" ? 1 : path === "/pricing" ? 0.9 : 0.7,
    }));
}
