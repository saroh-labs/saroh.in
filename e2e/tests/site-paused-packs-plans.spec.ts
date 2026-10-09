// @covers site:/ site:/[slug] api:class-packs api:subscriptions api:billing pkg:site-blocks
import { expect, test } from "@playwright/test";

import { urls } from "../playwright.config";
import { asNewVisitor } from "./site-codes";

/**
 * A merchant site a move to a lower plan paused (#800) sells no class packs
 * or plans online either: the Class packs and Plans blocks still show what
 * is on sale, say "This business isn't taking orders right now." and offer
 * no Buy, Join or "Ask about" button. Read-only: it changes nothing.
 *
 * Runs only on a stack prepared for it: `E2E_PAUSED_SITE=<address>` (as in
 * `site-not-taking-orders.spec`, a website past its plan's websites limit
 * with its 7 days up) and `E2E_PAUSED_PRICES_PATH=<path>`, a page on it
 * holding a Class packs or Plans block with something on sale. Never Rye
 * or Pulse (read-only demo stores).
 */

const renderer = new URL(urls.RENDERER_URL);
const ADDRESS = process.env.E2E_PAUSED_SITE ?? "";
const PATH = process.env.E2E_PAUSED_PRICES_PATH ?? "";
const SITE = `${renderer.protocol}//${ADDRESS}.${renderer.host}`;
const SAYS = "This business isn't taking orders right now.";

test.describe("site: packs and plans on a paused website", () => {
    test.skip(
        !ADDRESS || !PATH,
        "Needs a prepared paused site (E2E_PAUSED_SITE, E2E_PAUSED_PRICES_PATH)",
    );
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("says so, and offers nothing to buy or join", async ({ page }) => {
        await page.goto(`${SITE}${PATH}`);
        await expect(page.getByText(SAYS).first()).toBeVisible();
        for (const name of [
            /^Buy/,
            /^Join/,
            /^Ask about joining/,
            /^Ask about this pack/,
        ]) {
            await expect(page.getByRole("button", { name })).toHaveCount(0);
            await expect(page.getByRole("link", { name })).toHaveCount(0);
        }
    });
});
