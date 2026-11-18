// @covers app:/social app:/social/new api:social api:share-posts api:admin
import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Saroh Social on Northwind (plan saroh-social U9, U10; boards
 * BSocialHomeSocialDesk, BSocialDesk), desk and phone, on the stack's
 * in-memory Meta (`SOCIAL_FAKE=1`): Channels draws three rows; Connect
 * Instagram explains what it needs, goes to "Meta" and comes back
 * connected; a post written in Create post is scheduled at the good time
 * and opens in its sheet, scheduled to Instagram; deleting it and
 * disconnecting put Northwind back.
 *
 * @serial: Sam, Saroh staff, rolls `MODULE_SOCIAL` out to Northwind, which
 * changes its Social page for everyone, and takes it back at the end.
 * Northwind is on the seed's Pro, which includes Saroh Social.
 */

async function rollOut(
    browser: Browser,
    enabled: boolean,
    testInfo: TestInfo,
): Promise<void> {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        const res = await staff.request.put(
            `${urls.API_URL}/admin/flags/MODULE_SOCIAL/organizations/${NORTHWIND_ORG}`,
            {
                headers: { origin: urls.APP_URL },
                data: {
                    enabled,
                    reason: "Saroh Social browser test (U9)",
                    idempotencyKey: `social-${enabled ? "on" : "off"}-${stamp(testInfo)}`,
                },
            },
        );
        expect(res.ok(), `MODULE_SOCIAL: ${await res.text()}`).toBe(true);
    } finally {
        await context.close();
    }
}

/** Disconnect Instagram, whatever an earlier attempt or this one left. */
async function disconnect(page: Page) {
    const res = await page.request.delete(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}/social/channels/instagram`,
        { headers: { origin: urls.APP_URL } },
    );
    expect(res.ok(), `disconnect: ${await res.text()}`).toBe(true);
}

// Set up and put back in hooks: a retry starts clean even when the attempt
// before it ran out of time, and afterEach gets its own time after a timeout.
test.beforeEach(async ({ page, browser }, testInfo) => {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    await rollOut(browser, true, testInfo);
    await disconnect(page);
});

test.afterEach(async ({ page, browser }, testInfo) => {
    await disconnect(page);
    await rollOut(browser, false, testInfo);
});

test(
    "connects Instagram and schedules a post at the good time",
    { tag: "@serial" },
    async ({ page }, testInfo) => {
        await page.goto("/social?tab=channels");
        const instagram = page.locator("[data-channel=INSTAGRAM]");
        await expect(instagram).toHaveAttribute(
            "data-channel-state",
            "NOT_CONNECTED",
        );
        await expect(page.locator("[data-channel]")).toHaveCount(3);

        // What it needs, said before "Meta"; Continue goes there and back.
        const sheet = page.locator("[data-connect-needs=INSTAGRAM]");
        await pressUntil(
            page.locator("[data-connect=INSTAGRAM]").filter({ visible: true }),
            sheet,
        );
        await expect(sheet).toContainText("Business or Creator");
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "Continue" })
            .click();
        await page.waitForURL(/result=connected/);
        await expect(
            page.locator("[data-connect-result=connected]"),
        ).toContainText("Instagram is connected.");
        await expect(instagram).toHaveAttribute(
            "data-channel-state",
            "CONNECTED",
        );

        // A post of its own words, scheduled at the good time.
        await page.goto("/social/new?own=text");
        // Words typed before hydration are lost when the phone layout
        // takes over from the server's: type until the post is saved.
        const headline = page
            .locator("[data-own-headline]")
            .filter({ visible: true });
        const words = `Open late ${stamp(testInfo)}`.slice(0, 40);
        await expect(async () => {
            if ((await headline.inputValue()) !== words)
                await headline.fill(words);
            await expect(page.locator("[data-own-no-cards]")).toHaveCount(0, {
                timeout: 3_000,
            });
        }).toPass({ timeout: 20_000 });
        const panel = page
            .locator("[data-social-panel]")
            .filter({ visible: true });
        await expect(
            panel.locator("[data-post-to=INSTAGRAM] [role=switch]"),
        ).toHaveAttribute("aria-checked", "true");
        // Nothing on the composer runs past the screen: a phone that has
        // to zoom out can't reach the sheet's buttons after it (CI, 18 Nov).
        await expect
            .poll(() => page.evaluate(() => window.innerWidth))
            .toBe(page.viewportSize()?.width);
        await panel.locator("[data-schedule-good]").click();
        await page.waitForURL(/\/social\?post=/);
        const opened = page.locator("[data-post-sheet]");
        await expect(opened).toBeVisible();
        await expect(
            opened.locator("[data-delivery=INSTAGRAM]"),
        ).toHaveAttribute("data-delivery-status", "WAITING");

        await expect
            .poll(() => page.evaluate(() => window.innerWidth))
            .toBe(page.viewportSize()?.width);

        // Delete it: it was never posted.
        await page.locator("[data-post-action=delete]").click();
        await page
            .getByRole("alertdialog")
            .getByRole("button", { name: "Delete post" })
            .click();
        await expect(opened).toHaveCount(0);
    },
);
