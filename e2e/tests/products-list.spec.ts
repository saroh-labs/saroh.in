// @covers accounts:/login app:/open app:/commerce/products api:products
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";

/**
 * The Products list and its quick look (#519, #520): search reaches the
 * whole catalogue and says when it finds nothing, a row opens the quick
 * look from the keyboard with its title focused, Archive (in a menu with
 * Duplicate and Delete) offers Undo, J at the last product stays put, and
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
    await useSession(page);
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

    test("quick look, Archive with Undo, and Duplicate", async ({
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
            // From the keyboard: the title takes focus, not the first
            // button (whose tooltip would open), and Previous and Next say
            // they do nothing at the only product.
            await page
                .getByRole("button", { name: new RegExp(`^${name}`) })
                .focus();
            await page.keyboard.press("Enter");
            const look = page.getByRole("dialog", { name });
            await expect(look).toBeVisible();
            await expect(look.getByRole("heading", { name })).toBeFocused();
            await expect(page.getByRole("tooltip")).toHaveCount(0);
            await expect(
                look.getByRole("button", { name: /^Previous product/ }),
            ).toHaveAttribute("aria-disabled", "true");
            await expect(
                look.getByRole("button", { name: /^Next product/ }),
            ).toHaveAttribute("aria-disabled", "true");
            await expect(look.getByText("1 of 1")).toBeVisible();
            await expect(look.getByText("Live", { exact: true })).toBeVisible();

            // J at the last product stays on it.
            await page.keyboard.press("j");
            await expect(look.getByText("1 of 1")).toBeVisible();

            // Archive takes it off sale, and Undo puts it back. It sits in
            // the footer's menu beside Edit, in the row menu's order:
            // Archive, Duplicate, then Delete.
            await look.getByRole("button", { name: "More actions" }).click();
            const items = page.getByRole("menuitem");
            await expect(items).toHaveCount(3);
            await expect(items.nth(0)).toContainText("Archive");
            await expect(items.nth(1)).toHaveText("Duplicate");
            await expect(items.nth(2)).toHaveText("Delete");
            await page.getByRole("menuitem", { name: /Archive/ }).click();
            await expect(
                page.getByText(/^Archived E2E List Jar/),
            ).toBeVisible();
            await expect(look.getByText("Archived")).toBeVisible();
            await page.getByRole("button", { name: "Undo" }).click();
            await expect(look.getByText("Live", { exact: true })).toBeVisible();
            await page.keyboard.press("Escape");

            // On a phone the toasts sit over the foot of the list, where this
            // one row is, and take the press meant for its menu. The pointer
            // is still resting where Undo was pressed, inside the toast, and
            // a toast under the pointer waits: move off it, then wait for the
            // toasts to go, as someone would.
            await page.mouse.move(1, 1);
            await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
                timeout: 20_000,
            });

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
