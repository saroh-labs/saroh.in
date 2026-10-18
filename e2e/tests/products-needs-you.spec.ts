// @covers accounts:/login app:/open app:/commerce/products api:products api:stock
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { urls } from "../playwright.config";

/**
 * Products' Needs you (the Products audit, 16 Oct): Restock opens the
 * quick look on that product, here, with the Add box focused — never
 * another page — and a draft nobody can buy isn't listed, however empty
 * its shelf.
 *
 * It runs on Northwind Supply, the base seed. It makes two products of its
 * own, both counted at 0 — one live, one a draft — and sets them aside
 * afterwards (a count is history: `fixtures/throwaway-products.ts`).
 */

const ORG = "seed_org";
const STORE = "seed_store";
const NW: Storefront = { organizationId: ORG, storeId: STORE };

const api = (path: string) => `${urls.API_URL}/stores/${STORE}/products${path}`;
// The API refuses a write with no Origin (#50).
const orgHeader = { "x-organization-id": ORG, origin: urls.APP_URL };

/** Counted, with nothing on the shelf. */
async function countAtZero(request: APIRequestContext, productId: string) {
    const on = await request.put(api(`/${productId}/stock-tracking`), {
        headers: orgHeader,
        data: { tracked: true },
    });
    expect(on.ok()).toBe(true);
    const counted = await request.put(api(`/${productId}/inventory`), {
        headers: orgHeader,
        data: { quantity: 0, lowStockAlert: 2 },
    });
    expect(counted.ok()).toBe(true);
}

async function signIn(page: Page) {
    await useSession(page);
}

test.describe("Products — Needs you", () => {
    // @serial: an empty live product is in every Needs you of the
    // business (Products and Stock) while it runs.
    test(
        "Restock opens the quick look with Add focused; a draft isn't listed",
        { tag: "@serial" },
        async ({ page }, testInfo) => {
            test.setTimeout(120_000);
            const live = `E2E Restock Jar ${testInfo.project.name}`;
            const draft = `E2E Draft Jar ${testInfo.project.name}`;

            await signIn(page);
            await page.goto(`/open/${ORG}`);
            try {
                const liveId = await takeProduct(page.request, NW, live, {
                    price: "120",
                    status: "PUBLISHED",
                });
                const draftId = await takeProduct(page.request, NW, draft, {
                    price: "120",
                    status: "DRAFT",
                });
                await countAtZero(page.request, liveId);
                await countAtZero(page.request, draftId);

                // Searched to the spec products, so this one is on the page;
                // Needs you still covers the whole catalogue.
                await page.goto(
                    `/commerce/products?q=${encodeURIComponent("E2E ")}`,
                );
                const needs = page.getByRole("region", { name: "Needs you" });
                await expect(needs).toBeVisible();
                // One line by default: open it to see every one.
                await needs.getByRole("button", { name: /^Needs you/ }).click();
                await expect(
                    needs.getByRole("button", { name: `Restock ${live}` }),
                ).toBeVisible();
                // A draft sells to nobody: nothing to restock.
                await expect(needs.getByText(draft)).toHaveCount(0);

                await needs
                    .getByRole("button", { name: `Restock ${live}` })
                    .click();
                // The same page, the quick look open on it, the Add box ready.
                await expect(page).toHaveURL(/\/commerce\/products(\?|$)/);
                const look = page.getByRole("dialog", { name: live });
                await expect(look).toBeVisible();
                await expect(
                    look.getByRole("textbox", { name: `Add stock to ${live}` }),
                ).toBeFocused();
            } finally {
                await removeProducts(page.request, NW, live);
                await removeProducts(page.request, NW, draft);
            }
        },
    );
});
