import type { MetadataRoute } from "next";

import { site } from "@/site.config";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: "*", allow: "/" },
        // The index of one sitemap per group (`lib/sitemaps.ts`).
        sitemap: `${site.url}/sitemap.xml`,
    };
}
