import type { MetadataRoute } from "next";

import { LAUNCH_MODE } from "@/lib/links";
import { resourcesContext } from "@/lib/resources-context";
import { SITE_URL } from "@/lib/seo";
import { indexedPaths } from "@/lib/site-pages";

// Static: a page dated today joins the sitemap through the nightly rebuild
// at 00:00 IST (plan KTD-2).

/**
 * Every page worth indexing (plan U26, `lib/site-pages.ts`), with the
 * Resources pages that are published and built (plan U1). The pricing
 * draft and its preview link are never listed: they are noindex, and
 * robots.txt keeps crawlers out of them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return indexedPaths(LAUNCH_MODE, resourcesContext()).map((path) => ({
        url: `${SITE_URL}${path}`,
        changeFrequency:
            path === "/" || path === "/pricing" ? "weekly" : "monthly",
        priority: path === "/" ? 1 : path === "/pricing" ? 0.9 : 0.7,
    }));
}
