import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";
import { CRAWL_DISALLOWED } from "@/lib/site-pages";

/**
 * Crawl everything public but the staff-only and API routes (plan U26). No
 * `Host:` line: it is not part of the standard, and the one host is already
 * said by the redirect to www and every page's canonical.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: "*", allow: "/", disallow: CRAWL_DISALLOWED },
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
