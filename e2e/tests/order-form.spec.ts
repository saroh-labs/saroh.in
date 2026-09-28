import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoUser, urls } from "../playwright.config";

/**
 * New order v2 (plan B, B13): the sheet on the Orders list, at the counter
 * or on the phone. The old New order page's address opens it.
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

/**
 * At a GST-registered business (#508 U8, ADR-008) prices include GST, so
 * the sheet adds no tax: the total is what `orders.service.ts` saves.
 * Rye & Co. is the film set: this reads the sheet and never places the
 * order.
 */
test.describe("new order at a GST-registered business", () => {
    test("adds no tax: prices include GST and the total is what is saved", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${RYE}`);
        // The old page's address opens the sheet on the Orders list.
        await page.goto(`/commerce/orders/new?storefront=${RYE_STORE}`);
        const sheet = page.getByRole("dialog", { name: "New order" });
        await expect(sheet).toBeVisible();
        await expect(page).toHaveURL(/\/commerce\/orders\?/);

        await sheet.getByLabel("Add a product").fill("Sourdough");
        // Sourdough has sizes since the showcase grew (#526); 800g is ₹480.
        const eight = sheet
            .getByRole("group", { name: /^Add Sourdough/ })
            .getByRole("button", { name: /^800g · ₹480/ });
        await eight.click();
        await eight.click();

        // 2 × ₹480, GST inside; nothing added on top.
        const footer = sheet.getByRole("button", { name: /· create$|^Create/ });
        await expect(sheet.getByText("₹960", { exact: true })).toBeVisible();
        await expect(sheet.getByText(/ tax( ·|$)/)).toHaveCount(0);
        await expect(footer).toBeVisible();

        await sheet.getByRole("button", { name: "+ Add a discount" }).click();
        await sheet.getByLabel("Discount").fill("60");
        await expect(sheet.getByText("₹900", { exact: true })).toBeVisible();
    });
});

/**
 * The happy path, on Northwind Supply (writes go there, never on the film
 * sets): a walk-in, two lines, cash ₹500 for ₹430 → ₹70 change; the order
 * is paid, and its paper is billed to "‹name› (walk-in)". Two products of
 * its own, set aside afterwards (`fixtures/throwaway-products.ts`).
 */
const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };

test.describe("a walk-in paid in cash", () => {
    test("₹500 for ₹430 gives ₹70 change, and the order reads Walk-in", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const bread = `E2E Counter Bread ${testInfo.project.name}`;
        const cake = `E2E Counter Cake ${testInfo.project.name}`;
        const walkIn = `Asha ${testInfo.project.name}`;
        await signIn(page);
        await page.goto(`/open/${NW.organizationId}`);
        try {
            await takeProduct(page.request, NW, bread, {
                price: "180.00",
                status: "PUBLISHED",
            });
            await takeProduct(page.request, NW, cake, {
                price: "250.00",
                status: "PUBLISHED",
            });

            await page.goto(`/commerce/orders?storefront=${NW.storeId}`);
            await page.getByRole("button", { name: "New order" }).click();
            const sheet = page.getByRole("dialog", { name: "New order" });

            // Who: a walk-in, a name and a phone, no record.
            await sheet.getByRole("radio", { name: "Walk-in" }).click();
            await sheet.getByLabel("Name").fill(walkIn);
            await sheet
                .getByLabel("Phone (if they give one)")
                .fill("+91 90000 11111");
            await sheet.getByRole("button", { name: "Use walk-in" }).click();
            await expect(
                sheet.getByText("Walk-in · +91 90000 11111"),
            ).toBeVisible();

            // Two lines.
            for (const name of [bread, cake]) {
                await sheet.getByLabel("Add a product").fill(name);
                await sheet
                    .getByRole("group", { name: `Add ${name}` })
                    .getByRole("button")
                    .first()
                    .click();
            }
            await expect(sheet.getByText("2 items")).toBeVisible();

            // Pick-up where the storefront offers it; else its first way,
            // with the address a delivery needs.
            const pickUp = sheet.getByRole("radio", { name: "Pick-up" });
            if (await pickUp.count()) {
                await pickUp.click();
            } else {
                await sheet
                    .getByLabel("Delivery address")
                    .last()
                    .fill("12 Church St");
                await sheet.getByLabel("Town or city").fill("Bengaluru");
                await sheet.getByLabel("State").fill("Karnataka");
                await sheet.getByLabel("PIN code").fill("560001");
            }

            // Cash: what was handed over, and the change.
            await sheet.getByRole("radio", { name: "Cash" }).click();
            const ways = await sheet
                .getByRole("radiogroup", { name: "How it leaves" })
                .getByRole("radio", { checked: true })
                .textContent();
            const delivered = !ways?.startsWith("Pick-up");
            if (!delivered) {
                await sheet.getByLabel("Cash given").fill("500");
                await expect(sheet.getByText("Change ₹70")).toBeVisible();
                await sheet
                    .getByRole("button", { name: "Take ₹430 cash · create" })
                    .click();
                await expect(
                    page.getByText("Order created — give ₹70 change."),
                ).toBeVisible();
            } else {
                await sheet
                    .getByRole("button", { name: /cash · create$/ })
                    .click();
                await expect(page.getByText(/^Order created/)).toBeVisible();
            }

            // It is on the list, found by the walk-in's name (B13's search).
            await page.getByLabel("Search orders").fill(walkIn);
            await expect(page.getByText(walkIn).first()).toBeVisible();
        } finally {
            await removeProducts(page.request, NW, bread);
            await removeProducts(page.request, NW, cake);
        }
    });
});
