// @covers app:/sites/[siteId]
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Find (⌘K, plan 2026-11-20-002 U46c, `fix/WXECommand`) and the photo sheet
 * (U46d, `fix/WXKMedia`) at 1440. Both only read here: Find opens and
 * closes, the photo sheet opens on the top photo and is cancelled, so the
 * spec writes nothing to the shared site. Skips with the Website area off.
 */
test.describe("Find and the photo sheet at 1440", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test.beforeEach(async ({ page }) => {
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
        test.skip(
            (await page.locator("[data-pages-tree]").count()) === 0,
            "The Website area is off: the old editor has neither",
        );
    });

    test("⌘K finds the address in Do it here and the page's sections, Esc closes", async ({
        page,
    }) => {
        await page.keyboard.press("ControlOrMeta+k");
        const find = page.getByRole("dialog", { name: "Find or do anything" });
        await expect(find).toBeVisible();
        await find.getByRole("combobox").fill("address");
        await expect(find).toContainText("Do it here");
        await expect(find).toContainText(
            "Change the address, phone or social links",
        );
        await expect(find).toContainText(
            "Nothing here takes you out of the editor",
        );
        await page.keyboard.press("Escape");
        await expect(find).toHaveCount(0);
    });

    test("the top photo opens its sheet, with the library and Use this photo", async ({
        page,
    }) => {
        await page.locator('[data-section-row="0"]').click();
        const opener = page.getByRole("button", {
            name: /^(Replace, focus and describe|Choose from your photos)…$/,
        });
        test.skip(
            (await opener.count()) === 0,
            "The first section has no photo field",
        );
        await opener.first().click();
        const sheet = page.getByRole("dialog", { name: /^Replace the/ });
        await expect(sheet).toBeVisible();
        await expect(
            sheet.getByRole("button", { name: "Upload" }),
        ).toBeVisible();
        await expect(
            sheet.getByRole("button", { name: "Use this photo" }),
        ).toBeVisible();
        await sheet.getByRole("button", { name: "Cancel" }).click();
        await expect(sheet).toHaveCount(0);
    });
});
