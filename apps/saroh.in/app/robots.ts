import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";
import { CRAWL_DISALLOWED } from "@/lib/site-pages";

/** Crawl everything public but the staff-only and API routes (plan U26). */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: "*", allow: "/", disallow: CRAWL_DISALLOWED },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
