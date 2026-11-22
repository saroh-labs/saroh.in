// @covers app:/sites/[siteId]
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The price sheet (plan 2026-11-20-002 U48, `fix/WXKPrice`, O1 yes on
 * 20 Nov 2026): a service's price opened from the inspector is changed in
 * Services from here, at once, and never waits for Publish.
 *
 * `@serial`: it changes a seeded service's price for a moment and puts it
 * back, through the sheet both times. The inspector's From Services list
 * (U47) opens it from `data-price-of="<serviceId>"`; with the Website area
 * off, the test skips.
 */
test.describe("the price sheet at 1920", { tag: "@serial" }, () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test("saves the price to Services and puts it back", async ({ page }) => {
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
        // The first section that shows services: its price opens the sheet.
        const opener = page.locator("[data-price-of]").first();
        const rows = page.locator("[data-pages-tree] [data-section-row]");
        for (let i = 0; i < (await rows.count()); i++) {
            await rows.nth(i).click();
            if (await opener.count()) break;
        }
        test.skip(
            (await opener.count()) === 0,
            "No section on this page shows services (U47's From Services list)",
        );

        const setPrice = async (value: string | null) => {
            await opener.click();
            const sheet = page.getByRole("dialog", { name: / price$/ });
            await expect(sheet).toContainText("A service in Services");
            await expect(sheet).toContainText(
                "Changes it in Services and everywhere it shows",
            );
            await expect(sheet).toContainText(
                "Bookings already made keep the price they were made at.",
            );
            const field = sheet.getByLabel("Price");
            const was = await field.inputValue();
            await field.fill(value ?? was);
            await sheet.getByRole("button", { name: "Save price" }).click();
            await expect(sheet).toHaveCount(0, { timeout: 30_000 });
            return was;
        };

        // A sample amount, then the one it had, both through the sheet.
        const was = await setPrice("4321");
        await expect(opener).toContainText(/4,321/, { timeout: 30_000 });
        await setPrice(was);
    });
});
