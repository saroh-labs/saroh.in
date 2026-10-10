// @covers app:/sites/[siteId]/settings site:/ site:/favicon.ico site:/site-icon.svg api:sites api:media pkg:site-blocks
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A site's icon, from the settings to the tab (DEC-124).
 *
 * The owner uploads an icon in Website › Settings › Search and sharing,
 * inside the row's sheet, and publishes. A visitor's page then names that
 * image as its icon, and `/favicon.ico` on the site's address forwards to
 * it. The owner removes it and publishes again: the page falls back to the
 * business logo if Northwind has one, else to the site's own plain tile
 * with its initial. Never a fixed file of Saroh's.
 *
 * `@serial`: Northwind has one site (ADR-006), and this saves to it and
 * publishes it twice. It is put back in `finally` (no icon of its own,
 * published), which is how the seed leaves it.
 *
 * The upload: this stack's storage is the in-memory adapter, whose upload
 * address (`memory.object-storage.test`) resolves nowhere, so the browser's
 * PUT is answered here. The library's two API calls around it are real, and
 * the image's address is the one the API gives. On a stack with real
 * storage the PUT simply goes there and this stub is never met. The icon's
 * bytes are never fetched: the assertions are on what the page declares.
 */
const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;
const UPLOAD_HOST = /^https:\/\/memory\.object-storage\.test\//;
const ROW = "#settings-site-icon";

/** A 1 × 1 PNG: enough to be an image the browser can measure. */
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
);

interface SiteIcon {
    own: { url: string; mediaId: string | null } | null;
    businessLogoUrl: string | null;
}

async function northwindSite(request: APIRequestContext): Promise<string> {
    const sites =
        await northwind(request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    return site?.id ?? "";
}

const readIcon = async (request: APIRequestContext, siteId: string) =>
    (await northwind(request).get<{ icon: SiteIcon }>(`/sites/${siteId}`)).icon;

/** The icon a visitor's page declares: `<link rel="icon">`'s address. */
const declaredIcon = (site: Page) =>
    site.locator('head link[rel="icon"]').first().getAttribute("href");

/** `/favicon.ico` on the site's address, without following a forward. */
async function favicon(visitor: BrowserContext) {
    const res = await visitor.request.get(`${LIVE}/favicon.ico`, {
        maxRedirects: 0,
    });
    const headers = res.headers();
    const header = (name: string) => (name in headers ? headers[name] : null);
    return {
        status: res.status(),
        location: header("location"),
        type: header("content-type") ?? "",
        body: res.status() === 200 ? await res.text() : "",
    };
}

test.describe("a site's icon (DEC-124)", { tag: "@serial" }, () => {
    test("uploaded in settings, live after publish, and back to the fallback when removed", async ({
        page,
        browser,
    }) => {
        test.setTimeout(120_000);
        await useSession(page);
        const siteId = await northwindSite(page.request);
        const nw = northwind(page.request);
        // From a known start: no icon of its own, and that is what is live.
        await nw.delete(`/sites/${siteId}/icon`);
        await nw.post(`/sites/${siteId}/publish`);
        const { businessLogoUrl } = await readIcon(page.request, siteId);

        // The in-memory storage's upload address goes nowhere: answer it.
        await page.route(UPLOAD_HOST, (route) =>
            route.fulfill({
                status: 200,
                headers: { "access-control-allow-origin": "*" },
                body: "",
            }),
        );

        const visitor = await browser.newContext({ ignoreHTTPSErrors: true });
        const site = await visitor.newPage();
        try {
            await page.goto(`/open/${NORTHWIND_ORG}`);
            await page.goto(
                `/sites/${siteId}/settings?section=search-and-sharing`,
            );
            const row = page.locator(ROW);
            await expect(row).toContainText("Site icon");
            await expect(row).toContainText(
                businessLogoUrl
                    ? "Using your business logo"
                    : "A plain icon with your initial",
            );

            // Add: everything happens in the row's sheet.
            await row.getByRole("button", { name: "Add site icon" }).click();
            const sheet = page.getByRole("dialog", { name: "Site icon" });
            await expect(sheet).toBeVisible();
            await sheet.locator('input[type="file"]').setInputFiles({
                name: "icon.png",
                mimeType: "image/png",
                buffer: PNG,
            });
            // Uploaded: the sheet says it is the site's own now, and draws
            // it at a tab's size from its address. Still on this page.
            await expect(sheet).toContainText("Your own icon");
            await expect(
                sheet.locator('[data-icon-preview="tab"] img'),
            ).toHaveAttribute("src", /^https?:\/\//);
            await expect(page).toHaveURL(/\/settings/);
            await sheet.getByRole("button", { name: "Save" }).click();
            await expect(sheet).toBeHidden();
            await expect(row).toContainText("Your own icon");
            await expect(
                row.getByRole("button", { name: "Change site icon" }),
            ).toBeVisible();

            const saved = await readIcon(page.request, siteId);
            const iconUrl = saved.own?.url ?? "";
            expect(iconUrl, "the icon is a library image").toMatch(
                /^https?:\/\//,
            );

            // Saved is not live: the visitor still gets the fallback.
            await site.goto(`${LIVE}/`);
            await expect.poll(() => declaredIcon(site)).not.toBe(iconUrl);

            // Published: the page names it, for the tab and the phone, and
            // /favicon.ico forwards to it.
            await nw.post(`/sites/${siteId}/publish`);
            await site.goto(`${LIVE}/`);
            await expect.poll(() => declaredIcon(site)).toBe(iconUrl);
            await expect(
                site.locator('head link[rel="apple-touch-icon"]').first(),
            ).toHaveAttribute("href", iconUrl);
            await expect
                .poll(async () => (await favicon(visitor)).location)
                .toBe(iconUrl);
            expect((await favicon(visitor)).status).toBe(302);

            // Remove it, in the same sheet, and publish.
            await page.reload();
            await row.getByRole("button", { name: "Change site icon" }).click();
            await expect(sheet).toBeVisible();
            await sheet
                .getByRole("button", {
                    name: businessLogoUrl
                        ? "Use your business logo"
                        : "Use the plain icon",
                })
                .click();
            await sheet.getByRole("button", { name: "Save" }).click();
            await expect(sheet).toBeHidden();
            await expect(row).toContainText(
                businessLogoUrl
                    ? "Using your business logo"
                    : "A plain icon with your initial",
            );
            await nw.post(`/sites/${siteId}/publish`);

            // The fallback: the business logo, or the site's own tile.
            await site.goto(`${LIVE}/`);
            if (businessLogoUrl) {
                await expect
                    .poll(() => declaredIcon(site))
                    .toBe(businessLogoUrl);
                await expect
                    .poll(async () => (await favicon(visitor)).location)
                    .toBe(businessLogoUrl);
            } else {
                await expect
                    .poll(() => declaredIcon(site))
                    .toBe("/site-icon.svg");
                const tile = await visitor.request.get(`${LIVE}/site-icon.svg`);
                expect(tile.status()).toBe(200);
                expect(tile.headers()["content-type"]).toContain(
                    "image/svg+xml",
                );
                const svg = await tile.text();
                // Northwind's initial, and nothing of Saroh's.
                expect(svg).toContain(">N</text>");
                expect(svg).not.toMatch(/saroh/i);
                const blind = await favicon(visitor);
                expect(blind.status).toBe(200);
                expect(blind.type).toContain("image/svg+xml");
                expect(blind.body).toBe(svg);
            }
        } finally {
            await visitor.close();
            // As the seed leaves it: no icon of its own, and published so.
            await nw.delete(`/sites/${siteId}/icon`);
            await nw.post(`/sites/${siteId}/publish`);
        }
    });
});
