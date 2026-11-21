// @covers app:/sites/[siteId]/pages
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Website › Pages and the page settings sheet (plan 2026-11-18-001 U5),
 * behind the api's `WEBSITE_AREA`. Each test makes its own hidden page
 * on Northwind (a link no other test uses), changes it through the sheet
 * and the row menu, and deletes what it made. Never publishes.
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

/** A hidden page of this test's own, and every page it leaves at `base…`. */
async function ownPage(request: APIRequestContext, siteId: string) {
    const base = `/e2e-pages-${Date.now().toString(36)}`;
    const made = await northwind(request).post<{ id: string }>(
        `/sites/${siteId}/pages`,
        { title: "E2E pages area", path: base, inMenu: false },
    );
    await northwind(request).patch(`/sites/${siteId}/pages/${made.id}`, {
        hidden: true,
    });
    const cleanUp = async () => {
        const api = northwind(request);
        const site = await api.get<{ pages: { id: string; path: string }[] }>(
            `/sites/${siteId}`,
        );
        for (const p of site.pages.filter((p) => p.path.startsWith(base))) {
            await api.delete(`/sites/${siteId}/pages/${p.id}`);
        }
    };
    return { id: made.id, base, cleanUp };
}

test.describe("Pages", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    });

    test("changes a page's link and Google text in its sheet, with the link change undoable", async ({
        page,
    }) => {
        const siteId = await northwindSite(page.request);
        const own = await ownPage(page.request, siteId);
        try {
            // Overview's fix links land here, with the sheet open.
            await page.goto(`/sites/${siteId}/pages?page=${own.id}`);
            const search = page.getByPlaceholder("Find a page");
            test.skip(
                (await search.count()) === 0,
                "The Website area is off: today's Pages list",
            );
            const sheet = page.getByRole("dialog", { name: "Page settings" });
            await expect(sheet).toBeVisible();
            // A fresh sheet has saved nothing, so it says nothing about it.
            await expect(
                sheet.getByText("Saved · goes live when you publish"),
            ).toHaveCount(0);
            expect(await noSideScroll(page)).toBe(true);

            const link = sheet.getByLabel("Page link");
            await link.fill(`${own.base}-moved`);
            await expect(
                sheet.getByText("The new link goes live when you publish."),
            ).toBeVisible();
            await sheet.getByRole("button", { name: "Undo" }).click();
            await expect(link).toHaveValue(own.base);

            await link.fill(`${own.base}-moved`);
            await sheet
                .getByLabel("Text on Google")
                .fill("A page made by a browser test.");
            await expect(sheet.getByText("30 of 160")).toBeVisible();
            await sheet.getByRole("button", { name: "Save" }).click();
            await expect(sheet).toBeHidden();

            const row = page.locator(`[data-page-row="${own.base}-moved"]`);
            await expect(row).toContainText("Hidden");
            // The page never says the developer words.
            await expect(page.getByText(/redirect|slug/i)).toHaveCount(0);
        } finally {
            await own.cleanUp();
        }
    });

    test("duplicates a page as a hidden copy out of the menu", async ({
        page,
    }) => {
        const siteId = await northwindSite(page.request);
        const own = await ownPage(page.request, siteId);
        try {
            await page.goto(`/sites/${siteId}/pages`);
            const search = page.getByPlaceholder("Find a page");
            test.skip((await search.count()) === 0, "The Website area is off");
            await search.fill(own.base);
            const row = page.locator(`[data-page-row="${own.base}"]`);
            await row
                .getByRole("button", { name: "More for E2E pages area" })
                .click();
            await page.getByRole("menuitem", { name: "Duplicate" }).click();
            // The copy opens in its sheet.
            const sheet = page.getByRole("dialog", { name: "Page settings" });
            await expect(sheet).toBeVisible();
            await expect(sheet.getByLabel("Page link")).toHaveValue(
                `${own.base}-copy`,
            );
            await sheet.getByRole("button", { name: "Cancel" }).click();
            const copy = page.locator(`[data-page-row="${own.base}-copy"]`);
            await expect(copy).toContainText("Hidden");
        } finally {
            await own.cleanUp();
        }
    });

    test("filters to the pages that need fixing", async ({ page }) => {
        const siteId = await northwindSite(page.request);
        await page.goto(`/sites/${siteId}/pages`);
        test.skip(
            (await page.getByPlaceholder("Find a page").count()) === 0,
            "The Website area is off",
        );
        const fix = page.getByRole("button", { name: /Needs fixing/ });
        await fix.click();
        await expect(fix).toHaveAttribute("aria-pressed", "true");
        // The toggle is in the address, so Overview's fix links land on it.
        await expect(page).toHaveURL(/[?&]view=fix/);
        // Each row left says what it needs, or the list says all is well.
        await expect(
            page
                .getByText(/No text for Google|No share image|Broken link/)
                .or(page.getByText(/pages look good/))
                .first(),
        ).toBeVisible();
    });
});
