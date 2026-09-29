// @covers accounts:/login app:/open app:/ api:home api:orders api:bookings
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Home's inline actions (round 2, F4) on Northwind Supply, the generic dev
 * business: Rye & Co., Pulse and Kavi Dental are film sets and are only
 * read. A row that offers an action confirms in the row first and says
 * who is told; Mark sent then moves the order, and Undo within the hold
 * puts it back.
 *
 * Which rows offer what depends on the seed (an order ready to hand over,
 * an email provider for reminders), so each journey is skipped when
 * Northwind has no row for it rather than inventing one here.
 */

const NORTHWIND = "seed_org";

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`${urls.APP_URL}/open/${NORTHWIND}`);
}

/** Every row, opened past the first twelve when there are more. */
async function allRows(page: Page) {
    const needs = page.getByRole("region", { name: "Needs you" });
    await expect(needs).toBeVisible();
    const seeAll = needs.getByRole("button", { name: /^See all \d+$/ });
    if ((await seeAll.count()) > 0) await seeAll.click();
    return needs.getByRole("listitem");
}

test.describe("Home's inline actions (F4)", () => {
    test("Mark sent confirms in the row, and Undo puts the order back", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto("/");

        const rows = await allRows(page);
        const row = rows
            .filter({
                has: page.getByRole("button", {
                    name: "Mark sent",
                    exact: true,
                }),
            })
            .first();
        test.skip(
            (await row.count()) === 0,
            "Northwind has no order ready to hand over",
        );
        const title = (await row.getByRole("link").first().innerText()).split(
            "\n",
        )[0];

        await row
            .getByRole("button", { name: "Mark sent", exact: true })
            .click();
        const confirm = row.getByRole("alertdialog");
        await expect(confirm).toBeVisible();
        // It says who is told, or that nobody is, before anything happens.
        await expect(confirm).toContainText(
            /tells|sees that the order|Nothing is sent to/,
        );
        // Cancel closes it and nothing moved.
        await confirm.getByRole("button", { name: "Cancel" }).click();
        await expect(confirm).toHaveCount(0);

        await row
            .getByRole("button", { name: "Mark sent", exact: true })
            .click();
        await row
            .getByRole("alertdialog")
            .getByRole("button", { name: /^Mark sent/ })
            .click();
        await expect(row.getByText(/^Marked sent/)).toBeVisible();

        // Undo within the hold: the order is back, and its button with it.
        await row.getByRole("button", { name: "Undo" }).click();
        await expect(
            page
                .getByText(/^Undone\./)
                .locator("visible=true")
                .first(),
        ).toBeVisible();
        await page.reload();
        const again = (await allRows(page)).filter({ hasText: title }).first();
        await expect(
            again.getByRole("button", { name: "Mark sent", exact: true }),
        ).toBeVisible();
    });

    test("Send reminder says how it reaches them, and Cancel sends nothing", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/");
        const rows = await allRows(page);
        const row = rows
            .filter({
                has: page.getByRole("button", {
                    name: "Send reminder",
                    exact: true,
                }),
            })
            .first();
        test.skip(
            (await row.count()) === 0,
            "Northwind has no overdue invoice it can send",
        );
        await row
            .getByRole("button", { name: "Send reminder", exact: true })
            .click();
        const confirm = row.getByRole("alertdialog");
        await expect(confirm).toContainText(
            /This reminds .* (by email|in their account)/,
        );
        await confirm.getByRole("button", { name: "Cancel" }).click();
        await expect(confirm).toHaveCount(0);
    });

    test("no row shows a raw code, and the list never scrolls sideways", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/");
        const needs = page.getByRole("region", { name: "Needs you" });
        await expect(needs).toBeVisible();
        await expect(needs.getByText(/[A-Z]{3,}_[A-Z_]{3,}/)).toHaveCount(0);
        const doc = await page.evaluate(() => ({
            vw: window.innerWidth,
            sw: document.documentElement.scrollWidth,
        }));
        expect(doc.sw).toBeLessThanOrEqual(doc.vw);
    });
});
