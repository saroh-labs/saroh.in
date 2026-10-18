// @covers admin:/plans api:pricing
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { hiddenSideways } from "../fixtures/hidden-sideways";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Plans & modules' Plans tab: the pricing table, edited in its cells (admin
 * redesign U11, R20), on the seeded stack's live catalogue (the sample
 * catalogue: Free, Grow highlighted, Pro; made-up prices and limits).
 *
 * Read-only on purpose: cells are opened and cancelled, never committed, so
 * no draft is started on the shared stack and nothing is published. Staff is
 * Sam, a Platform owner, who holds `pricing:edit`.
 */
const PLANS = `${urls.ADMIN_URL}/plans?tab=plans`;

async function openPlans(page: Page): Promise<Locator> {
    await useSession(page, "staff");
    await page.goto(PLANS);
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible();
    return grid;
}

/** The element the keyboard is on, as "role|name|inside the grid". */
function where(page: Page) {
    return page.evaluate(() => {
        const el = document.activeElement;
        return {
            role: el?.getAttribute("role") ?? el?.tagName.toLowerCase() ?? "",
            label: el?.getAttribute("aria-label") ?? "",
            cell: el?.getAttribute("data-cell") ?? "",
            inGrid: !!el?.closest('[role="grid"]'),
        };
    });
}

test.describe("the Plans tab's pricing table", () => {
    test("plans run across and features down, grouped", async ({ page }) => {
        const grid = await openPlans(page);
        for (const plan of ["Free", "Grow", "Pro"]) {
            await expect(
                grid.getByRole("columnheader", { name: new RegExp(plan) }),
            ).toBeVisible();
        }
        await expect(
            grid.getByRole("rowheader", { name: "Products", exact: true }),
        ).toBeVisible();
        await expect(
            grid.getByRole("rowgroup", { name: "Selling" }),
        ).toBeAttached();
        // One stop in the tab order.
        await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
    });

    test("the keyboard moves, opens and cancels, and Tab leaves in one stop", async ({
        page,
    }) => {
        const grid = await openPlans(page);
        const products = grid.locator('[data-cell="Products on Free"]');
        await products.focus();
        await page.keyboard.press("ArrowRight");
        expect((await where(page)).cell).toBe("Products on Grow");
        await page.keyboard.press("End");
        expect((await where(page)).cell).toBe("Products on Pro");
        await page.keyboard.press("Home");
        expect((await where(page)).cell).toBe("Products on Free");

        // Enter opens it in place; Esc cancels with the keyboard back on it.
        await page.keyboard.press("Enter");
        await expect(
            page.getByLabel("Limit for Products on Free"),
        ).toBeFocused();
        await expect(
            page.getByRole("checkbox", { name: "No limit" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByLabel("Limit for Products on Free")).toHaveCount(
            0,
        );
        expect((await where(page)).cell).toBe("Products on Free");

        await page.keyboard.press("Tab");
        expect((await where(page)).inGrid).toBe(false);
        // Nothing was changed: no draft was started.
        await expect(page.getByText(/^Draft ·/)).toHaveCount(0);
    });

    test('"/" searches the features, and the filters narrow them', async ({
        page,
    }) => {
        const grid = await openPlans(page);
        await grid.locator('[data-cell="Products on Free"]').focus();
        await page.keyboard.press("/");
        const search = page.getByRole("searchbox", { name: "Search features" });
        await expect(search).toBeFocused();
        await search.fill("variants");
        await expect(grid.getByRole("rowheader")).toHaveText(["Variants"]);
        await search.fill("");

        const show = page.getByRole("group", { name: "Show" });
        await show.getByRole("button", { name: /^Limits/ }).click();
        await expect(
            grid.getByRole("rowheader", { name: "Products", exact: true }),
        ).toBeVisible();
        await expect(
            grid.getByRole("rowheader", {
                name: "Custom roles",
                exact: true,
            }),
        ).toHaveCount(0);
        await show.getByRole("button", { name: /^All/ }).click();
    });

    test("the feature column stays put and the page never scrolls sideways", async ({
        page,
    }, testInfo) => {
        test.skip(
            !testInfo.project.name.startsWith("phone"),
            "a phone's width",
        );
        const grid = await openPlans(page);
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() => hiddenSideways(page, ['[role="tablist"]']))
            .toEqual({ innerWidth: width, culprits: [] });

        const feature = grid.getByRole("rowheader", {
            name: "Products",
            exact: true,
        });
        const before = await feature.boundingBox();
        await grid
            .locator("xpath=..")
            .evaluate((box) => box.scrollBy({ left: 400 }));
        const after = await feature.boundingBox();
        expect(after?.x).toBe(before?.x);
    });
});
