// @covers app:/sites app:/sites/[siteId]/overview app:/sites/[siteId]/writing app:/sites/[siteId]/posts app:/sites/[siteId]/pages app:/sites/[siteId]/review
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { onPhone } from "../fixtures/reviewer-editor";
import { useSession } from "../fixtures/sessions";
import { websiteAreaOn } from "../fixtures/website-area";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The Website area's shell (plan 2026-11-18-001 U3), behind
 * the api's `WEBSITE_AREA` (on in CI and `pnpm prepush --e2e`): All sites
 * at `/sites` with one card (DEC-230: one web address per business), a
 * site's Overview with the header and the four groups (the desk's list; the
 * phone's site home), and old addresses that still land.
 *
 * Read-only: it opens Northwind's screens and saves nothing.
 */
async function northwindSite(request: APIRequestContext): Promise<string> {
    const sites =
        await northwind(request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    return site?.id ?? "";
}

const noSideScroll = (page: Page) =>
    page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
    );

test.describe("the Website area's shell", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    });

    test("All sites lists the site, and its card opens the Overview", async ({
        page,
    }) => {
        await page.goto("/sites");
        test.skip(
            !page.url().endsWith("/sites"),
            "The Website area is off: /sites still forwards",
        );
        await expect(
            page.getByRole("heading", { name: "Sites", level: 1 }),
        ).toBeVisible();
        const cards = page.getByRole("list", { name: "Your sites" });
        await expect(cards.getByRole("listitem")).toHaveCount(1);
        expect(await noSideScroll(page)).toBe(true);

        await cards.getByRole("link").first().click();
        await expect(page).toHaveURL(/\/sites\/[^/]+\/overview$/);
        await expect(
            page.getByRole("link", { name: /Open editor/ }),
        ).toBeVisible();
        if (onPhone(page)) {
            // The site home lists the groups.
            const home = page.getByRole("list", { name: "This site" });
            for (const g of [
                "Pages and posts",
                "Reach",
                "People and settings",
            ]) {
                await expect(
                    home.getByRole("link", { name: new RegExp(g) }),
                ).toBeVisible();
            }
        } else {
            const list = page.getByRole("navigation", { name: "Website" });
            await expect(
                list.getByRole("link", { name: "Overview" }),
            ).toHaveAttribute("aria-current", "page");
            for (const g of [
                "Pages and posts",
                "Look",
                "Reach",
                "People and settings",
            ]) {
                await expect(
                    list.getByRole("button", { name: g }),
                ).toBeVisible();
            }
        }
        expect(await noSideScroll(page)).toBe(true);
    });

    test("Pages and Writing sit in their group; old addresses still land", async ({
        page,
    }) => {
        const siteId = await northwindSite(page.request);
        await page.goto(`/sites/${siteId}/posts`);
        test.skip(
            !(await websiteAreaOn(page)),
            "The Website area is off: Posts is still a tab",
        );
        // A streamed redirect (a loading boundary above): it can land after load.
        await page.waitForURL((u) => u.href.includes("/writing"));
        await expect(
            page.getByRole("heading", {
                name: "Blog and other writing",
                level: 1,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "New post" }).first(),
        ).toBeVisible();

        // The Categories sheet's old page forwards with the sheet asked for.
        await page.goto(`/sites/${siteId}/posts/categories`);
        await expect(page).toHaveURL(/\/writing\?categories=1$/);

        await page.goto(`/sites/${siteId}/pages`);
        await expect(
            page.getByRole("heading", { name: "Pages", level: 1 }),
        ).toBeVisible();
        if (onPhone(page)) {
            await expect(
                page.getByRole("link", { name: "Site home" }),
            ).toBeVisible();
        } else {
            await expect(
                page
                    .getByRole("navigation", { name: "Website" })
                    .getByRole("link", { name: "Pages", exact: true }),
            ).toHaveAttribute("aria-current", "page");
        }
        expect(await noSideScroll(page)).toBe(true);

        // Review still opens the editor, the page travelling with it.
        await page.goto(`/sites/${siteId}/review?page=nope`);
        await expect(page).toHaveURL(
            new RegExp(`/sites/${siteId}\\?page=nope$`),
        );
    });
});
