// @covers app:/sites/[siteId]/pages
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Share this page (plan 2026-11-18-001 U12, WXSShare), behind
 * `NEXT_PUBLIC_WEBSITE_AREA`. Opens from Home's row on Pages (Home is live
 * on Northwind's published site), reads the page link and the messages
 * written from the page's own words, and checks no email row is drawn.
 * Never publishes, never makes a QR code (Download QR would): read-only.
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

test.describe("Share this page", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    });

    test("opens from a page's row with its link and messages, and no email row", async ({
        page,
    }) => {
        const siteId = await northwindSite(page.request);
        await page.goto(`/sites/${siteId}/pages`);
        test.skip(
            (await page.getByPlaceholder("Find a page").count()) === 0,
            "NEXT_PUBLIC_WEBSITE_AREA is off: today's Pages list",
        );
        // Home is first, and live on Northwind's published site.
        await page
            .getByRole("button", { name: /^More for / })
            .first()
            .click();
        await page.getByRole("menuitem", { name: "Share this page" }).click();

        const sheet = page.getByRole("dialog", { name: "Share this page" });
        await expect(sheet).toBeVisible();
        await expect(sheet.locator("[data-share-link]")).toHaveText(
            /northwind\./,
        );
        const whatsapp = sheet.getByLabel("WhatsApp message");
        await expect(whatsapp).toHaveValue(/See it here: .*northwind\./);
        await expect(sheet.getByLabel("Instagram caption")).toHaveValue(
            /Link in bio: /,
        );
        await expect(
            sheet.getByRole("link", { name: "Open WhatsApp" }),
        ).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
        await expect(
            sheet.getByRole("button", { name: "Download QR" }),
        ).toBeVisible();
        await expect(sheet.getByText(/subscribers/i)).toHaveCount(0);

        // The merchant's own words go into the WhatsApp link.
        await whatsapp.fill("Come see us");
        await expect(
            sheet.getByRole("link", { name: "Open WhatsApp" }),
        ).toHaveAttribute("href", /text=Come%20see%20us/);

        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(sheet).toBeHidden();
    });
});
