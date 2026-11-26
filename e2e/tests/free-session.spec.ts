// @covers site:/book app:/open app:/bookings/all app:/services api:bookings api:site-accounts pkg:site-blocks
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import { asNewVisitor, nameThenBook, signInOnSheet } from "./site-codes";

/**
 * A free session end to end (DEC-261): a service set to Free is booked on
 * the merchant's booking page with no payment step and no word about
 * paying, and the team's Bookings List says "Free" for it, never
 * "Awaiting payment" or "Pays at the visit".
 *
 * Owns its data on Northwind: a free service made for this test (online,
 * so opening hours never refuse a time; open all day, every day), booked
 * once by a new account, archived again at the end. Screenshots of each
 * screen go to the test's own output folder.
 */

function siteFor(subdomain: string): string {
    const renderer = new URL(urls.RENDERER_URL);
    return `${renderer.protocol}//${subdomain}.${renderer.host}`;
}
const NORTHWIND = siteFor("northwind");

/** "2026-10-27" and "11:00" for an instant, in Kolkata. */
function inKolkata(iso: string): { date: string; time: string } {
    const at = new Date(iso);
    const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(at);
    const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(at);
    return { date, time };
}

/** The owner, in a context of their own: the visitor's page stays theirs. */
async function ownerPage(
    browser: Browser,
    viewport: { width: number; height: number } | null,
): Promise<{
    page: Page;
    request: APIRequestContext;
    close: () => Promise<void>;
}> {
    const context = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
        ...(viewport ? { viewport } : {}),
    });
    const page = await context.newPage();
    await useSession(page, "owner");
    return { page, request: page.request, close: () => context.close() };
}

test.describe("a free session (DEC-261)", () => {
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("is booked on the booking page with no payment step, and the List says Free", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        const own = stamp(testInfo);
        const owner = await ownerPage(browser, page.viewportSize());
        const nw = northwind(owner.request);
        const name = `E2E Free trial ${own}`;
        const made = await nw.post<{ id: string }>("/services", {
            name,
            durationMinutes: 30,
            priceCents: 0,
            currency: "INR",
            timezone: "Asia/Kolkata",
            locationType: "ONLINE",
            meetingUrl: "https://meet.example.com/e2e-free",
            showOnBookingPage: true,
            bookableByTeam: true,
        });
        const shot = (file: string, on: Page = page) =>
            on.screenshot({ path: testInfo.outputPath(file), fullPage: false });
        try {
            await nw.put(`/services/${made.id}/rules`, {
                rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                    dayOfWeek,
                    startMinute: 0,
                    endMinute: 1440,
                })),
            });
            // Two days on, 11:00 in Kolkata: inside the booking window.
            const day = new Date();
            day.setUTCHours(5, 30, 0, 0);
            day.setUTCDate(day.getUTCDate() + 2);
            const { date, time } = inKolkata(day.toISOString());

            // The booking page: Free where the price would be, and no way
            // to pay asked.
            await page.goto(
                `${NORTHWIND}/book?service=${made.id}&date=${date}&start=${time}`,
            );
            await expect(
                page.getByRole("button", {
                    name: `Edit what you're booking, ${name}`,
                }),
            ).toBeVisible({ timeout: 15_000 });
            await expect(
                page
                    .getByText("Free", { exact: true })
                    .filter({ visible: true })
                    .first(),
            ).toBeVisible();
            await expect(
                page.getByRole("radio", { name: /Pay at the desk|Pay ₹/ }),
            ).toHaveCount(0);
            await expect(page.getByText(/₹0/)).toHaveCount(0);
            await shot(`booking-page-${testInfo.project.name}.png`);

            // Signed in at the last step, named, booked: nothing to pay.
            await page
                .getByRole("button", { name: "Continue to sign in" })
                .filter({ visible: true })
                .first()
                .click();
            await signInOnSheet(page, `free-${own}@example.com`.toLowerCase());
            await nameThenBook(page, `Tara ${own}`);
            await expect(
                page.getByRole("heading", { name: /You're booked/ }),
            ).toBeVisible({ timeout: 30_000 });
            await expect(
                page.getByText("It's free. There's nothing to pay."),
            ).toBeVisible();
            await expect(
                page.getByText(/front desk|pay at the|pay later/i),
            ).toHaveCount(0);
            await shot(`confirmation-${testInfo.project.name}.png`);

            // The team's List: Free, never owing.
            await owner.page.goto(`/open/${NORTHWIND_ORG}`);
            await owner.page.goto("/bookings/all");
            await owner.page
                .getByRole("button", { name: "Search bookings" })
                .click();
            await owner.page.getByPlaceholder("Search bookings").fill(own);
            await owner.page.getByPlaceholder("Search bookings").press("Enter");
            const row = owner.page
                .getByRole("button", { name: new RegExp(`More for .*${own}`) })
                .filter({ visible: true });
            await expect(row).toBeVisible({ timeout: 15_000 });
            await expect(
                owner.page
                    .getByText("Free", { exact: true })
                    .filter({ visible: true })
                    .first(),
            ).toBeVisible();
            for (const owing of ["Awaiting payment", "Pays at the visit"]) {
                await expect(
                    owner.page
                        .locator("main")
                        .getByText(owing, { exact: true })
                        .filter({ visible: true }),
                ).toHaveCount(0);
            }
            await shot(
                `bookings-list-${testInfo.project.name}.png`,
                owner.page,
            );

            // The service's Money: Free, and the choice behind Edit.
            await owner.page.goto(`/services/${made.id}`);
            const edit = owner.page
                .getByRole("button", {
                    name: /^(Edit Money|Price: Free\. Change)$/,
                })
                .filter({ visible: true })
                .first();
            await expect(edit).toBeVisible({ timeout: 15_000 });
            await edit.click();
            const panel = owner.page.getByRole("dialog");
            await expect(
                panel.getByRole("radio", { name: "Free" }),
            ).toHaveAttribute("aria-checked", "true");
            await expect(
                panel.getByText(/Customers book it straight away/),
            ).toBeVisible();
            await shot(`service-free-${testInfo.project.name}.png`, owner.page);
            await panel.getByRole("radio", { name: "Paid" }).click();
            await expect(panel.getByLabel("Price")).toBeVisible();
            await shot(`service-paid-${testInfo.project.name}.png`, owner.page);
        } finally {
            await nw.delete(`/services/${made.id}`);
            await owner.close();
        }
    });
});
