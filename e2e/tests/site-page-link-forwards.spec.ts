// @covers site:/[slug] site:/[slug]/[postSlug] site:/[...missing] site:/sitemap.xml api:sites
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * An old page link forwards for good (KTD-3), and a page draws its own head
 * (KTD-7).
 *
 * The owner gives a published page a new link, its own Google title and
 * "Show on Google" off, and publishes. A visitor on the old link, with the
 * query it was shared with, lands on the new one (a 308), whose `<title>`
 * is the page's own and which asks not to be indexed and is left out of the
 * sitemap.
 *
 * Driven through the API: the Pages sheet that changes a link is U5; this
 * pins what the renderer does with what publish wrote.
 *
 * `@serial`: Northwind has one site (ADR-006), and this publishes it. The
 * page is deleted and the site published again in `finally`, so the seed's
 * site is what it was.
 */
const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;

test.describe("an old page link (KTD-3)", { tag: "@serial" }, () => {
    test("forwards to the page's new link, which draws its own head", async ({
        page,
    }) => {
        await useSession(page);
        const nw = northwind(page.request);
        const sites =
            await nw.get<{ id: string; subdomain: string | null }[]>("/sites");
        const siteId = sites.find((s) => s.subdomain === "northwind")?.id;
        expect(siteId, "Northwind has its site at northwind").toBeTruthy();

        const run = Date.now().toString(36);
        const oldPath = `/e2e-old-${run}`;
        const newPath = `/e2e-new-${run}`;
        const made = await nw.post<{ id: string }>(`/sites/${siteId}/pages`, {
            title: "Bridal",
            path: oldPath,
        });
        try {
            await nw.post(`/sites/${siteId}/publish`);
            await nw.patch(`/sites/${siteId}/pages/${made.id}`, {
                path: newPath,
                seoTitle: "Bridal makeup in Pune",
                noindex: true,
            });
            await nw.post(`/sites/${siteId}/publish`);

            // The forward itself: permanent, on this site, query kept.
            const res = await page.request.get(`${LIVE}${oldPath}?ref=ig`, {
                maxRedirects: 0,
            });
            expect(res.status()).toBe(308);
            expect(res.headers().location).toMatch(
                new RegExp(`^(${LIVE})?${newPath}\\?ref=ig$`),
            );

            // A visitor lands on the new link, with the page's own head.
            await page.goto(`${LIVE}${oldPath}?ref=ig`);
            await expect(page).toHaveURL(`${LIVE}${newPath}?ref=ig`);
            await expect(page).toHaveTitle("Bridal makeup in Pune");
            await expect(
                page.locator('head meta[name="robots"]'),
            ).toHaveAttribute("content", /noindex/);

            const sitemap = await page.request.get(`${LIVE}/sitemap.xml`);
            expect(await sitemap.text()).not.toContain(newPath);
        } finally {
            await nw.delete(`/sites/${siteId}/pages/${made.id}`);
            await nw.post(`/sites/${siteId}/publish`);
        }
    });
});
