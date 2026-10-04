// @covers app:/open app:/analytics api:analytics api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Insights' takings (DEC-075): the answers in words on top, the figures
 * under them, then the website.
 *
 * Read only. Northwind Supply has twelve weeks of paid orders behind the
 * seed; how much each week took depends on the day the seed was made, so
 * this reads the shape and the words' windows, not the amounts (those are
 * `takings-words.test.ts` and `takings.db.spec.ts`). Trade Counter
 * Whitefield has Insights on and has never taken money: one honest
 * sentence and "No takings yet", never a ₹0 chart.
 */

const NORTHWIND = "seed_org";
const WHITEFIELD = "seed_org_whitefield";

async function openInsights(page: Page, org: string) {
    await useSession(page);
    await page.goto(`${urls.APP_URL}/open/${org}`);
    await page.goto(`${urls.APP_URL}/analytics`);
    await expect(
        page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();
}

/** Nothing on the page is wider than the screen it was given. */
async function expectNoSidewaysScroll(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    await expect
        .poll(() =>
            page.evaluate(() => ({
                scroll: document.documentElement.scrollWidth,
                inner: window.innerWidth,
            })),
        )
        .toEqual({ scroll: width, inner: width });
}

test("a business that has sold reads its answers, then the figures behind them", async ({
    page,
}) => {
    await openInsights(page, NORTHWIND);

    const answers = page.getByTestId("takings-answers");
    await expect(answers).toBeVisible();
    await expect(
        answers.getByRole("heading", { name: "How was the last month?" }),
    ).toBeVisible();
    // Whatever it took, the sentence names its window.
    await expect(answers).toContainText(
        /the last four weeks \(\d+ \w+ – \d+ \w+\)/,
    );
    await expect(answers).toContainText(
        "Every sentence is generated from the figures, so it cannot drift from them.",
    );
    await expect(
        answers.getByRole("img", { name: /^Takings for the twelve weeks/ }),
    ).toBeVisible();

    const figures = page.getByTestId("takings-figures");
    await expect(figures).toBeVisible();
    for (const label of [
        "Takings, 4 weeks",
        "Orders, 4 weeks",
        "Best week",
        "Average order, 4 weeks",
    ]) {
        await expect(figures.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(
        figures.getByRole("img", { name: /^Takings for the twelve weeks/ }),
    ).toBeVisible();

    // Merchants read "location", never "storefront" (DEC-069).
    await expect(page.locator("main")).not.toContainText(/storefront/i);
    // The website's figures stay, under the takings.
    await expect(
        page.getByRole("heading", { level: 2, name: "Your website" }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
});

test("a business that has never taken money is told so, not shown ₹0", async ({
    page,
}) => {
    await openInsights(page, WHITEFIELD);

    const answers = page.getByTestId("takings-answers");
    await expect(answers).toContainText(
        "No money has come in yet. Paid orders and paid invoices show here from the week they're paid.",
    );
    await expect(
        page.getByRole("heading", { name: "No takings yet" }),
    ).toBeVisible();
    // No chart and no figures for weeks that never took anything.
    await expect(page.getByTestId("takings-figures")).toHaveCount(0);
    await expect(
        page.getByRole("img", { name: /^Takings for the twelve weeks/ }),
    ).toHaveCount(0);
    await expectNoSidewaysScroll(page);
});
