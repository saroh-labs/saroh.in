// @covers app:/sites/[siteId]/overview
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The Publish sheet outside the editor (plan 2026-11-18-001 U11,
 * WXMPublish), behind the api's `WEBSITE_AREA`: the site header's status
 * chip opens it with the checks on top and the changes by person, each
 * with Leave out; leaving one out says "Publish N of M changes now", and
 * Include puts it back. Never presses Publish: what goes live on
 * Northwind's site stays as the other specs expect it.
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

test.describe("Publish sheet", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    });

    test("opens from the status chip with the checks, and Leave out changes the count", async ({
        page,
    }) => {
        const siteId = await northwindSite(page.request);
        await page.goto(`/sites/${siteId}/overview`);
        const chip = page.locator("[data-status-chip]");
        test.skip(
            (await chip.count()) === 0,
            "The Website area is off: today's header",
        );
        await chip.click();

        const sheet = page.locator("[data-publish-sheet]");
        await expect(sheet).toBeVisible();
        await expect(
            sheet.getByRole("region", { name: "Checked before you publish" }),
        ).toBeVisible();
        await expect(
            sheet.getByRole("link", { name: "See versions" }),
        ).toBeVisible();

        const units = sheet.locator("[data-unit]");
        if ((await units.count()) > 0) {
            const publish = sheet.locator("[data-publish-now]");
            const before = await publish.textContent();
            const first = units.first();
            await first.getByRole("button", { name: /^Leave out: / }).click();
            await expect(first).toHaveAttribute("data-left-out", "");
            await expect(publish).not.toHaveText(before ?? "");
            await expect(publish).toHaveText(
                /^Publish \d+ of \d+ changes? now$/,
            );
            await first.getByRole("button", { name: /^Include: / }).click();
            await expect(publish).toHaveText(before ?? "");
        }

        await sheet.getByRole("button", { name: "Not now" }).click();
        await expect(sheet).toBeHidden();
    });
});
