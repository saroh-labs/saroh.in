// @covers app:/open app:/analytics api:analytics api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Insights' What sells tab (DEC-171, plan U13, #1095; `IBSellsD`,
 * `IBSellsP`), desk and phone: what sells most, what people book and how
 * full, when it is busiest (with Show as a table), and the best customers,
 * each with its See all; the page's period drives every part.
 *
 * Read only, on Northwind Supply, which sells and takes bookings: nothing
 * is pressed that saves. What sold depends on the day the seed was made,
 * so this reads the shape and the words, not the figures
 * (`sells-words.test.ts` and `sells.db.spec.ts` hold those). Each part may
 * be empty on its own in a young seed, and the spec says which it found.
 */

const NORTHWIND = "seed_org";

async function openSells(page: Page, query = "") {
    await useSession(page);
    await page.goto(`${urls.APP_URL}/open/${NORTHWIND}`);
    await page.goto(`${urls.APP_URL}/analytics?tab=sells${query}`);
    await expect(
        page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();
}

const part = (page: Page, question: string) =>
    page.getByRole("region", { name: question });

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

test("asks the four questions for the period, each with its answer and its way to the rows", async ({
    page,
}) => {
    await openSells(page);
    await expect(
        page
            .getByRole("navigation", { name: "Insights" })
            .getByRole("link", { name: "What sells" }),
    ).toHaveAttribute("aria-current", "page");

    // Northwind sells and takes bookings: all four are asked.
    const sold = part(page, "What sells most?");
    const booked = part(page, "What do people book?");
    const busiest = part(page, "When is it busiest?");
    const customers = part(page, "Who are my best customers?");
    for (const p of [sold, booked, busiest, customers]) {
        await expect(p).toBeVisible();
    }
    await expect(sold).toContainText(
        /sells most: [\d,]+ sold|leads with [\d,]+ sold|Nothing sold in the last 4 weeks/,
    );
    await expect(booked).toContainText(
        /booked most|nearly always full|Too few bookings yet|No bookings in the last 4 weeks/,
    );
    await expect(busiest).toContainText(
        /are busiest|need about 2 weeks|Too few sales and bookings/,
    );
    await expect(customers).toContainText(
        /came back|came for the first time|had come before|Nobody paid or booked/,
    );

    // Each product opens its page; See all opens the lists.
    const products = sold.locator('[data-row="sold"]');
    if ((await products.count()) > 0) {
        await expect(products.first().getByRole("link")).toHaveAttribute(
            "href",
            /^\/commerce\/products\/[^/?]+$/,
        );
        await expect(
            sold.getByRole("link", { name: /^See all( [\d,]+)? products$/ }),
        ).toHaveAttribute("href", "/commerce/products");
        // The owner sees what each brought in.
        await expect(products.first()).toContainText("₹");
    }
    if ((await booked.locator('[data-row="booked"]').count()) > 0) {
        await expect(
            booked.getByRole("link", { name: "See services" }),
        ).toHaveAttribute("href", "/services");
    }
    const people = customers.locator('[data-row="customer"]');
    if ((await people.count()) > 0) {
        await expect(people.first().getByRole("link")).toHaveAttribute(
            "href",
            /^\/contacts\/[^/?]+$/,
        );
        await expect(
            customers.getByRole("link", { name: "See all customers" }),
        ).toHaveAttribute("href", "/commerce/customers?sort=spent");
    }
    // The owner sees everything: no "counts only" notice.
    await expect(page.getByTestId("sells-hidden")).toHaveCount(0);
    await expect(page.getByText("How these are counted")).toBeVisible();
    await expectNoSidewaysScroll(page);
});

test("the busiest grid shows as a table and back, by keyboard too", async ({
    page,
}) => {
    await openSells(page);
    const busiest = part(page, "When is it busiest?");
    const show = busiest.getByRole("button", { name: "Show as a table" });
    test.skip(
        (await show.count()) === 0,
        "Too young a seed to say when it's busiest: the sentence says so (sells-tab.test.tsx).",
    );
    await expect(busiest.locator("[data-level]")).toHaveCount(28);
    await expect(show).toHaveAttribute("aria-expanded", "false");

    await show.click();
    const table = busiest.getByRole("table", {
        name: "Sales and bookings, each day and time",
    });
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader")).toHaveText([
        "Day",
        "7 to 10",
        "10 to 1",
        "1 to 4",
        "4 to 8",
    ]);
    await expect(table.locator("tbody tr")).toHaveCount(7);
    await expect(busiest.locator("[data-level]")).toHaveCount(0);
    // A phone reads the table whole: no column out of sight.
    await expectNoSidewaysScroll(page);

    const grid = busiest.getByRole("button", { name: "Show as a grid" });
    await expect(grid).toHaveAttribute("aria-expanded", "true");
    await grid.focus();
    await page.keyboard.press("Enter");
    await expect(busiest.locator("[data-level]")).toHaveCount(28);
    await expect(table).toBeHidden();
});

test("on a phone the best sellers are rows, their figures under each name, nothing hidden sideways", async ({
    page,
}) => {
    await openSells(page);
    const sold = part(page, "What sells most?");
    const rows = sold.locator('[data-row="sold"]');
    test.skip(
        (await rows.count()) === 0,
        "Nothing sold in the period on this seed.",
    );
    const head = sold.locator("[data-list-head]");
    if (onPhone(page)) {
        // No table head on a phone; each row says "N sold" in words.
        await expect(head).toBeHidden();
        await expect(rows.first()).toContainText(/[\d,]+ sold/);
        const name = await rows.first().getByRole("link").boundingBox();
        const figures = await rows
            .first()
            .getByText(/[\d,]+ sold/)
            .boundingBox();
        if (name && figures) expect(figures.y).toBeGreaterThan(name.y);
    } else {
        await expect(head).toBeVisible();
        await expect(head).toContainText("Brought in");
    }
    await expectNoSidewaysScroll(page);
});

test("the period is the page's: 7 days and 3 months answer for their own days", async ({
    page,
}) => {
    await openSells(page, "&period=7d");
    await expect(part(page, "What sells most?")).toContainText(
        /sells most|leads with|in the last 7 days/,
    );
    await expect(page.locator("main")).not.toContainText("the last 4 weeks");

    await openSells(page, "&period=3m");
    await expect(part(page, "What sells most?")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(
        /the last (4 weeks|7 days)/,
    );
    await expect(
        page
            .getByRole("navigation", { name: "Insights" })
            .getByRole("link", { name: "What sells" }),
    ).toHaveAttribute("href", "/analytics?tab=sells&period=3m");
});
