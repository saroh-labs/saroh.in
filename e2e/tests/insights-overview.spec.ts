// @covers app:/open app:/analytics api:analytics api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Insights B's frame (DEC-171, plan U10, #1089), desk and phone: one period
 * for the whole page, kept in the address with the tab, so Back and a
 * refresh keep both; the line under the title names the days compared;
 * the Overview's three answers each lead to their tab.
 *
 * Read only, on Pulse Fitness (a film set no test writes to, which sells,
 * takes bookings and has a website, with Insights on; Rye & Co. has none). What it took
 * depends on the day the seed was made, so this reads the shape, the
 * questions and the windows' words, not the amounts (those are
 * `overview-words.test.ts` and `money.db.spec.ts`).
 */

const PULSE = "seed_sc_pulse_org";

async function openInsights(page: Page, query = "") {
    await useSession(page);
    await page.goto(`${urls.APP_URL}/open/${PULSE}`);
    await page.goto(`${urls.APP_URL}/analytics${query}`);
    await expect(
        page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();
}

const tabs = (page: Page) => page.getByRole("navigation", { name: "Insights" });

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

/** The line under the title: "22 Sep to 19 Oct, compared with …". */
const daysLine = (before: string) =>
    new RegExp(
        `\\d+( \\w{3})? to \\d+ \\w{3}(?: \\d{4})?, compared with the ${before} before`,
    );

test("opens on the Overview for the last 4 weeks, three answers each leading to its tab", async ({
    page,
}) => {
    await openInsights(page);
    const main = page.locator("main");

    await expect(main).toContainText(daysLine("4 weeks"));
    await expect(tabs(page).getByRole("link")).toHaveText([
        "Overview",
        "Money",
        "What sells",
        "Where customers come from",
    ]);
    await expect(
        tabs(page).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
    // Sources and the path are built (U16, #1101): no tab is marked Next.
    await expect(
        tabs(page).getByRole("link", { name: /^Where customers come from/ }),
    ).not.toContainText("Next");

    for (const [question, link, href] of [
        ["Am I making more money?", "See money", "/analytics?tab=money"],
        ["What sells, who books?", "See what sells", "/analytics?tab=sells"],
        [
            "Where do customers come from?",
            "See your website",
            "/analytics?tab=from",
        ],
    ] as const) {
        const card = page.getByRole("region", { name: question });
        await expect(card).toBeVisible();
        await expect(card.getByRole("link", { name: link })).toHaveAttribute(
            "href",
            href,
        );
    }
    // A picture of the weeks, said in words for a screen reader.
    await expect(
        page
            .getByRole("region", { name: "Am I making more money?" })
            .getByRole("img", { name: /^Money in each of the last/ }),
    ).toBeVisible();
    // How it was counted, folded at the foot; it says how often.
    await main.getByText("How these are counted").click();
    await expect(main).toContainText(
        "Your website's visits, enquiries and online orders are updated every hour.",
    );
    // Never a "0%" place or "100% below".
    await expect(main).not.toContainText(/100% below|\b0%/);
    await expectNoSidewaysScroll(page);
});

test("the period is the page's: it changes every figure, keeps the tab, and survives Back and a refresh", async ({
    page,
}) => {
    await openInsights(page);
    const main = page.locator("main");

    if (onPhone(page)) {
        // `IBPeriodP`: one button on the title's line, a sheet of three.
        const button = page.getByRole("button", {
            name: "Show figures for: Last 4 weeks",
        });
        const sheet = page.getByRole("dialog", { name: "Show figures for" });
        await pressUntil(button, sheet);
        await expect(sheet).toContainText(
            /\d+ to \d+ \w{3}, against \d+ to \d+ \w{3}/,
        );
        await expect(sheet).toContainText(
            "Every figure on Insights follows this choice.",
        );
        await expect(
            sheet.getByRole("link", { name: /^Last 4 weeks/ }),
        ).toHaveAttribute("aria-current", "true");
        await sheet.getByRole("link", { name: /^Last 7 days/ }).click();
        await expect(sheet).toBeHidden();
    } else {
        // `IBPeriodD`: the three side by side.
        await page
            .getByRole("navigation", { name: "Show figures for" })
            .getByRole("link", { name: "Last 7 days" })
            .click();
    }
    await expect(page).toHaveURL(/\/analytics\?period=7d$/);
    await expect(main).toContainText(daysLine("7 days"));
    // The last 7 days are drawn a bar a day.
    await expect(
        page.getByRole("img", { name: /^Money in each of the last 7 days/ }),
    ).toBeVisible();

    // Every tab keeps the period.
    await expect(
        tabs(page).getByRole("link", { name: "Money" }),
    ).toHaveAttribute("href", "/analytics?tab=money&period=7d");
    await tabs(page).getByRole("link", { name: "What sells" }).click();
    await expect(page).toHaveURL(/\/analytics\?tab=sells&period=7d$/);
    await expect(
        tabs(page).getByRole("link", { name: "What sells" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(main).toContainText(daysLine("7 days"));

    // A refresh keeps both.
    await page.reload();
    await expect(
        tabs(page).getByRole("link", { name: "What sells" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(main).toContainText(daysLine("7 days"));

    // Back goes to the Overview for the same 7 days.
    await page.goBack();
    await expect(page).toHaveURL(/\/analytics\?period=7d$/);
    await expect(
        tabs(page).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(main).toContainText(daysLine("7 days"));
    await expectNoSidewaysScroll(page);
});

test("on a phone the tabs scroll inside their strip and nothing else does", async ({
    page,
}) => {
    test.skip(!onPhone(page), "the phone's strip");
    await openInsights(page, "?tab=from&period=3m");
    // The last tab, scrolled into its strip, is the open one.
    const last = tabs(page).getByRole("link", {
        name: /^Where customers come from/,
    });
    await expect(last).toHaveAttribute("aria-current", "page");
    await expect(last).toBeInViewport();
    await expect(page.locator("main")).toContainText(daysLine("3 months"));
    await expectNoSidewaysScroll(page);
});

test("an old website link opens the website's tab for the nearest period", async ({
    page,
}) => {
    await openInsights(page, "?range=30d");
    await expect(
        tabs(page).getByRole("link", { name: /^Where customers come from/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator("main")).toContainText(daysLine("4 weeks"));
    await expect(
        page.getByRole("heading", { level: 2, name: "Your website" }),
    ).toBeVisible();
});
