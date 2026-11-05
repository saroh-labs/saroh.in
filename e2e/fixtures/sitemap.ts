import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

const locs = (xml: string) =>
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

/**
 * Every page saroh.in's sitemap lists: `/sitemap.xml` is an index of one
 * sitemap per group (plan 2026-10-31-002, U5), each read in turn. Each
 * file must answer 200 as XML, with no guessed changefreq or priority.
 */
export async function sitemapPages(
    request: APIRequestContext,
    web: string,
): Promise<string[]> {
    const index = await request.get(`${web}/sitemap.xml`);
    expect(index.status()).toBe(200);
    const indexXml = await index.text();
    expect(indexXml).toContain("<sitemapindex");
    const pages: string[] = [];
    for (const child of locs(indexXml)) {
        const res = await request.get(`${web}${new URL(child).pathname}`);
        expect(res.status(), child).toBe(200);
        const xml = await res.text();
        expect(xml, child).not.toMatch(/<changefreq>|<priority>/);
        pages.push(...locs(xml).map((u) => new URL(u).pathname));
    }
    return pages;
}
