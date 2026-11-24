// @covers app:/open app:/commerce/orders app:/commerce/products api:organizations
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * A move between pages shows one skeleton, the page's own: the shell's
 * loader draws the header only (`shape="none"`), never a second body grey
 * before the page's. Read only, on Northwind.
 *
 * Kept light: when each loader shows is the router's timing, so the test
 * records the most body greys ever on screen at once during the move,
 * rather than trying to catch one frame.
 */
test.describe("shell loading", () => {
    test.skip(({ isMobile }) => isMobile, "Desk only.");

    test("Orders to Products: one body skeleton at a time", async ({
        page,
    }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        await page.goto("/commerce/orders");
        await expect(
            page.getByRole("heading", { name: "Orders", exact: true }),
        ).toBeVisible();

        await page.evaluate(() => {
            const w = window as unknown as { maxGreys: number };
            w.maxGreys = 0;
            const count = () =>
                document.querySelectorAll(
                    'main > [data-slot="page-loading"]:not([data-shape="none"])',
                ).length;
            new MutationObserver(() => {
                w.maxGreys = Math.max(w.maxGreys, count());
            }).observe(document.body, { childList: true, subtree: true });
        });

        await page
            .getByRole("navigation", { name: "Primary" })
            .locator('a[href="/commerce/products"]')
            .first()
            .click();
        await expect(
            page.getByRole("heading", { name: "Products", exact: true }),
        ).toBeVisible();
        // Landed: no loader left in the page's place.
        await expect(
            page.locator('main > [data-slot="page-loading"]'),
        ).toHaveCount(0);

        const maxGreys = await page.evaluate(
            () => (window as unknown as { maxGreys: number }).maxGreys,
        );
        expect(maxGreys).toBeLessThanOrEqual(1);
    });
});
