import type { MetadataRoute } from "next";

/** Everything is public; the sitemap lists the pages worth indexing. */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: "*", allow: "/" },
        sitemap: "https://www.saroh.in/sitemap.xml",
        host: "https://www.saroh.in",
    };
}
