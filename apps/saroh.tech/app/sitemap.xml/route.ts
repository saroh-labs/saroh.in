import { sitemapIndexXml, xmlResponse } from "@saroh/marketing/sitemap-xml";

import { sitemapGroups } from "@/lib/sitemaps";
import { site } from "@/site.config";

/** `/sitemap.xml`: the index of one sitemap per group (`lib/sitemaps.ts`), static at build. */
export const dynamic = "force-static";

export function GET(): Response {
    return xmlResponse(sitemapIndexXml(site.url, sitemapGroups()));
}
