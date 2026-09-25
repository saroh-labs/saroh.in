import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * New order, by hand, at a GST-registered business (#508 U8, ADR-008): its
 * prices include GST, so the form offers no add-on tax and its total is
 * subtotal + shipping − discount — the sum `orders.service.ts` saves (pinned
 * there by `orders.service.discount.spec.ts`).
 *
 * Rye & Co. is the only registered seed business and is the film set, so
 * this reads the form and never places the order.
 */

const RYE = "seed_sc_rc_org";
const RYE_STORE = "seed_sc_rc_store";

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

test.describe("new order at a GST-registered business", () => {
    test("adds no tax: prices include GST and the total is what is saved", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${RYE}`);
        await page.goto(`/commerce/orders/new?storefront=${RYE_STORE}`);
        await expect(
            page.getByRole("heading", { name: "New order" }),
        ).toBeVisible();

        await page.getByRole("combobox", { name: "Product" }).click();
        await page.getByRole("option", { name: /^Sourdough loaf —/ }).click();
        await page.getByLabel("Quantity").fill("2");

        await expect(page.getByLabel(/^Tax/)).toHaveCount(0);
        await expect(page.getByText("prices include GST")).toBeVisible();
        await expect(page.getByText("Includes GST")).toBeVisible();
        // 2 × ₹480, GST inside; nothing added on top. Exact: the summary's
        // "Subtotal ₹960 · …" line also contains "total ₹960".
        await expect(
            page.getByText("Total ₹960", { exact: true }),
        ).toBeVisible();

        await page.getByLabel("Discount", { exact: true }).fill("60");
        await expect(
            page.getByText("Total ₹900", { exact: true }),
        ).toBeVisible();
    });
});
