// @covers app:/sites/[siteId] api:staff api:product-reviews
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Round 3 (EBTeamPicker, EBReviewPicker), behind the api's `WEBSITE_AREA`:
 * Add › A review asks Products, Write one or Google (coming); Add a page ›
 * Our team asks an owner who appears before the page is made.
 *
 * Read-only: every picker is opened and cancelled, so Northwind's draft,
 * pages and team are left as they were.
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

test.describe("Round 3 pickers at 1440", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test.beforeEach(({ page: _page }, testInfo) => {
        test.skip(
            testInfo.project.name.startsWith("phone"),
            "A desk board; the phone sheets share the same pickers.",
        );
    });

    test("A review: Products, Write one, Google coming; Cancel adds nothing", async ({
        page,
    }) => {
        test.skip(
            !(await openEditor(page)),
            "The Website area is off: today's chrome",
        );
        await page
            .locator("[data-editor-trail]")
            .getByRole("button", { name: /^Add/ })
            .click();
        const panel = page.locator("[data-add-panel=desk]");
        await expect(panel).toBeVisible();
        await panel.getByRole("button", { name: /A review/ }).click();
        const picker = page.locator("[data-review-picker]");
        await expect(picker).toContainText("Add a review");
        await picker.getByRole("radio", { name: "Write one" }).click();
        await expect(picker).toContainText("What they said");
        await picker.getByRole("radio", { name: /Google/ }).click();
        await expect(
            picker.getByRole("button", { name: "Connect Google · coming" }),
        ).toBeDisabled();
        await picker.getByRole("button", { name: "Cancel" }).click();
        await expect(picker).toHaveCount(0);
    });

    test("Our team: an owner picks who appears before the page is made", async ({
        page,
    }) => {
        test.skip(
            !(await openEditor(page)),
            "The Website area is off: today's chrome",
        );
        await page
            .locator("[data-editor-trail]")
            .getByRole("button", { name: /^Add/ })
            .click();
        const panel = page.locator("[data-add-panel=desk]");
        await panel.getByRole("button", { name: "Blank page" }).click();
        const sheet = page.getByRole("dialog", { name: "Add a page" });
        await sheet.getByRole("radio", { name: /^A template page/ }).click();
        // Choosing the tile opens the picker at once (ER3Team T4).
        await sheet.getByText("Our team", { exact: true }).click();
        const picker = page.getByRole("dialog", {
            name: "Add people to Our team",
        });
        await expect(picker.getByPlaceholder("Search your team")).toBeVisible();
        await expect(picker).toContainText(/On the page|Not on the page/);
        await picker.getByRole("button", { name: "Cancel" }).click();
        await expect(picker).toHaveCount(0);
        // Back on Add a page, nothing made.
        await expect(sheet).toBeVisible();
        await expect(sheet).toContainText("Your team: you choose who appears");
        await sheet.getByRole("button", { name: "Cancel" }).click();
    });
});
