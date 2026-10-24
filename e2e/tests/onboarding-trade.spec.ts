// @covers app:/onboarding app:/services api:organizations api:capabilities api:bookings
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import {
    answerFirst,
    answerKind,
    answerName,
    continueSetup,
    SETUP_QUESTIONS,
    setupHeading,
} from "../fixtures/walk-setup";

/**
 * Bookings' trade at setup (#1193, DEC-189, plan U16): with "Take bookings"
 * picked, setup asks what kind of place it is. Salon or Gym starts the
 * business with sample services, prices and hours to edit, in place of the
 * first service; Something else is Bookings as before. No other goal asks.
 *
 * As Asha (`founder`): each test that creates sets up a business of its own
 * with a stamped name, so nothing of the demo owner's is touched and it
 * runs beside everything else, desk and phone.
 */

const TRADE_QUESTION = "What kind of place is it?";
const SAMPLES_LINE = "Sample services, prices and hours will be ready to edit.";

const trades = (page: Page) =>
    page.getByRole("radiogroup", { name: TRADE_QUESTION });

function pickGoal(page: Page, goal: RegExp) {
    return page
        .getByRole("radiogroup", { name: SETUP_QUESTIONS.first })
        .getByRole("radio", { name: goal })
        .click();
}

/** Setup, as Asha, up to "What will you do first?". */
async function toFirst(page: Page, testInfo: TestInfo, prefix: string) {
    await useSession(page, "founder");
    await page.goto("/onboarding");
    await expect(page).toHaveTitle(/Set up Saroh/);
    await answerKind(page);
    const name = `${prefix} ${stamp(testInfo)}`;
    await answerName(page, { name });
    return name;
}

test.describe("setup asks a bookings business its trade (DEC-189)", () => {
    test("only Take bookings asks, and Back keeps the answer", async ({
        page,
    }, testInfo) => {
        await toFirst(page, testInfo, "Trade Question");

        await pickGoal(page, /^Sell things/);
        await expect(trades(page)).toHaveCount(0);

        await pickGoal(page, /^Take bookings/);
        await expect(trades(page).getByRole("radio")).toHaveText([
            "Salon",
            "Gym",
            "Something else",
        ]);
        await expect(page.getByText(SAMPLES_LINE)).toHaveCount(0);

        // 44px under a thumb on the phone.
        const box = await trades(page).getByRole("radio").first().boundingBox();
        if (testInfo.project.name.startsWith("phone")) {
            expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }

        await trades(page).getByRole("radio", { name: "Gym" }).click();
        await expect(page.getByText(SAMPLES_LINE)).toBeVisible();

        // Back to the step before, and on again: the trade is kept.
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(setupHeading(page, SETUP_QUESTIONS.first)).toHaveCount(0);
        await continueSetup(page);
        const billing = setupHeading(page, SETUP_QUESTIONS.billing);
        await expect(
            billing.or(setupHeading(page, SETUP_QUESTIONS.first)),
        ).toBeVisible();
        if (await billing.isVisible()) await continueSetup(page);
        await expect(
            trades(page).getByRole("radio", { name: "Gym" }),
        ).toHaveAttribute("aria-checked", "true");
        await expect(page.getByText(SAMPLES_LINE)).toBeVisible();

        // The page never scrolls sideways.
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);
    });

    test("Salon: the business opens on its sample services", async ({
        page,
    }, testInfo) => {
        await toFirst(page, testInfo, "Trade Salon");
        await pickGoal(page, /^Take bookings/);
        await trades(page).getByRole("radio", { name: "Salon" }).click();
        await expect(page.getByText(SAMPLES_LINE)).toBeVisible();

        await answerFirst(page);
        await expect(page).toHaveURL(/\/services(?:\?|$)/);
        await expect(
            page.getByRole("button", { name: "Keep Women's haircut & finish" }),
        ).toBeVisible();
    });

    test("Something else: Bookings as before, a new service to make", async ({
        page,
    }, testInfo) => {
        await toFirst(page, testInfo, "Trade Other");
        await pickGoal(page, /^Take bookings/);
        await trades(page)
            .getByRole("radio", { name: "Something else" })
            .click();
        await expect(page.getByText(SAMPLES_LINE)).toHaveCount(0);

        await answerFirst(page);
        await expect(page).toHaveURL(/\/services\/new/);
    });
});
