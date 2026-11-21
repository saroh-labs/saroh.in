// @covers app:/sites/[siteId]/reach/links
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Reach › Links and sharing (plan 2026-11-18-001 U6), behind
 * `NEXT_PUBLIC_WEBSITE_AREA`: the page links Northwind shares and the old
 * links that forward to them. Adds one old link of its own (a name no other
 * test uses), sees it wait for Publish, and removes it. Never publishes.
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

test.describe("Links and sharing", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    });

    test("adds an old link that waits for Publish, and removes it", async ({
        page,
    }) => {
        const siteId = await northwindSite(page.request);
        await page.goto(`/sites/${siteId}/reach/links`);
        test.skip(
            !page.url().includes("/reach/links"),
            "NEXT_PUBLIC_WEBSITE_AREA is off: sharing is still in Settings",
        );
        await expect(
            page.getByRole("heading", { name: "Links and sharing", level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Page links you share" }),
        ).toBeVisible();
        expect(await noSideScroll(page)).toBe(true);

        const old = `/e2e-old-link-${Date.now().toString(36)}`;
        // Leave nothing behind, whatever happens below.
        try {
            await page.getByRole("button", { name: "Add an old link" }).click();
            const sheet = page.getByRole("dialog", { name: "Add an old link" });
            await sheet.getByLabel("Old link").fill(old);
            await sheet.getByRole("button", { name: "Add old link" }).click();
            await expect(sheet).toBeHidden();

            const row = page.getByRole("listitem").filter({ hasText: old });
            await expect(row).toContainText("Added by hand");
            await expect(row).toContainText("goes live when you publish");
            // The page never says the developer words.
            await expect(page.getByText(/redirect|slug/i)).toHaveCount(0);

            await row.getByRole("button", { name: `Remove ${old}` }).click();
            await page
                .getByRole("alertdialog")
                .getByRole("button", { name: "Remove old link" })
                .click();
            await expect(row).toHaveCount(0);
        } finally {
            const api = northwind(page.request);
            const left = await api.get<{ id: string; fromPath: string }[]>(
                `/sites/${siteId}/redirects`,
            );
            for (const r of left.filter((r) => r.fromPath === old)) {
                await api.delete(`/sites/${siteId}/redirects/${r.id}`);
            }
        }
    });

    test("refuses an old link a page already uses, in plain words", async ({
        page,
    }) => {
        const siteId = await northwindSite(page.request);
        const site = await northwind(page.request).get<{
            pages: { path: string; isHome: boolean }[];
        }>(`/sites/${siteId}`);
        const taken = site.pages.find((p) => !p.isHome)?.path;
        test.skip(!taken, "Northwind has only its home page");
        await page.goto(`/sites/${siteId}/reach/links`);
        test.skip(
            !page.url().includes("/reach/links"),
            "NEXT_PUBLIC_WEBSITE_AREA is off",
        );
        await page.getByRole("button", { name: "Add an old link" }).click();
        const sheet = page.getByRole("dialog", { name: "Add an old link" });
        await sheet.getByLabel("Old link").fill(taken ?? "");
        await sheet.getByRole("button", { name: "Add old link" }).click();
        await expect(sheet.getByRole("alert")).toBeVisible();
        await expect(sheet).toBeVisible();
    });
});
