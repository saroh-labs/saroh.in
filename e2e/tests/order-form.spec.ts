import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
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

/**
 * The API's refusal of a line ("… — Only 1 left at …") is about the lines as
 * they were sent (e80f2211): changing a quantity, adding a line, removing
 * one or picking another product clears it until the next save. Each of the
 * four is wired by hand, so each is checked.
 *
 * Runs on Northwind Supply (writes and error paths go there, never on the
 * film sets). It uses a product of its own counted at 1 and never places an
 * order. Counted, the product has a stock history (DEC-032), so afterwards
 * it is set to Not sold under one fixed name, and the next run brings that
 * same one back (`fixtures/throwaway-products.ts`).
 */
const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };

test.describe("a line the API refused", () => {
    test("its error clears when the lines change: quantity, add, remove, product", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Last Jar ${testInfo.project.name}`;
        await signIn(page);
        await page.goto(`/open/${NW.organizationId}`);

        try {
            const id = await takeProduct(page.request, NW, name, {
                price: "100.00",
                status: "PUBLISHED",
            });
            const counted = await page.request.put(
                `${urls.API_URL}/stores/${NW.storeId}/products/${id}/inventory`,
                {
                    headers: { "x-organization-id": NW.organizationId },
                    data: { quantity: 1 },
                },
            );
            expect(counted.ok()).toBe(true);

            await page.goto(`/commerce/orders/new?storefront=${NW.storeId}`);
            await page.getByLabel("Customer").click();
            await page.getByRole("option").first().click();

            const product = page.getByRole("combobox", { name: "Product" });
            const quantity = page.getByLabel("Quantity");
            const refused = page.getByRole("alert").filter({
                hasText: `${name} — Only 1 left at`,
            });
            const create = page.getByRole("button", { name: "Create order" });

            await product.first().click();
            await page
                .getByRole("option", { name: new RegExp(`^${name} —`) })
                .click();
            const refuse = async () => {
                await quantity.first().fill("2");
                await create.click();
                await expect(refused).toBeVisible();
            };

            // 1. The quantity changes.
            await refuse();
            await quantity.first().fill("1");
            await expect(refused).toHaveCount(0);

            // 2. A line is added.
            await refuse();
            await page.getByRole("button", { name: "Add item" }).click();
            await expect(refused).toHaveCount(0);

            // 3. A line is removed (the one just added).
            await refuse();
            await page.getByRole("button", { name: "✕" }).nth(1).click();
            await expect(refused).toHaveCount(0);

            // 4. Another product is picked.
            await refuse();
            await product.first().click();
            await page
                .getByRole("option", { name: new RegExp(`^(?!${name}).+ — `) })
                .first()
                .click();
            await expect(refused).toHaveCount(0);
        } finally {
            await removeProducts(page.request, NW, name);
        }
    });
});
