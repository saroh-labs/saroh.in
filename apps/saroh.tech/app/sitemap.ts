import type { MetadataRoute } from "next";

import { canonicalOf } from "@/lib/seo";
import { indexedPages, indiaPair } from "@/lib/site-map";

export const dynamic = "force-static";

/** Built pages only, with the date the words really changed, never the deploy's. */
export default function sitemap(): MetadataRoute.Sitemap {
    return indexedPages().map((page) => {
        const india = indiaPair(page.path);
        return {
            url: canonicalOf(page.path),
            ...(page.updated && { lastModified: page.updated }),
            ...(india && {
                alternates: {
                    languages: {
                        en: canonicalOf(page.path),
                        "en-IN": india,
                        "x-default": canonicalOf(page.path),
                    },
                },
            }),
        };
    });
}
