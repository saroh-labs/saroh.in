// @covers accounts:/login app:/open app:/ app:/analytics app:/settings/organization api:home api:organizations
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { needsYou } from "../fixtures/home";
import { pressUntil } from "../fixtures/press";
import { onPhone, openNorthwindAs } from "../fixtures/roles";

/**
 * Home A at a desk (DEC-171, plan U6, #1083): today at a glance in tiles,
 * Needs you grouped by kind with Today beside it, and How it's going (the
 * last 7 days against the 7 before) leading into Insights on 4 weeks. A
 * role without money sees three tiles and no amount anywhere.
 *
 * On a phone (below 640px) the simplified phone Home (U17) is drawn
 * instead; `home-phone.spec.ts` checks it, and this only that nothing
 * there scrolls sideways at 320 and 390.
 *
 * Everyone is on Northwind and only reads: no group's rows are acted on
 * here (`home.spec.ts` does that, `@serial`).
 */

const tiles = (page: Page) =>
    page.getByRole("list", { name: "Today at a glance" });

const going = (page: Page) =>
    page.getByRole("region", { name: "How it's going" });

/** Whether a page sideways-scrolls past the width the test set. */
async function noSideways(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    await expect
        .poll(() =>
            page.evaluate(() => ({
                vw: window.innerWidth,
                sw: document.documentElement.scrollWidth,
            })),
        )
        .toEqual({ vw: width, sw: width });
}

async function box(locator: Locator) {
    const b = await locator.boundingBox();
    if (!b) throw new Error("not drawn on the page");
    return b;
}

test.describe("Home A at a desk", () => {
    test.beforeEach(({ page }) => {
        test.skip(onPhone(page), "Home A's desk layout; the phone is below");
    });

    test("tiles, Needs you with Today beside it, and How it's going into Insights", async ({
        page,
    }) => {
        await openNorthwindAs(page, "owner");
        await page.goto("/");

        // Today at a glance: four tiles for an owner, each a link.
        const list = tiles(page);
        await expect(list).toBeVisible();
        const links = list.getByRole("link");
        await expect(links).toHaveCount(4);
        for (const label of [
            "Bookings today",
            "To pack or hand over",
            "Money in today",
            "Came",
        ]) {
            await expect(list).toContainText(label);
        }
        // A figure is never a bare 0: zero is said in words.
        await expect(list.getByText(/^0$/)).toHaveCount(0);

        // Needs you leads the work; Today sits beside it at 1440.
        const needs = needsYou(page);
        await expect(needs).toBeVisible();
        const today = page.getByRole("region", { name: "Today" });
        if ((await today.count()) > 0) {
            const [n, t] = [await box(needs), await box(today)];
            expect(t.x, "Today is beside Needs you").toBeGreaterThan(
                n.x + n.width - 1,
            );
            expect(Math.abs(t.y - n.y)).toBeLessThan(40);
        }

        // Each group opens its rows in place, and closes again.
        const show = needs
            .getByRole("button", { name: "Show the rows" })
            .first();
        if ((await show.count()) > 0) {
            const group = needs.locator("[data-need-group]").first();
            await pressUntil(
                group.getByRole("button", { name: "Show the rows" }),
                group.getByRole("button", { name: "Hide the rows" }),
            );
            await expect(
                group.getByRole("button", { name: "Hide the rows" }),
            ).toHaveAttribute("aria-expanded", "true");
            await group.getByRole("button", { name: "Hide the rows" }).click();
            await expect(
                group.getByRole("button", { name: "Show the rows" }),
            ).toHaveAttribute("aria-expanded", "false");
        }

        // How it's going: the last 7 days against the 7 before, never a
        // week that just started against a whole one.
        const how = going(page);
        test.skip(
            (await how.count()) === 0,
            "Nothing sold, booked or paid on Northwind yet",
        );
        await expect(how).toContainText(
            /The last 7 days, .+ compared with the 7 days before/,
        );
        await expect(how).not.toContainText(/last week|this week/i);
        const month = how.getByRole("link", { name: "See how the month went" });
        await expect(month).toHaveAttribute("href", "/analytics?period=4w");
        await month.click();
        await expect(page).toHaveURL(/\/analytics\?period=4w$/);

        await noSideways(page);
    });

    test("a Member sees three tiles and no amount anywhere", async ({
        page,
    }) => {
        await openNorthwindAs(page, "northwindMember");
        await page.goto("/");
        const list = tiles(page);
        await expect(list).toBeVisible();
        await expect(list).not.toContainText("Money in today");
        await expect(list).not.toContainText("₹");
        await expect(needsYou(page)).not.toContainText("₹");
        const how = going(page);
        if ((await how.count()) > 0) {
            await expect(how).not.toContainText("₹");
            // Insights isn't open to a Member: no way in from Home.
            await expect(
                how.getByRole("link", { name: "See how the month went" }),
            ).toHaveCount(0);
        }
        await noSideways(page);
    });

    test("the setup line hides, and Settings › Business brings it back", async ({
        page,
    }) => {
        await openNorthwindAs(page, "owner");
        await page.goto("/");
        await expect(needsYou(page)).toBeVisible();
        const setup = page
            .locator('[data-setup-checklist="home"]')
            .filter({ visible: true });
        test.skip(
            (await setup.count()) === 0,
            "Northwind's setup is finished, or folded",
        );
        const hide = setup.getByRole("button", { name: "Hide for now" });
        test.skip((await hide.count()) === 0, "Nothing to hide here");
        // Only this browser's: hiding writes nothing to the business.
        await pressUntil(hide, page.getByRole("button", { name: "Undo" }));
        await expect(
            page.getByRole("button", { name: "Hide for now" }),
        ).toHaveCount(0);

        await page.goto("/settings/organization");
        const back = page.getByRole("link", { name: "Show setup on Home" });
        await expect(back).toBeVisible();
        await back.click();
        await expect(page).toHaveURL(/\/$/);
        await expect(
            page.getByRole("button", { name: "Hide for now" }).first(),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Show setup on Home" }),
        ).toHaveCount(0);
    });
});

test.describe("Home on a phone", () => {
    test.beforeEach(({ page }) => {
        test.skip(!onPhone(page), "The phone's Home");
    });

    // The simplified phone Home itself is `home-phone.spec.ts` (U17).
    for (const size of [
        { width: 320, height: 640 },
        { width: 390, height: 844 },
    ]) {
        test(`nothing scrolls sideways at ${size.width}, and Needs you is there`, async ({
            page,
        }) => {
            await openNorthwindAs(page, "owner");
            await page.setViewportSize(size);
            await page.goto("/");
            await expect(needsYou(page)).toBeVisible();
            // Home A's desk tiles are not drawn below 640px: the phone's
            // figures are one row of three links.
            await expect(
                tiles(page).filter({ visible: true }).getByRole("link"),
            ).toHaveCount(3);
            await expect(
                page
                    .getByText("To pack or hand over")
                    .filter({ visible: true }),
            ).toHaveCount(0);
            await noSideways(page);
            await expectNothingHiddenSideways(page);
        });
    }
});
