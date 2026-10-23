// @covers app:/open app:/analytics api:analytics api:orders api:invoices api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Insights' Money tab (DEC-171, plan U12, #1093; `IBMoneyD`, `IBWeekD`,
 * `IBOwedD` and their phone twins), desk and phone: the answer and rolling
 * weeks for the page's period, the period dark and the one before light;
 * a bar opens that week's orders beside the page, or as a sheet from the
 * foot of a phone; the four figures and every place open their rows; who
 * owes opens each age's bills; 7 days, 4 weeks and 3 months each draw
 * their own bars.
 *
 * Read only, on Northwind Supply and, for who owes, Pulse Fitness (which
 * bills its members): nothing is sent (Send reminder is never pressed) and
 * nothing saved. What each week took depends on the day the
 * seed was made, so this reads the shape and the words, not the amounts
 * (`money-words.test.ts`, `money.db.spec.ts` hold those).
 */

const NORTHWIND = "seed_org";
/** Bills members by subscription and pack: unpaid bills to age. */
const PULSE = "seed_sc_pulse_org";

async function openMoney(page: Page, query = "", org = NORTHWIND) {
    await useSession(page);
    await page.goto(`${urls.APP_URL}/open/${org}`);
    await page.goto(`${urls.APP_URL}/analytics?tab=money${query}`);
    await expect(
        page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();
}

const answer = (page: Page) =>
    page.getByRole("region", { name: "Am I making more money?" });
const bars = (page: Page) =>
    answer(page)
        .getByRole("group", { name: /^Money in each of the last/ })
        .getByRole("button");

/** Nothing on the page is wider than the screen; on a phone, nothing hides. */
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
    if (onPhone(page)) await expectNothingHiddenSideways(page);
}

test("answers for the period, with rolling weeks, four figures and where the money comes from", async ({
    page,
}) => {
    await openMoney(page);
    await expect(
        page
            .getByRole("navigation", { name: "Insights" })
            .getByRole("link", { name: "Money" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(answer(page)).toContainText(
        /came in over the last 4 weeks|Nothing came in over the last 4 weeks/,
    );
    await expect(bars(page)).toHaveCount(12);
    // The last four dark, the four before light, the best in Clay, once.
    await expect(answer(page).locator('button[data-tone="now"]')).toHaveCount(
        4,
    );
    await expect(
        answer(page).locator('button[data-tone="before"]'),
    ).toHaveCount(4);
    await expect(answer(page).locator("button[data-best]")).toHaveCount(1);
    await expect(answer(page)).toContainText("Last 4 weeks");
    await expect(answer(page)).toContainText("The 4 before");

    const tiles = page.getByTestId("money-tiles");
    await expect(tiles.getByRole("link")).toHaveCount(4);
    for (const link of await tiles.getByRole("link").all()) {
        await expect(link).toHaveAttribute(
            "href",
            /^\/commerce\/orders\?date=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&payment=paid$/,
        );
    }
    await expect(
        page.getByRole("region", { name: "How were the last 7 days?" }),
    ).toBeVisible();
    // Each place opens its own rows: a location's orders, or paid invoices.
    const places = page.getByRole("region", {
        name: "Where does the money come from?",
    });
    if ((await places.count()) > 0) {
        for (const link of await places.getByRole("link").all()) {
            await expect(link).toHaveAttribute(
                "href",
                /^\/(commerce\/orders\?|billing\/invoices\?tab=paid$)/,
            );
        }
        await expect(places).not.toContainText(/(^|\s)0%/);
    }
    await expect(page.locator("main")).not.toContainText(/storefront/i);
    await expectNoSidewaysScroll(page);
});

test("a bar opens that week's orders: beside the page on a desk, from the foot on a phone", async ({
    page,
}) => {
    await openMoney(page);
    const readout = page.getByTestId("money-readout");
    // Focusing a bar reads it.
    await bars(page).first().focus();
    await expect(readout).toHaveText(/^Week of \d+ \w{3} · /);

    // Choosing it opens its orders.
    await bars(page).last().click();
    const sheet = page.getByRole("dialog", { name: /^Week of \d+ \w{3}$/ });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(
        /from \d[\d,]* payments?|Nothing came in/,
    );
    await expect(
        sheet.getByRole("link", { name: "Open these orders" }),
    ).toHaveAttribute(
        "href",
        /^\/commerce\/orders\?date=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&payment=paid$/,
    );
    // Where it rests, once it has slid in: measured while it moves, it is
    // still partly off the screen.
    const view = page.viewportSize() ?? { width: 0, height: 0 };
    const edges = async () => {
        const box = await sheet.boundingBox();
        return box
            ? {
                  right: Math.round(box.x + box.width),
                  bottom: Math.round(box.y + box.height),
                  width: Math.round(box.width),
              }
            : null;
    };
    if (onPhone(page)) {
        // From the foot of the screen, the screen's width.
        await expect
            .poll(async () => {
                const e = await edges();
                return e && { bottom: e.bottom, width: e.width };
            })
            .toEqual({ bottom: view.height, width: view.width });
    } else {
        // Beside the page, on the right, under half its width.
        await expect.poll(async () => (await edges())?.right).toBe(view.width);
        expect((await edges())?.width).toBeLessThan(view.width / 2);
    }
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // The readout's "Orders that week", by keyboard, opens the same.
    await bars(page).first().focus();
    await page.getByRole("button", { name: "Orders that week" }).press("Enter");
    await expect(
        page.getByRole("dialog", { name: /^Week of \d+ \w{3}$/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoSidewaysScroll(page);
});

test("who owes me opens each age's bills, with the bills list behind them", async ({
    page,
}) => {
    await openMoney(page, "", PULSE);
    const owed = page.getByRole("region", { name: "Who owes me?" });
    // Pulse bills its members; a business that never billed has no card
    // at all (`money-tab.test.tsx`).
    await expect(owed).toBeVisible();
    await expect(
        owed.getByRole("link", { name: "See unpaid bills" }),
    ).toHaveAttribute("href", /^\/billing\/invoices\?view=(issued|overdue)$/);
    const ages = owed.getByRole("button", {
        name: /^(Not due yet|1 to 30 days late|More than 30 days late):/,
    });
    await expect(ages).toHaveCount(3);
    const first = owed.locator("button:not([disabled])").first();
    if ((await first.count()) === 0) return;
    await first.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText("Who owes me");
    await expect(
        sheet.getByRole("link", { name: "Open unpaid bills" }),
    ).toHaveAttribute("href", /^\/billing\/invoices\?view=(issued|overdue)$/);
    // Its bills, read as it opens; never "none" while they load.
    await expect(
        sheet
            .getByTestId("owed-bills")
            .or(sheet.getByText("No bills here now.")),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expectNoSidewaysScroll(page);
});

test("7 days, 4 weeks and 3 months each draw their own bars, and keep the tab", async ({
    page,
}) => {
    await openMoney(page, "&period=7d");
    await expect(bars(page)).toHaveCount(12);
    await expect(answer(page).locator('button[data-tone="now"]')).toHaveCount(
        1,
    );
    await expect(answer(page)).toContainText("Last 7 days");
    await expect(answer(page)).toContainText("over the last 7 days");

    await openMoney(page, "&period=3m");
    // About thirteen weeks against thirteen: each window's own days.
    const count = await bars(page).count();
    expect(count).toBeGreaterThanOrEqual(24);
    expect(count % 2).toBe(0);
    await expect(answer(page).locator('button[data-tone="now"]')).toHaveCount(
        count / 2,
    );
    await expect(answer(page)).toContainText("Last 3 months");

    // The period control keeps Money open.
    const period = onPhone(page)
        ? page.getByRole("button", { name: /Last 3 months/ })
        : null;
    if (period) {
        await period.click();
        await page
            .getByRole("dialog")
            .getByRole("link", { name: /^Last 4 weeks/ })
            .click();
    } else {
        await page.getByRole("link", { name: "Last 4 weeks" }).click();
    }
    await expect(page).toHaveURL(/\/analytics\?tab=money$/);
    await expect(bars(page)).toHaveCount(12);
    await expectNoSidewaysScroll(page);
});
