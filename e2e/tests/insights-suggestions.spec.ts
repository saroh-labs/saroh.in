// @covers app:/open app:/analytics api:analytics
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { northwind } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Insights' "What to do next" (DEC-171, plan U11, #1091), desk and phone:
 * one suggestion at a time, "1 of N", Next suggestion wrapping round, and
 * Not now hiding one for this person with Undo bringing it back.
 *
 * The first test only reads, on Pulse Fitness (a film set no test writes
 * to, with Insights on; Rye & Co. has none):
 * whichever its seed gives today, the card or the one line that says there
 * is nothing to suggest. Next is the screen's own and writes nothing.
 *
 * Not now writes, so it runs on Northwind as its owner. The API offers no
 * way to make a bill already 3 weeks late (an invoice is never issued
 * overdue), so it puts off the first suggestion Northwind has (its
 * products selling less, from the seed's 120 days of orders) and skips,
 * saying so, when there is none. Not now is per person and desk and phone
 * share the owner, so it is `@serial`, and it is always undone: by the
 * test's Undo, or by the clean-up when the test failed first.
 */

const PULSE = "seed_sc_pulse_org";

interface SuggestionRead {
    key: string;
    dismissible: boolean;
}

const card = (page: Page) =>
    page.getByRole("region", { name: "What to do next" });
const nothing = (page: Page) =>
    page.getByRole("region", { name: "Nothing to suggest right now." });
const place = (page: Page) => page.getByTestId("suggestion-place");
const title = (page: Page) => page.getByTestId("suggestion-title");

/** Nothing is wider than the screen; on a phone, nothing hides. */
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

/** On a phone every button on the card is a thumb's height. */
async function expectTouchTargets(page: Page) {
    if (!onPhone(page)) return;
    expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    const heights = await card(page)
        .locator("a, button")
        .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().height),
        );
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
}

test("one suggestion at a time, Next goes round them all (read only, Pulse)", async ({
    page,
}) => {
    await useSession(page);
    await page.goto(`${urls.APP_URL}/open/${PULSE}`);
    await page.goto(`${urls.APP_URL}/analytics`);
    await expect(
        page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();

    // Above the three answers: the card, or the one line saying none.
    await expect(card(page).or(nothing(page))).toBeVisible();
    if (await nothing(page).isVisible()) {
        await expect(nothing(page)).toContainText(
            "Suggestions show up when a class is nearly always full",
        );
        await expectNoSidewaysScroll(page);
        return;
    }

    await expect(card(page)).toContainText(/Why you're seeing this: /);
    await expectTouchTargets(page);
    if ((await place(page).count()) === 0) {
        // One alone: no count, no Next.
        await expect(
            card(page).getByRole("button", { name: "Next suggestion" }),
        ).toHaveCount(0);
        await expectNoSidewaysScroll(page);
        return;
    }
    await expect(place(page)).toHaveText(/^1 of \d+$/);
    const total = Number(
        (await place(page).textContent())?.match(/of (\d+)/)?.[1],
    );
    const first = await title(page).textContent();
    const next = card(page).getByRole("button", { name: "Next suggestion" });
    // The first press after the page is drawn waits for it to hydrate.
    await pressUntil(next, place(page).filter({ hasText: `2 of ${total}` }));
    for (let n = 3; n <= total; n++) {
        await next.click();
        await expect(place(page)).toHaveText(`${n} of ${total}`);
    }
    // Round again to the first.
    await next.click();
    await expect(place(page)).toHaveText(`1 of ${total}`);
    await expect(title(page)).toHaveText(first ?? "");
    await expectNoSidewaysScroll(page);
});

/** What Northwind's owner is suggested now, from the API. */
async function suggested(request: APIRequestContext) {
    const read = await northwind(request).get<{
        suggestions: SuggestionRead[];
    }>("/analytics/suggestions?period=4w");
    return read.suggestions;
}

let putOff: string | null = null;

test.afterEach(async ({ page }) => {
    // Never leave a suggestion hidden from the owner for a week.
    if (!putOff) return;
    await page.request.delete(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}/analytics/suggestions/${encodeURIComponent(putOff)}/not-now`,
        { headers: northwind(page.request).headers },
    );
    putOff = null;
});

test(
    "Not now hides it for 7 days with a toast, and Undo brings it back (Northwind)",
    { tag: "@serial" },
    async ({ page }) => {
        await useSession(page);
        await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
        const before = await suggested(page.request);
        const first = before.at(0);
        test.skip(
            !first?.dismissible,
            "Northwind has no suggestion that can be put off today",
        );
        if (!first) return;
        const key = first.key;

        await page.goto(`${urls.APP_URL}/analytics`);
        await expect(card(page)).toBeVisible();
        if (before.length > 1) {
            await expect(place(page)).toHaveText(`1 of ${before.length}`);
        }
        const shown = await title(page).textContent();

        const notNow = card(page).getByRole("button", { name: "Not now" });
        const toast = page.getByText("Hidden for 7 days.");
        putOff = key;
        await pressUntil(notNow, toast);

        // Gone from the card, and from what the API suggests.
        if (before.length > 1) {
            // Another suggestion takes its place.
            await expect(title(page)).toBeVisible();
            await expect(title(page)).not.toHaveText(shown ?? "");
            if (before.length > 2) {
                await expect(place(page)).toHaveText(
                    `1 of ${before.length - 1}`,
                );
            }
        } else {
            await expect(nothing(page)).toBeVisible();
        }
        await expect
            .poll(async () => (await suggested(page.request)).map((s) => s.key))
            .not.toContain(key);

        // Undo, on the toast: back where it was.
        await page.getByRole("button", { name: "Undo" }).click();
        await expect(page.getByText("Undone.")).toBeVisible();
        await expect(title(page)).toHaveText(shown ?? "");
        await expect
            .poll(async () => (await suggested(page.request)).map((s) => s.key))
            .toContain(key);
        putOff = null;
        await expectNoSidewaysScroll(page);
    },
);
