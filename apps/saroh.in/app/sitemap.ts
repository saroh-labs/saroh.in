import type { MetadataRoute } from "next";

import { LAUNCH_MODE } from "@/lib/links";
import { resourcesContext } from "@/lib/resources-context";
import { SITE_URL } from "@/lib/seo";
import { indexedPaths, lastModified } from "@/lib/site-pages";

// Static: built with the site. A page dated for a day (`publishOn`) joins the
// sitemap with the first deploy made on or after that day; nothing rebuilds
// the site on a schedule (`app/layout.tsx`).

/**
 * Every page worth indexing (plan U26, `lib/site-pages.ts`), with the
 * Resources pages that are published and built (plan U1). The pricing
 * draft and its preview link are never listed: they are noindex, and
 * robots.txt keeps crawlers out of them.
 *
 * A page says when it last changed only where its content holds a date
 * (`lastModified`). No `changefreq` or `priority`: search engines ignore
 * both, and a guess in them is noise.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return indexedPaths(LAUNCH_MODE, resourcesContext()).map((path) => {
        const changed = lastModified(path);
        return {
            url: `${SITE_URL}${path}`,
            ...(changed && { lastModified: changed }),
        };
    });
}
