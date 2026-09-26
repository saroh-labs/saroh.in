import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoUser, urls } from "../playwright.config";

/**
 * The Products list and its quick look (#519, #520): search reaches the
 * whole catalogue and says when it finds nothing, a row opens the quick
 * look, Stop selling offers Undo, J at the last product stays put, and
 * Duplicate opens a draft copy in the Editor.
 *
 * It runs on Northwind Supply, the base seed — Rye & Co., Pulse Fitness and
 * Leela & Loom stay camera-ready. It makes a product of its own, untracked,
 * and takes it and its copy away afterwards, whatever happened.
 */

const ORG = "seed_org";
const STORE = "seed_store";
const NW: Storefront = { organizationId: ORG, storeId: STORE };

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

test.describe("Products list", () => {
    test("search finds nothing, then Clear search", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${ORG}`);
        const nonsense = "zzq-no-such-product";
        await page.goto(`/commerce/products?q=${nonsense}`);
        await expect(
            page.getByText(`No products match “${nonsense}”`),
        ).toBeVisible();
        await page.getByRole("button", { name: "Clear search" }).click();
        await expect(page).toHaveURL(/\/commerce\/products$/);
        await expect(
            page.getByText(`No products match “${nonsense}”`),
        ).toHaveCount(0);
    });

    test("quick look, Stop selling with Undo, and Duplicate", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E List Jar ${testInfo.project.name}`;
        const copy = `${name} (copy)`;

        await signIn(page);
        await page.goto(`/open/${ORG}`);
        await removeProducts(page.request, NW, copy);
        await takeProduct(page.request, NW, name, {
            price: "240",
            status: "PUBLISHED",
        });

        try {
            // Search reaches it by name; the row opens the quick look.
            await page.goto(`/commerce/products?q=${encodeURIComponent(name)}`);
            // The row's own button — its name leads; "More actions for …"
            // beside it only contains it.
            await page
                .getByRole("button", { name: new RegExp(`^${name}`) })
                .click();
            const look = page.getByRole("dialog", { name });
            await expect(look).toBeVisible();
            await expect(look.getByText("1 of 1")).toBeVisible();
            await expect(look.getByText("Published")).toBeVisible();

            // J at the last product stays on it.
            await page.keyboard.press("j");
            await expect(look.getByText("1 of 1")).toBeVisible();

            // Stop selling archives it, and Undo puts it back on sale.
            await look.getByRole("button", { name: "Stop selling" }).click();
            await expect(page.getByText(/Stopped selling/)).toBeVisible();
            await expect(look.getByText("Archived")).toBeVisible();
            await page.getByRole("button", { name: "Undo" }).click();
            await expect(look.getByText("Published")).toBeVisible();
            await page.keyboard.press("Escape");

            // Duplicate opens a draft copy in the Editor.
            await page
                .getByRole("button", { name: `More actions for ${name}` })
                .first()
                .click();
            await page.getByRole("menuitem", { name: "Duplicate" }).click();
            await page.waitForURL(/\/commerce\/products\/[^/]+\/edit/);
            await expect(page.getByText(copy).first()).toBeVisible();
        } finally {
            await removeProducts(page.request, NW, copy);
            await removeProducts(page.request, NW, name);
        }
    });
});
