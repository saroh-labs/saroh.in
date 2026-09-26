import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoUser, urls } from "../playwright.config";

/**
 * The product page's Overview and Stock tab (#522, #523): the header, the
 * tabs (and the old `?tab=variants` address), the availability card, and a
 * count saved from the stock sheet showing up in Recent changes.
 *
 * It runs on Northwind Supply, the base seed (the showcase businesses stay
 * camera-ready). It makes a product of its own, counted at 7, and leaves it
 * counted at 7 again before setting it aside under one fixed name — a
 * count is history, so it can't be deleted (`fixtures/throwaway-products.ts`).
 */

const ORG = "seed_org";
const STORE = "seed_store";
const ONLINE = "seed_store_online";
const NW: Storefront = { organizationId: ORG, storeId: STORE };
const COUNT = 7;

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

const api = (path: string) => `${urls.API_URL}/stores/${STORE}/products${path}`;
const orgHeader = { "x-organization-id": ORG };

/** Tracked, and its shelf counted back to what it was. */
async function putBack(request: APIRequestContext, productId: string) {
    const on = await request.put(api(`/${productId}/stock-tracking`), {
        headers: orgHeader,
        data: { tracked: true },
    });
    expect(on.ok()).toBe(true);
    const counted = await request.put(api(`/${productId}/inventory`), {
        headers: orgHeader,
        data: { quantity: COUNT, lowStockAlert: 2 },
    });
    expect(counted.ok()).toBe(true);
}

test.describe("product page — Overview and Stock", () => {
    test("the header, the tabs and the Overview's cards", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        // Platform Trolley holds stock for open orders in the base seed.
        await page.goto(
            `/commerce/products/seed_product_11?storefront=${STORE}`,
        );

        await expect(
            page.getByRole("heading", { level: 1, name: "Platform Trolley" }),
        ).toBeVisible();
        await expect(page.getByText(/· Changed /)).toBeVisible();
        const tabs = page.getByRole("navigation", { name: "Product sections" });
        for (const name of [
            "Overview",
            "Stock",
            "Photos",
            "Reviews",
            "Orders",
            "Discounts",
            "Collections",
        ]) {
            await expect(
                tabs.getByRole("link", { name: new RegExp(`^${name}`) }),
            ).toBeVisible();
        }
        await expect(page.getByText("Linked to this product")).toBeVisible();
        await expect(
            page.getByText(
                /^Can be sold now$|^Short for orders already placed$/,
            ),
        ).toBeVisible();
        await expect(
            page.getByText("How it's sold", { exact: false }),
        ).toBeVisible();
        await expect(
            page.getByText("On the product page", { exact: false }),
        ).toBeVisible();

        // The cover opens Photos.
        await page
            .getByRole("link", {
                name: /Cover photo — open Photos|Add a photo/,
            })
            .click();
        await expect(page).toHaveURL(/tab=photos/);

        // The Stock tab's old name still opens it.
        await page.goto(
            `/commerce/products/seed_product_11?storefront=${STORE}&tab=variants`,
        );
        await expect(
            page.getByRole("heading", { name: "Sizes and stock" }),
        ).toBeVisible();
        await expect(page.getByText("Recent changes")).toBeVisible();
    });

    test("count from the stock sheet, and see it in Recent changes", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        // One name per project: desk and phone run one after the other.
        const name = `E2E Stock Sheet Crate ${testInfo.project.name}`;

        await signIn(page);
        await page.goto(`/open/${ORG}`);

        let id: string | undefined;
        try {
            id = await takeProduct(page.request, NW, name, {
                price: "120.00",
                status: "PUBLISHED",
            });
            await putBack(page.request, id);

            await page.goto(
                `/commerce/products/${id}?storefront=${STORE}&tab=stock`,
            );
            await page
                .getByRole("button", { name: "Change stock or prices" })
                .click();
            const sheet = page.getByRole("dialog");
            await expect(sheet).toContainText("Edit prices and stock");
            const onHand = sheet.getByLabel(/on hand/).first();
            await expect(onHand).toHaveValue(String(COUNT));
            await onHand.fill("5");
            await sheet.getByRole("button", { name: "Save" }).click();
            await expect(
                page.getByText("Prices and stock saved."),
            ).toBeVisible();

            // The count is on the shelf, and in the log.
            await expect(page.getByText(/Counted/).first()).toBeVisible();
            await expect(page.getByText("7 → 5")).toBeVisible();
        } finally {
            if (id) await putBack(page.request, id);
            await removeProducts(page.request, NW, name);
        }
    });

    test("the Stock tab's badge says the same on every tab", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Low Badge Crate ${testInfo.project.name}`;

        await signIn(page);
        await page.goto(`/open/${ORG}`);

        let id: string | undefined;
        try {
            id = await takeProduct(page.request, NW, name, {
                price: "120.00",
                status: "PUBLISHED",
            });
            await putBack(page.request, id);
            // Fine at the shop (7, warning at 2); sold Online too, where
            // two are left at a warning level of two — low there only.
            const listed = await page.request.put(
                `${urls.API_URL}/organizations/${ORG}/products/${id}/listings/${ONLINE}`,
                { headers: orgHeader, data: {} },
            );
            expect(listed.ok()).toBe(true);
            const low = await page.request.put(
                `${urls.API_URL}/stores/${ONLINE}/products/${id}/inventory`,
                { headers: orgHeader, data: { quantity: 2, lowStockAlert: 2 } },
            );
            expect(low.ok()).toBe(true);

            // Overview and Stock load every storefront's shelves; the other
            // tabs fell back to the shop's own count, and lost the badge.
            for (const tab of ["overview", "stock", "orders", "photos"]) {
                await page.goto(
                    `/commerce/products/${id}?storefront=${STORE}&tab=${tab}`,
                );
                await expect(
                    page
                        .getByRole("navigation", { name: "Product sections" })
                        .getByRole("link", { name: /^Stock/ }),
                ).toContainText("1 low");
            }
        } finally {
            if (id) {
                // Online stops selling it (its shelf stays, as a shelf does).
                await page.request.delete(
                    `${urls.API_URL}/organizations/${ORG}/products/${id}/listings/${ONLINE}`,
                    { headers: orgHeader },
                );
                await putBack(page.request, id);
            }
            await removeProducts(page.request, NW, name);
        }
    });
});
