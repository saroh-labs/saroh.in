// @covers web:/privacy
import { expect, test } from "@playwright/test";

import { urls } from "../playwright.config";

/**
 * The Privacy Policy's tables on a phone (audit T1): at 390 each row is a
 * card, nothing inside `main` hides content sideways, and a row's label
 * reads whole ("Account", not "Acc / oun / t").
 *
 * `/privacy` publishes on 17 Oct (KTD-2). Before that it is a 404 unless
 * the stack's web app runs with `RESOURCES_PREVIEW=1`, so the spec skips
 * while the page isn't served. Read-only.
 */

const WEB = urls.WEB_URL;

test("the privacy tables read as cards at 390, nothing hidden sideways", async ({
    page,
    request,
}) => {
    const res = await request.get(`${WEB}/privacy`);
    test.skip(
        res.status() !== 200,
        "/privacy isn't published yet; run web with RESOURCES_PREVIEW=1",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/privacy`);
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Cards, not tables, on a phone.
    await expect(main.locator("table").first()).toBeHidden();
    const cards = main.locator("ul[data-legal-cards]").first();
    await expect(cards).toBeVisible();

    // No element in main hides content sideways.
    const clipped = await main.evaluate((root) =>
        [root, ...root.querySelectorAll("*")]
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .filter((el) => getComputedStyle(el).display !== "inline")
            .map(
                (el) =>
                    `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`,
            ),
    );
    expect(clipped).toEqual([]);

    // The first card's heading is one line: no mid-word break.
    const heading = cards.locator("li").first().locator("p").first();
    await expect(heading).toHaveText("Account");
    const { height, lineHeight } = await heading.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height).toBeLessThan(lineHeight * 1.5);
});
