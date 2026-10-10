// @covers app:/open app:/analytics api:analytics api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
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
    // Nor anything inside it hiding sideways, on a phone (audit T10).
    if (test.info().project.name.startsWith("phone")) {
        await expectNothingHiddenSideways(page);
    }
}

test("a business that has sold reads its answers, then the figures behind them", async ({
    page,
}) => {
    await openInsights(page, NORTHWIND);

    const answers = page.getByTestId("takings-answers");
    await expect(answers).toBeVisible();
    // This week first, against the same days of last week, never as a whole week.
    await expect(
        answers.getByRole("heading", { name: "How is this week going?" }),
    ).toBeVisible();
    await expect(answers).toContainText(/(since |today \()\w+day \d+ \w+/);
    await expect(
        answers.getByRole("heading", { name: "How was the last month?" }),
    ).toBeVisible();
    // Whatever it took, the sentence names its window.
    await expect(answers).toContainText(
        /the last four weeks \(\d+ \w+ – \d+ \w+\)/,
    );
    // What the figures were counted from, and how, in the merchant's words.
    await expect(answers).toContainText(
        /From \d[\d,]* payments? in the last four weeks|No payments in the last four weeks/,
    );
    await answers.getByText("How sales are counted").click();
    await expect(answers).toContainText(
        "A sale counts in the week it was paid, Monday to Sunday in your business's time zone.",
    );
    await expect(
        answers.getByRole("img", { name: /^Sales for the twelve weeks/ }),
    ).toBeVisible();
    // The best week opens its orders.
    await expect(
        answers
            .getByRole("link", { name: "See the orders placed that week" })
            .first(),
    ).toHaveAttribute(
        "href",
        /^\/commerce\/orders\?date=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&payment=paid$/,
    );

    const figures = page.getByTestId("takings-figures");
    await expect(figures).toBeVisible();
    for (const label of [
        "Sales, 4 weeks",
        "Orders, 4 weeks",
        "Best week",
        "Average order, 4 weeks",
    ]) {
        // Each figure opens the orders behind it.
        await expect(
            figures.getByRole("link", { name: new RegExp(`^${label}`) }),
        ).toHaveAttribute("href", /^\/commerce\/orders\?/);
    }
    // Twelve weeks and this week so far, each bar read by tapping it.
    const chart = figures.getByRole("group", {
        name: /^Sales for the twelve weeks/,
    });
    await expect(chart.getByRole("button")).toHaveCount(13);
    await chart.getByRole("button").first().click();
    await expect(figures).toContainText(
        /Week of \d+ \w+ · ₹[\d,]+ · \d+ paid orders?/,
    );
    await chart.getByRole("button").last().click();
    await expect(figures).toContainText(/This week so far \(/);
    await expect(
        figures.getByRole("link", { name: "This week's orders" }),
    ).toBeVisible();

    // Merchants read "location", never "storefront" (DEC-069).
    await expect(page.locator("main")).not.toContainText(/storefront/i);
    // The website's figures stay, under the takings, in the same language:
    // days written "4 Sep", read by tapping, enquiries opening Leads.
    await expect(
        page.getByRole("heading", { level: 2, name: "Your website" }),
    ).toBeVisible();
    const website = page.getByRole("region", { name: "Your website" });
    await expect(
        website.getByRole("link", { name: /^Enquiries/ }),
    ).toHaveAttribute("href", "/leads");
    // Orders is back (#919): the range's paid orders, opening those days'.
    await expect(
        website.getByRole("link", { name: /^Orders\s*[\d,]+$/ }),
    ).toHaveAttribute(
        "href",
        /^\/commerce\/orders\?date=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&payment=paid$/,
    );
    await expect(website).toContainText(
        "visits, visitors, enquiries and paid orders",
    );
    const visits = page.getByRole("group", { name: /^Visits each day/ });
    if ((await visits.count()) > 0) {
        await visits.getByRole("button").first().click();
        await expect(page.locator("main")).toContainText(
            /\w+day \d+ \w+ · [\d,]+ visits? · [\d,]+ visitors?/,
        );
    }
    await expect(page.locator("main")).not.toContainText(/\b\d{2}-\d{2}\b/);
    await expectNoSidewaysScroll(page);
});

test("a business that has never taken money is told so, not shown ₹0", async ({
    page,
}) => {
    await openInsights(page, WHITEFIELD);

    // Said once, with what to do.
    await expect(
        page.getByRole("heading", { name: "No money has come in yet" }),
    ).toBeVisible();
    await expect(page.getByTestId("takings-answers")).toHaveCount(0);
    await expect(
        page.getByRole("link", { name: "Take an order" }),
    ).toHaveAttribute("href", "/commerce/orders/new");
    await expect(
        page.getByRole("link", { name: "Send an invoice" }),
    ).toHaveAttribute("href", "/billing/invoices/new");
    // No chart and no figures for weeks that never took anything.
    await expect(page.getByTestId("takings-figures")).toHaveCount(0);
    await expect(
        page.getByRole("img", { name: /^Sales for the twelve weeks/ }),
    ).toHaveCount(0);
    // The website's Orders says none were paid, never just a bare 0 (#919).
    const website = page.getByRole("region", { name: "Your website" });
    await expect(
        website.getByRole("link", { name: /^Orders\s*0$/ }),
    ).toBeVisible();
    await expect(website.getByTestId("website-orders-note")).toContainText(
        /^No paid orders (recorded )?in the last 30 days\./,
    );
    await expectNoSidewaysScroll(page);
});
