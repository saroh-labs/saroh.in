import {
    builtSitemapGroups,
    sitemapIndexXml,
    xmlResponse,
} from "@/lib/sitemaps";

/**
 * `/sitemap.xml`: the index of one sitemap per group (`lib/sitemaps.ts`).
 * Static: built with the site. A page dated for a day joins it with the
 * first deploy made on or after that day; nothing rebuilds the site on a
 * schedule (`app/layout.tsx`).
 */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
    return xmlResponse(sitemapIndexXml(await builtSitemapGroups()));
}
