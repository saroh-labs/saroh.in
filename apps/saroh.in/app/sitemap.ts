import type { MetadataRoute } from "next";

import { LAUNCH_MODE } from "@/lib/links";
import { SITE_URL } from "@/lib/seo";
import { indexedPaths } from "@/lib/site-pages";

/**
 * Every page worth indexing (plan U26, `lib/site-pages.ts`).
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return indexedPaths(LAUNCH_MODE).map((path) => ({
        url: `${SITE_URL}${path}`,
        changeFrequency: path === "/" ? "weekly" : "monthly",
        priority: path === "/" ? 1 : 0.7,
    }));
}
