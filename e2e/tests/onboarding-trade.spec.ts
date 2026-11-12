// @covers app:/onboarding app:/services api:organizations api:capabilities api:bookings
import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import {
    answerFirst,
    answerKind,
    answerName,
    SETUP_QUESTIONS,
} from "../fixtures/walk-setup";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * The kind of place at setup (DEC-216, TPLD1; DEC-189): setup's first step
 * asks a business "What kind of place is it?" with the gallery's trades,
 * and the business keeps the answer. Bookings reads it rather than asking
 * again: Salon or Gym starts the business with sample services, prices and
 * hours to edit, in place of the first service; another trade is Bookings
 * as before. A template picked in the gallery (`?template=`) starts setup
 * on its trade.
 *
 * As Asha (`founder`): each test that creates sets up a business of its own
 * with a stamped name, so nothing of the demo owner's is touched.
 *
 * The seed rolls modules out per business, so a business made here has none
 * and setup rightly says Bookings "isn't on offer". The tests that create
 * turn CRM and Bookings on for everyone first, as Sam would in admin →
 * Flags, and put them back after: @serial, so nothing runs beside them.
 */

/** CRM and Bookings rolled out to every business, then put back (Sam). */
const ROLLOUT = ["MODULE_CRM", "MODULE_APPOINTMENTS"] as const;

async function rollOutForEveryone(browser: Browser, testInfo: TestInfo) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    const staff = await context.newPage();
    await useSession(staff, "staff");
    const headers = { origin: urls.APP_URL };
    const set = async (flag: string, enabled: boolean, what: string) => {
        const res = await staff.request.put(
            `${urls.API_URL}/admin/flags/${flag}`,
            {
                headers,
                data: {
                    enabled,
                    reason: "Browser test: setup's Bookings path (DEC-189)",
                    idempotencyKey: `trade-${flag}-${what}-${stamp(testInfo)}`,
                },
            },
        );
        expect(res.ok(), await res.text()).toBe(true);
    };
    const before = new Map<string, boolean>();
    for (const flag of ROLLOUT) {
        const res = await staff.request.get(
            `${urls.API_URL}/admin/flags/${flag}/explain`,
            { headers },
        );
        expect(res.ok(), await res.text()).toBe(true);
        before.set(flag, ((await res.json()) as { value: boolean }).value);
        await set(flag, true, "on");
    }
    return async () => {
        for (const flag of ROLLOUT)
            await set(flag, before.get(flag) ?? false, "back");
        await context.close();
    };
}

const TRADE_QUESTION = "What kind of place is it?";
const TRADE_LINE =
    "Saroh suggests a website for it. A salon or gym also gets sample services to edit.";

const trades = (page: Page) =>
    page.getByRole("radiogroup", { name: TRADE_QUESTION });

function pickGoal(page: Page, goal: RegExp) {
    return page
        .getByRole("radiogroup", { name: SETUP_QUESTIONS.first })
        .getByRole("radio", { name: goal })
        .click();
}

/** Setup, as Asha, at its first step. */
async function openSetup(page: Page, query = "") {
    await useSession(page, "founder");
    await page.goto(`/onboarding${query}`);
    await expect(page).toHaveTitle(/Set up Saroh/);
}

/** From the first step, with `trade` picked, to "What will you do first?". */
async function toFirst(
    page: Page,
    testInfo: TestInfo,
    prefix: string,
    trade: string,
) {
    await openSetup(page);
    await trades(page).getByRole("radio", { name: trade }).click();
    await answerKind(page);
    const name = `${prefix} ${stamp(testInfo)}`;
    await answerName(page, { name });
    return name;
}

test.describe("setup asks a business its kind of place (DEC-216)", () => {
    test("the first step asks a business, Just me isn't asked, and Back keeps the answer", async ({
        page,
    }, testInfo) => {
        await openSetup(page);
        await expect(trades(page).getByRole("radio")).toHaveText([
            "Salon",
            "Gym or studio",
            "Clinic",
            "Dietician or coach",
            "Bakery or food",
            "Shop",
            "Something else",
        ]);
        await expect(page.getByText(TRADE_LINE)).toBeVisible();

        // 44px under a thumb on the phone.
        const box = await trades(page).getByRole("radio").first().boundingBox();
        if (testInfo.project.name.startsWith("phone")) {
            expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }

        await page
            .getByRole("radiogroup", { name: SETUP_QUESTIONS.kind })
            .getByRole("radio", { name: /^Just me/ })
            .click();
        await expect(trades(page)).toHaveCount(0);
        await page
            .getByRole("radiogroup", { name: SETUP_QUESTIONS.kind })
            .getByRole("radio", { name: /^A business/ })
            .click();

        await trades(page).getByRole("radio", { name: "Clinic" }).click();
        await answerKind(page);
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(
            trades(page).getByRole("radio", { name: "Clinic" }),
        ).toHaveAttribute("aria-checked", "true");

        // The page never scrolls sideways.
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);
    });

    test("a template picked in the gallery starts on its trade", async ({
        page,
    }) => {
        await openSetup(page, "?template=salon");
        await expect(
            page.getByText(/You picked the Salon template/),
        ).toBeVisible();
        await expect(
            trades(page).getByRole("radio", { name: "Salon" }),
        ).toHaveAttribute("aria-checked", "true");
    });

    test(
        "Salon: the business opens on its sample services",
        { tag: "@serial" },
        async ({ page, browser }, testInfo) => {
            const putBack = await rollOutForEveryone(browser, testInfo);
            try {
                await toFirst(page, testInfo, "Trade Salon", "Salon");
                // Asked once: the last step doesn't ask again.
                await pickGoal(page, /^Take bookings/);
                await expect(trades(page)).toHaveCount(0);

                await answerFirst(page);
                await expect(page).toHaveURL(/\/services(?:\?|$)/);
                await expect(
                    page.getByRole("button", {
                        name: "Keep Women's haircut & finish",
                    }),
                ).toBeVisible();
            } finally {
                await putBack();
            }
        },
    );

    test(
        "Something else: Bookings as before, a new service to make",
        { tag: "@serial" },
        async ({ page, browser }, testInfo) => {
            const putBack = await rollOutForEveryone(browser, testInfo);
            try {
                await toFirst(page, testInfo, "Trade Other", "Something else");
                await pickGoal(page, /^Take bookings/);
                await answerFirst(page);
                await expect(page).toHaveURL(/\/services\/new/);
            } finally {
                await putBack();
            }
        },
    );
});
