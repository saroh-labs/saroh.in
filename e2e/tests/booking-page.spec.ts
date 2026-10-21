// @covers app:/open app:/services api:sites api:capabilities api:bookings api:admin site:/book
import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeBusiness } from "../fixtures/own-business";
import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * A booking page on the business's address without building a website
 * (DEC-175, #1158), on desk and phone.
 *
 * Turning Bookings on, with no website, makes the starter site on the
 * business's address with its Book page, and nothing is live:
 * `<address>.<renderer>/book` is a 404 and Bookings › Services says "Not
 * live yet: customers can't open it", with no link to copy and no QR code.
 * Publish booking page opens a sheet that publishes it and finishes there,
 * with the link; `/book` then serves.
 *
 * It runs on a business the test sets up for itself (`makeBusiness`, as
 * Asha), so Northwind's one site is never touched and desk and phone each
 * have their own. A business set up here has no module rolled out (the
 * seed's overrides reach only its own businesses), so Sam, Saroh staff,
 * rolls Contacts, Bookings and Website out to it from the console's API,
 * as an operator would.
 */

const MODULES = ["CRM", "APPOINTMENTS", "WEBSITE"] as const;

/** Sam rolls the modules out to the business, in a context of his own. */
async function rollOut(browser: Browser, orgId: string, testInfo: TestInfo) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        for (const key of MODULES) {
            const res = await staff.request.put(
                `${urls.API_URL}/admin/flags/MODULE_${key}/organizations/${orgId}`,
                {
                    headers: { origin: urls.APP_URL },
                    data: {
                        enabled: true,
                        reason: "Booking page browser test (DEC-175)",
                        idempotencyKey: `bkpg-${key}-${stamp(testInfo)}`,
                    },
                },
            );
            expect(res.ok(), `roll out ${key}: ${await res.text()}`).toBe(true);
        }
    } finally {
        await context.close();
    }
}

/** Turn a module on with its setup, as the Turn on sheet does. */
async function turnOn(page: Page, orgId: string, key: string, setup: object) {
    const res = await page.request.put(
        `${urls.API_URL}/organizations/${orgId}/modules/${key}`,
        {
            headers: { origin: urls.APP_URL },
            data: { status: "ENABLED", setup },
        },
    );
    expect(res.ok(), `turn on ${key}: ${await res.text()}`).toBe(true);
}

/** The business's own address on this stack's renderer. */
function bookUrl(address: string): string {
    const renderer = new URL(urls.RENDERER_URL);
    return `${renderer.protocol}//${address}.${renderer.host}/book`;
}

test("Bookings makes the booking page, and Publish booking page puts it live", async ({
    page,
    browser,
}, testInfo) => {
    const business = await makeBusiness(page, testInfo, "bkpg");
    await rollOut(browser, business.id, testInfo);
    await turnOn(page, business.id, "CRM", {});
    await turnOn(page, business.id, "APPOINTMENTS", {
        hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            open: "10:00",
            close: "19:00",
        })),
        service: { name: "Physio session", durationMinutes: 45, price: "800" },
    });

    // Made, not live: customers can't open it yet.
    const before = await page.request.get(bookUrl(business.address), {
        maxRedirects: 0,
    });
    expect(before.status()).toBe(404);

    await page.goto(`/open/${business.id}`);
    await page.goto("/services");
    const row = page.locator("[data-booking-link]");
    await expect(row).toHaveAttribute("data-booking-link", "draft");
    await expect(row).toContainText("Your booking page");
    await expect(row).toContainText(`${business.address}.`);
    await expect(row).toContainText("Not live yet: customers can't open it");
    // Honest until live: nothing to copy, no code to print.
    await expect(row.getByRole("button", { name: "Copy link" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: /QR code/ })).toHaveCount(0);

    // Nothing spills sideways at either size.
    const width = page.viewportSize()?.width ?? 0;
    await expect
        .poll(() =>
            page.evaluate(() => ({
                scroll: document.documentElement.scrollWidth,
                inner: window.innerWidth,
            })),
        )
        .toEqual({ scroll: width, inner: width });

    // One press opens the sheet; one more publishes, and it ends on the link.
    const sheet = page.getByRole("dialog", {
        name: "Publish your booking page",
    });
    await pressUntil(
        row.getByRole("button", { name: "Publish booking page" }),
        sheet,
    );
    await expect(sheet).toContainText("Your website goes live with it");
    await sheet.getByRole("button", { name: "Publish booking page" }).click();
    const done = page.getByRole("dialog", {
        name: "Your booking page is live",
    });
    await expect(done).toBeVisible();
    await expect(done.getByRole("button", { name: "Copy link" })).toBeVisible();
    await done.getByRole("button", { name: "Done" }).click();
    await expect(done).toBeHidden();

    // The row is live, with its link to share.
    await expect(row).toHaveAttribute("data-booking-link", "live");
    await expect(row.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(
        row.getByRole("link", { name: new RegExp(`${business.address}\\.`) }),
    ).toBeVisible();

    // And customers can open it.
    await expect
        .poll(
            async () =>
                (await page.request.get(bookUrl(business.address))).status(),
            { timeout: 20_000 },
        )
        .toBe(200);
});
