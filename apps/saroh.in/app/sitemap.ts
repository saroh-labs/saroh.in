import type { MetadataRoute } from "next";

import { LAUNCH_MODE } from "@/lib/links";
import { resourcesContext } from "@/lib/resources-context";
import { SITE_URL } from "@/lib/seo";
import { indexedPaths } from "@/lib/site-pages";

/**
 * Re-read every five minutes, so a page dated today joins the sitemap on its
 * day with no deploy (plan KTD-2).
 */
export const revalidate = 300;

/**
 * Every page worth indexing (plan U26, `lib/site-pages.ts`), with the
 * Resources pages that are published and built (plan U1).
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return indexedPaths(LAUNCH_MODE, resourcesContext()).map((path) => ({
        url: `${SITE_URL}${path}`,
        changeFrequency: path === "/" ? "weekly" : "monthly",
        priority: path === "/" ? 1 : 0.7,
    }));
}
