// @covers app:/sites/[siteId]
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The price sheet (plan 2026-11-20-002 U48, `fix/WXKPrice`) while O1 waits
 * for the owner: a service's price opened from the inspector shows the
 * price, where it shows, and Edit in Services. Nothing is written.
 *
 * The inspector's From Services list (U47) opens it from a control marked
 * `data-price-of="<serviceId>"`; until that lands, or with the Website
 * area off, the test skips.
 */
test.describe("the price sheet at 1920", () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test("shows the price and the way to Services", async ({ page }) => {
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
        const opener = page.locator("[data-price-of]").first();
        test.skip(
            (await opener.count()) === 0,
            "No price to open on this page yet (U47's From Services list)",
        );
        const serviceId = await opener.getAttribute("data-price-of");
        await opener.click();
        const sheet = page.getByRole("dialog", { name: / price$/ });
        await expect(sheet).toContainText("A service in Services");
        await expect(sheet).toContainText("from Services");
        await expect(
            sheet.getByRole("link", { name: "Edit in Services" }),
        ).toHaveAttribute("href", `/services/${serviceId ?? ""}`);
        // O1 is off: no price is written from the editor.
        await expect(
            sheet.getByRole("button", { name: "Save price" }),
        ).toHaveCount(0);
        await sheet.getByRole("button", { name: "Close" }).click();
        await expect(sheet).toHaveCount(0);
    });
});
