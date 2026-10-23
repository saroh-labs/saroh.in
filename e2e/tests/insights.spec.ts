// @covers app:/open app:/analytics api:analytics api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Insights' Money tab (DEC-171, #1093: the page's period, rolling weeks)
 * and the website's figures on Where customers come from (#1089: one
 * period for the page, tabs in the address). The Money tab's own spec,
 * bars, sheets and periods, is `insights-money.spec.ts`.
 *
 * Read only. Northwind Supply has twelve weeks of paid orders behind the
 * seed; how much each week took depends on the day the seed was made, so
 * this reads the shape and the words' windows, not the amounts (those are
 * `money-words.test.ts` and `money.db.spec.ts`). Trade Counter Whitefield
 * has Insights on and has never taken money: one honest sentence, never a
 * ₹0 chart.
 */

const NORTHWIND = "seed_org";
const WHITEFIELD = "seed_org_whitefield";

async function openInsights(page: Page, org: string, query = "") {
    await useSession(page);
    await page.goto(`${urls.APP_URL}/open/${org}`);
    await page.goto(`${urls.APP_URL}/analytics${query}`);
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
    await openInsights(page, NORTHWIND, "?tab=money");
    await expect(
        page
            .getByRole("navigation", { name: "Insights" })
            .getByRole("link", { name: "Money" }),
    ).toHaveAttribute("aria-current", "page");

    const answer = page.getByRole("region", {
        name: "Am I making more money?",
    });
    await expect(answer).toBeVisible();
    // The last 7 days, never "this week so far" against a whole week.
    await expect(
        page.getByRole("region", { name: "How were the last 7 days?" }),
    ).toContainText(/\d+ (\w{3} )?to \d+ \w{3}/);
    // What the figures were counted from, and how, in the merchant's words.
    await expect(page.locator("main")).toContainText(
        /From \d[\d,]* payments?:|No payments in the last 4 weeks/,
    );
    await page.getByText("How these are counted").click();
    await expect(page.locator("main")).toContainText(
        "The weekly bars are seven days at a time, back from today",
    );
    const tiles = page.getByTestId("money-tiles");
    for (const label of [
        "Money in",
        "Paid orders and bills",
        "An order is usually",
        "Best week",
    ]) {
        // Each figure opens the orders behind it.
        await expect(
            tiles.getByRole("link", { name: new RegExp(`^${label}`) }),
        ).toHaveAttribute("href", /^\/commerce\/orders\?/);
    }
    // Twelve rolling weeks, each bar read by focusing it.
    const chart = answer.getByRole("group", {
        name: /^Money in each of the last 12 weeks/,
    });
    await expect(chart.getByRole("button")).toHaveCount(12);
    await chart.getByRole("button").first().focus();
    await expect(page.getByTestId("money-readout")).toHaveText(
        /^Week of \d+ \w{3} · (₹[\d,]+ · \d+ payments?|nothing came in)$/,
    );

    // Merchants read "location", never "storefront" (DEC-069).
    await expect(page.locator("main")).not.toContainText(/storefront/i);
    await expectNoSidewaysScroll(page);

    // The website's figures, on their own tab, in the same language: days
    // written "4 Sep", read by tapping, enquiries opening Leads.
    await page
        .getByRole("navigation", { name: "Insights" })
        .getByRole("link", { name: /^Where customers come from/ })
        .click();
    await expect(page).toHaveURL(/[?&]tab=from/);
    await expect(
        page.getByRole("heading", { level: 2, name: "Your website" }),
    ).toBeVisible();
    const website = page.getByRole("region", { name: "Your website" });
    await expect(
        website.getByRole("link", { name: /^Enquiries/ }),
    ).toHaveAttribute("href", "/leads");
    // Orders is back (#919): the range's paid orders, opening those days'
    // (U14 names them Paid orders and bookings, with how they moved).
    await expect(
        website.getByRole("link", {
            name: /^Paid orders and bookings\s*[\d,]+/,
        }),
    ).toHaveAttribute(
        "href",
        /^\/commerce\/orders\?date=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&payment=paid$/,
    );
    await expect(website).toContainText(
        "visits, visitors, enquiries, and paid orders and bookings",
    );
    const visits = page.getByRole("group", { name: /^Visits each day/ });
    if ((await visits.count()) > 0) {
        await visits.getByRole("button").first().click();
        await expect(page.locator("main")).toContainText(
            /\w+day \d+ \w+ · (no visits|[\d,]+ visits? · [\d,]+ visitors?)/,
        );
    }
    await expect(page.locator("main")).not.toContainText(/\b\d{2}-\d{2}\b/);
    await expectNoSidewaysScroll(page);
});

test("a business that has never taken money is told so, not shown ₹0", async ({
    page,
}) => {
    // The Overview says it once, with the two ways to take money.
    await openInsights(page, WHITEFIELD);
    await expect(
        page.getByRole("heading", {
            name: "Your first sale shows here the week it's paid",
        }),
    ).toBeVisible();
    await expect(page.getByTestId("answer-money")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("₹0");
    await expectNoSidewaysScroll(page);

    // So does the Money tab.
    await openInsights(page, WHITEFIELD, "?tab=money");
    await expect(
        page.getByRole("heading", {
            name: "Your first sale shows here the week it's paid",
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: "Take an order" }),
    ).toHaveAttribute("href", "/commerce/orders/new");
    await expect(
        page.getByRole("link", { name: "Send an invoice" }),
    ).toHaveAttribute("href", "/billing/invoices/new");
    // No chart and no figures for weeks that never took anything.
    await expect(page.getByTestId("money-tiles")).toHaveCount(0);
    await expect(
        page.getByRole("group", { name: /^Money in each of the last/ }),
    ).toHaveCount(0);
    // The website's Orders says none were paid, never just a bare 0 (#919),
    // for the page's period.
    await openInsights(page, WHITEFIELD, "?tab=from");
    const website = page.getByRole("region", { name: "Your website" });
    await expect(
        website.getByRole("link", {
            name: /^Paid orders and bookings\s*0/,
        }),
    ).toBeVisible();
    await expect(website.getByTestId("website-orders-note")).toContainText(
        /^No paid orders (recorded )?in the last 4 weeks\./,
    );
    await expectNoSidewaysScroll(page);
});
