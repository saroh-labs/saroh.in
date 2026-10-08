// @covers site:/sitemap.xml site:/robots.txt
import { expect, test } from "@playwright/test";

import { urls } from "../playwright.config";

/**
 * A merchant site's crawl files (#890). Read-only: Northwind's live site as
 * the seed publishes it, and its test host, which needs no release to
 * answer robots.txt.
 *
 * - sitemap.xml lists the live site's own addresses on the host it was
 *   asked on, home first, and never a private page;
 * - robots.txt keeps crawlers out of the private pages and names the
 *   sitemap;
 * - a test release's host is closed to crawlers and has no sitemap.
 */
const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;
const TEST = `${renderer.protocol}//test--northwind.${renderer.host}`;

test("a live site's sitemap.xml lists its pages on its own address", async ({
    request,
}) => {
    const res = await request.get(`${LIVE}/sitemap.xml`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain(`<loc>${LIVE}/</loc>`);
    expect(xml).not.toContain(`${LIVE}/account`);
    expect(xml).not.toContain(`${LIVE}/checkout`);
});

test("a live site's robots.txt keeps private pages out and names the sitemap", async ({
    request,
}) => {
    const res = await request.get(`${LIVE}/robots.txt`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("Disallow: /account\n");
    expect(text).toContain("Disallow: /checkout\n");
    expect(text).toContain(`Sitemap: ${LIVE}/sitemap.xml`);
});

test("a test release's host is closed to crawlers and has no sitemap", async ({
    request,
}) => {
    const robots = await request.get(`${TEST}/robots.txt`, { maxRedirects: 0 });
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");

    const sitemap = await request.get(`${TEST}/sitemap.xml`, {
        maxRedirects: 0,
    });
    expect(sitemap.status()).toBe(404);
});
