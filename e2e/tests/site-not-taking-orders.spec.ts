// @covers site:/shop site:/shop/[productSlug] api:orders api:products api:billing pkg:site-blocks
import { expect, test } from "@playwright/test";

import { urls } from "../playwright.config";
import { asNewVisitor } from "./site-codes";

/**
 * A merchant site whose website or location a move to a lower plan paused
 * (#800): the shop says "This business isn't taking orders right now."
 * and offers no bag and no "Ask about ordering"; the product page says the
 * same where Add to bag would be. Read-only: it changes nothing.
 *
 * The paused state needs a business past its plan's limits with its 7 days
 * since the notice up, which the seed doesn't make. So it runs only where
 * the stack was prepared for it and says so with `E2E_PAUSED_SITE=<address>`:
 * a business with `PLAN_ENFORCEMENT` on, on the catalogue, with more places
 * customers visit than its plan includes, its `MOVE_DOWN` notice claim
 * dated more than 7 days back, and the site at `<address>` selling from the
 * location that pauses (its newest), with `SITE_SHOP` on and a product
 * listed there. Never Rye or Pulse (read-only demo stores).
 */

const renderer = new URL(urls.RENDERER_URL);
const ADDRESS = process.env.E2E_PAUSED_SITE ?? "";
const SITE = `${renderer.protocol}//${ADDRESS}.${renderer.host}`;
const SAYS = "This business isn't taking orders right now.";

test.describe("site shop: not taking orders after a move to a lower plan", () => {
    test.skip(!ADDRESS, "Needs a prepared paused site (E2E_PAUSED_SITE)");
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("the shop says so and offers no bag", async ({ page }) => {
        await page.goto(`${SITE}/shop`);
        await expect(page.getByRole("status").first()).toHaveText(SAYS);
        await expect(
            page.getByRole("button", { name: "Add to bag" }),
        ).toHaveCount(0);
    });

    test("a product page says so where Add to bag would be", async ({
        page,
    }) => {
        await page.goto(`${SITE}/shop`);
        await page.locator('a[href^="/shop/"]').first().click();
        await expect(page.getByText(SAYS)).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Add to bag" }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("link", { name: "Ask about ordering" }),
        ).toHaveCount(0);
    });
});
