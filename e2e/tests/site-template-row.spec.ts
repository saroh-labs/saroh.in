// @covers app:/sites/[siteId] api:sites pkg:templates pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { openFromPill } from "../fixtures/phone-editor";
import { openReviewedSite } from "../fixtures/reviewer-editor";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The editor's Template row (DEC-216, board D6) in the Brand tab.
 *
 * The Northwind owner sees the template the site started from and See
 * templates, which opens the same preview as Turn on Website: the page
 * drawn as Northwind's site, "What goes in" beside it, and a confirm that
 * names the pages it would replace before anything changes. Back leaves
 * the draft as it was: this spec writes nothing, so it is not @serial.
 *
 * A Reviewer reads the row (DEC-200): the template, or that the site
 * records none, and nothing to change.
 */

interface SiteRow {
    id: string;
}

/** Website › Brand: the rail's tab on a desk, its pill on a phone. */
async function openBrand(page: Page, phone: boolean) {
    if (phone) {
        await openFromPill(page, "Brand");
        return;
    }
    const brand = page.getByRole("tab", { name: "Brand" });
    await expect(brand).toBeVisible({ timeout: 30_000 });
    if ((await brand.getAttribute("aria-selected")) !== "true") {
        await brand.click();
    }
}

test.describe("the editor's Template row (DEC-216)", () => {
    test("previews another template as Northwind's site and asks before replacing pages", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const phone = testInfo.project.name.startsWith("phone");
        await useSession(page, "owner");
        const site = (
            await northwind(page.request).get<SiteRow[]>("/sites")
        ).at(0);
        if (!site) throw new Error("Northwind has no website");
        await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
        await page.goto(`${urls.APP_URL}/sites/${site.id}`);
        await openBrand(page, phone);

        const row = page
            .locator("[data-template-row]")
            .filter({ visible: true });
        await expect(row).toContainText("Template");
        await row.getByRole("button", { name: "See templates" }).click();

        const preview = page.getByRole("dialog", { name: /^Your site in / });
        await expect(preview).toBeVisible();
        await expect(preview).toContainText("What goes in");
        // Drawn with Northwind's own name, not a sample business's.
        const drawn = (
            phone ? preview.frameLocator("iframe[data-device-frame]") : preview
        ).locator("[data-template-preview]");
        await expect(drawn).toContainText("Northwind", { timeout: 15_000 });

        // Choosing asks first, naming what it replaces; Back changes nothing.
        const confirm = preview.locator("[data-template-confirm]");
        await expect(confirm).toContainText("is replaced with");
        await expect(confirm).toContainText("Previous versions");
        await expect(
            confirm.getByRole("checkbox", { name: "Fill in my details" }),
        ).toBeChecked();
        await confirm.getByRole("button", { name: "Back" }).click();
        await expect(preview).toHaveCount(0);
    });

    test("a Reviewer reads the template, with nothing to change", async ({
        page,
    }, testInfo) => {
        const phone = testInfo.project.name.startsWith("phone");
        await useSession(page, "reviewer");
        await openReviewedSite(page);
        await openBrand(page, phone);
        const brand = page.getByRole("region", { name: "Template" });
        // Northwind's seeded site records no template (KTD-7).
        await expect(brand.filter({ visible: true }).first()).toContainText(
            "Your own pages",
        );
        await expect(
            page.getByRole("button", { name: "See templates" }),
        ).toHaveCount(0);
    });
});
