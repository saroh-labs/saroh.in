// @covers app:/open app:/settings/integrations app:/settings/integrations/google-calendar api:calendar-sync api:feature-flags
import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Settings › Integrations › Google Calendar (boards GC2Entry, GC2Connected,
 * GC2AccountSheet, GC2Disconnect, GC2Disconnected; DEC-233), desk and
 * phone, as Tara (Calendar only on Northwind, on the diary): Providers is
 * her tab only for her calendar, and Connect there goes straight to Google.
 *
 * The stack's API runs Google on an in-memory fake (`GOOGLE_CALENDAR_FAKE`,
 * `calendar-sync/google/fake-google-calendar.ts`): its consent page is an
 * address nobody serves, so the test answers it the way Google would,
 * sending the browser back to the API's callback with a code and the same
 * state. The account is always `meera@example.com`.
 *
 * The `GOOGLE_CALENDAR` switch is turned on for Northwind as staff do, and
 * off again after, so every other spec reads Northwind as it was: `@serial`.
 */

const FAKE_CONSENT = "https://accounts.example.com/consent**";

async function setSwitch(
    browser: Browser,
    enabled: boolean,
    testInfo: TestInfo,
): Promise<void> {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        const res = await staff.request.put(
            `${urls.API_URL}/admin/flags/GOOGLE_CALENDAR/organizations/${NORTHWIND_ORG}`,
            {
                headers: { origin: urls.ADMIN_URL },
                data: {
                    enabled,
                    reason: "Browser test of Google Calendar",
                    idempotencyKey: `GOOGLE_CALENDAR-${enabled}-${stamp(testInfo)}`,
                },
            },
        );
        expect(res.ok(), `switch ${enabled}: ${await res.text()}`).toBe(true);
    } finally {
        await context.close();
    }
}

/** Google's consent, answered: straight back to the callback, as allowed. */
async function answerConsent(page: Page) {
    await page.route(FAKE_CONSENT, async (route) => {
        const asked = new URL(route.request().url());
        const back = new URL(asked.searchParams.get("redirect_uri") ?? "");
        back.searchParams.set("code", "e2e");
        back.searchParams.set("state", asked.searchParams.get("state") ?? "");
        await route.fulfill({
            status: 302,
            headers: { location: back.toString() },
        });
    });
}

/** Leaves Tara with nothing connected, whatever an earlier run left. */
async function disconnectAll(page: Page) {
    const res = await page.request.delete(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}/calendar/google`,
        { headers: { origin: urls.APP_URL } },
    );
    expect(res.ok(), `disconnect: ${await res.text()}`).toBe(true);
}

test.describe("Settings › Google Calendar", { tag: "@serial" }, () => {
    test("connect, read the account's sheet, disconnect and say what stays", async ({
        browser,
        page,
        isMobile,
    }, testInfo) => {
        await setSwitch(browser, true, testInfo);
        try {
            await useSession(page, "calendarOnly");
            await page.goto(`/open/${NORTHWIND_ORG}`);
            await disconnectAll(page);
            await answerConsent(page);

            await page.goto("/settings/integrations");
            const main = page.getByRole("main");
            // The tab is there while the switch is on, though she manages
            // none of the business's providers: only her calendar's row.
            await expect(
                page.getByRole("link", { name: /^Integrations/ }).first(),
            ).toBeVisible();
            const row = main.getByTestId("google-calendar-row");
            await expect(row.getByText("Not connected")).toBeVisible();

            // Connect from the row; Google sends her back through the old
            // address to the page under Providers, which says so once.
            const connect = row.getByRole("button", {
                name: "Connect Google Calendar",
            });
            const connected = main.getByText("Google Calendar connected");
            await pressUntil(connect, connected);
            await expect(
                main.getByRole("heading", {
                    name: "Google Calendar",
                    level: 1,
                }),
            ).toBeVisible();
            await expect(page).toHaveURL(
                /\/settings\/integrations\/google-calendar/,
            );
            // Said once: the outcome leaves the address.
            await expect(page).not.toHaveURL(/calendar=connected/);

            const account = main.getByRole("button", {
                name: /meera@example\.com: Connected/,
            });
            await expect(account).toBeVisible();
            await expect(main.getByText(/^New bookings go on/)).toBeVisible();
            // The plan's allowance is never a number on the page (DEC-233).
            await expect(main.getByText(/\d+ (Google )?accounts?/)).toHaveCount(
                0,
            );

            if (isMobile) {
                expect(
                    await page.evaluate(
                        () => matchMedia("(pointer: coarse)").matches,
                    ),
                ).toBe(true);
                const box = await account.boundingBox();
                expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
                const width = page.viewportSize()?.width ?? 0;
                await expect
                    .poll(() =>
                        page.evaluate(() => ({
                            inner: window.innerWidth,
                            scroll: document.documentElement.scrollWidth,
                        })),
                    )
                    .toEqual({ inner: width, scroll: width });
                await expectNothingHiddenSideways(page);
            }

            // The account's sheet: its calendars to block busy times.
            await account.click();
            const sheet = page.getByRole("dialog", {
                name: "meera@example.com",
            });
            await expect(sheet).toBeVisible();
            await expect(sheet.getByText("Family")).toBeVisible();
            await sheet
                .getByRole("button", { name: "Disconnect this account" })
                .click();

            const confirm = page.getByRole("alertdialog", {
                name: "Disconnect meera@example.com?",
            });
            await expect(confirm.getByText("Stays")).toBeVisible();
            await confirm.getByRole("button", { name: "Disconnect" }).click();

            await expect(main.getByText("Disconnected")).toBeVisible();
            await expect(
                main.getByRole("button", { name: "Connect Google Calendar" }),
            ).toBeVisible();
            await expect(
                main.getByText(/Connect meera@example\.com again/),
            ).toBeVisible();
        } finally {
            await setSwitch(browser, false, testInfo);
        }
    });

    test("is not there at all while the switch is off", async ({ page }) => {
        await useSession(page, "calendarOnly");
        await page.goto(`/open/${NORTHWIND_ORG}`);
        await page.goto("/settings/profile");
        await expect(
            page.getByRole("main").getByRole("heading", { level: 1 }),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: /^Integrations/ }),
        ).toHaveCount(0);
        await page.goto("/settings/integrations/google-calendar");
        await expect(
            page.getByRole("heading", { name: "Page not found" }),
        ).toBeVisible();
    });
});
