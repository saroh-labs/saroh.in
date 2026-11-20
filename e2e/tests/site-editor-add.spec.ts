// @covers app:/sites/[siteId]
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Rail › Add (plan 2026-11-20-002 U46e, `fix/WXBAdd`, `fix/WXBAddPage`),
 * behind `NEXT_PUBLIC_WEBSITE_AREA`: pages first, then a section below the
 * selected one, today's library under Browse all, A service asking which
 * services, and Add a page as its own sheet.
 *
 * Read-only: every sheet and step is opened and put back. Nothing is
 * added, so Northwind's draft is left as it was.
 */
async function openEditor(page: Page): Promise<boolean> {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    const sites = await northwind(page.request).get<
        { id: string; subdomain: string | null }[]
    >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    await page.goto(`/sites/${site?.id ?? ""}`);
    await expect(page.locator("[data-layout]")).toBeVisible({
        timeout: 30_000,
    });
    return (await page.locator("[data-editor-trail]").count()) > 0;
}

test.describe("Rail › Add at 1920", () => {
    test.use({ viewport: { width: 1920, height: 1080 } });
    test.beforeEach(({ page: _page }, testInfo) => {
        test.skip(
            testInfo.project.name.startsWith("phone"),
            "A desk board; the phone's Add sheet is U49's to mount.",
        );
    });

    test("pages, sections, the library and Add a page", async ({ page }) => {
        test.skip(
            !(await openEditor(page)),
            "NEXT_PUBLIC_WEBSITE_AREA is off: today's chrome",
        );
        await page
            .locator("[data-editor-trail]")
            .getByRole("button", { name: /^Add/ })
            .click();
        const panel = page.locator("[data-add-panel=desk]");
        await expect(panel).toBeVisible();
        for (const part of ["Add a page", "Add a section"]) {
            await expect(panel).toContainText(part);
        }

        // Browse all is today's library, with previews.
        await panel
            .getByRole("button", { name: /^Browse all \d+ sections/ })
            .click();
        await expect(
            page.getByRole("dialog", { name: "New section" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");

        // A search finds a section by its words.
        await panel
            .getByPlaceholder("Search pages, sections and your business")
            .fill("questions");
        await expect(panel).toContainText(/Questions/);
        await panel
            .getByPlaceholder("Search pages, sections and your business")
            .fill("");

        // Add a page is its own sheet; Cancel adds nothing.
        await panel.getByRole("button", { name: "Blank page" }).click();
        const sheet = page.getByRole("dialog", { name: "Add a page" });
        await expect(sheet).toContainText(
            "Opens here as a draft page. Nothing is live until you publish.",
        );
        await sheet.getByRole("button", { name: "Cancel" }).click();
        await expect(sheet).toHaveCount(0);

        // A service asks which services first; Back puts it away.
        const service = panel.getByRole("button", { name: "Add A service" });
        if ((await service.count()) > 0) {
            await service.click();
            await expect(
                page.getByRole("region", { name: "Add a service" }),
            ).toContainText("Which services · From Services");
            await page.getByRole("button", { name: "Back to Add" }).click();
        }
    });
});
