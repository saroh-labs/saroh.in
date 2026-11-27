// @covers app:/commerce/customers app:/open api:organizations api:customer-workspace
import { expect, test } from "@playwright/test";

import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The menu grouped by the merchant's question (DEC-262), and Customers for a
 * business that takes money without Sell (DEC-264): Prana Yoga, the
 * showcase's yoga studio, runs bookings, memberships and packs and has Sell
 * off. Only read: nothing here is saved.
 */
test("a studio with Sell off has Customers under People, and its list opens", async ({
    page,
}) => {
    await useSession(page);
    const orgs = (await (
        await page.request.get(`${urls.API_URL}/organizations`)
    ).json()) as { id: string; name: string }[];
    const prana = orgs.find((o) => o.name === "Prana Yoga");
    expect(prana, "the demo owner is on Prana Yoga").toBeDefined();
    await page.goto(`/open/${prana?.id}`);
    await page.goto("/");

    const customers = 'a[href="/commerce/customers"]';
    if (onPhone(page)) {
        const bar = page.getByRole("navigation", { name: "Main" });
        await expect(bar.getByRole("link").first()).toBeVisible();
        if ((await bar.locator(customers).count()) === 0) {
            const sheet = page.getByRole("dialog", { name: "Everything else" });
            await expect(async () => {
                await bar.getByRole("button", { name: /^More/ }).click();
                await expect(sheet).toBeVisible({ timeout: 2_000 });
            }).toPass({ timeout: 20_000 });
            await expect(
                sheet
                    .getByRole("group", { name: "People", exact: true })
                    .locator(customers),
            ).toBeVisible();
            await sheet.getByRole("button", { name: "Close" }).click();
        }
    } else {
        const rail = page.getByRole("navigation", { name: "Primary" });
        await expect(rail.locator(customers)).toBeVisible();
        await expect(rail.getByText("People", { exact: true })).toBeAttached();
        // Sell is off: none of its rows.
        await expect(rail.locator('a[href="/commerce/orders"]')).toHaveCount(0);
    }

    await page.goto("/commerce/customers");
    await expect(
        page.getByRole("heading", { level: 1, name: "Customers" }),
    ).toBeVisible();
    await expect(page.getByText(/turned off/i)).toHaveCount(0);
});
