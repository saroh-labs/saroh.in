// @covers site:/shop api:products api:orders api:payments api:site-accounts api:sites pkg:site-blocks
import { expect, test } from "@playwright/test";

import { urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

/**
 * The bag and checkout on a merchant's site (round-2 G13), against the
 * running stack, on Northwind Supply.
 *
 * The shop sits behind the `SITE_SHOP` rollout flag (off by default), so
 * this runs only where the stack was prepared for it and says so with
 * `E2E_SITE_SHOP=1`: Northwind's `SITE_SHOP` override on (admin → Flags),
 * its site selling from a storefront with a product in stock, and a
 * Razorpay test connection with its public key id.
 *
 * It goes from the shop to the pay sheet: add to bag, the bag priced by
 * the server, sign in at the last step, and the checkout started with an
 * order number and the provider's window asked for. Paying itself (the
 * provider's window, then its success webhook holding the stock and making
 * the order show in Orders) needs a Razorpay test-mode payment; the API's
 * `public-checkout.db.spec.ts` covers it against the fake provider. It
 * leaves one unpaid checkout on Northwind, which closes itself after a day.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const SHOP_READY = process.env.E2E_SITE_SHOP === "1";

test.describe("site shop: bag and checkout", () => {
    test.skip(
        !SHOP_READY,
        "Needs Northwind's shop switched on (E2E_SITE_SHOP=1)",
    );
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("add to bag, sign in at the last step, and start paying", async ({
        page,
    }) => {
        await page.goto(`${SITE}/shop`);
        await page.locator('a[href^="/shop/"]').first().click();
        await page.getByRole("button", { name: "Add to bag" }).click();
        await expect(page.getByRole("status")).toContainText(
            "added to your bag",
        );

        await page.getByRole("button", { name: /^Your bag, / }).click();
        const sheet = page.getByRole("dialog");
        await expect(
            sheet.getByRole("heading", { name: "Your bag" }),
        ).toBeVisible();
        const pickUp = sheet.getByRole("radio", { name: /Pick-up/ });
        if (await pickUp.isVisible()) await pickUp.click();

        // The provider's window isn't opened in this run.
        await page.route("https://checkout.razorpay.com/**", (route) =>
            route.abort(),
        );
        await sheet.getByRole("button", { name: /^Continue · / }).click();
        await signInOnSheet(page, `shop-${Date.now()}@example.in`);

        const pay = page.getByRole("dialog");
        await expect(
            pay.getByRole("heading", { name: "Pay for your order" }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(pay).toContainText(/Order ORD-\d+/);
        // The window couldn't open here: the sheet offers another go.
        await expect(pay.getByRole("button", { name: /^Pay · / })).toBeVisible({
            timeout: 15_000,
        });
    });
});
