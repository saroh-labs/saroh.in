// @covers site:/book app:/open app:/bookings/all app:/services api:bookings api:site-accounts pkg:site-blocks
import { join } from "node:path";

import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

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

/** Where to keep the screenshots, for a review; else the test's own folder. */
const SHOTS =
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- a local review's folder, read only here; not a build input
    process.env.FREE_SESSION_SHOTS_DIR ?? null;

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
            on.screenshot({
                path: SHOTS
                    ? join(SHOTS, `${testInfo.project.name}-${file}`)
                    : testInfo.outputPath(file),
                fullPage: false,
            });
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
            await shot("booking-page.png");
            // A phone at 390 and 320: nothing runs off the side.
            if (testInfo.project.name.startsWith("phone")) {
                const was = page.viewportSize();
                for (const width of [390, 320]) {
                    await page.setViewportSize({ width, height: 844 });
                    await expect
                        .poll(() =>
                            page.evaluate(
                                () => document.documentElement.scrollWidth,
                            ),
                        )
                        .toBeLessThanOrEqual(width);
                    await shot(`booking-page-${width}.png`);
                }
                if (was) await page.setViewportSize(was);
            }

            // Signed in at the last step, named, booked: nothing to pay.
            await page
                .getByRole("button", { name: "Continue to sign in" })
                .filter({ visible: true })
                .first()
                .click();
            await signInOnSheet(page, `free-${own}@example.com`.toLowerCase());
            // A new account is asked its name; then the button says Book.
            const nameField = page.getByLabel("Name");
            await expect(nameField).toBeVisible({ timeout: 15_000 });
            await nameField.fill(`Tara ${own}`);
            const bookButton = page
                .getByRole("button", { name: "Book", exact: true })
                .filter({ visible: true })
                .first();
            await expect(bookButton).toBeVisible();
            await shot("summary-book.png");
            await bookButton.click();
            await expect(
                page.getByRole("heading", { name: /You're booked/ }),
            ).toBeVisible({ timeout: 30_000 });
            await expect(
                page.getByText("It's free. There's nothing to pay."),
            ).toBeVisible();
            await expect(
                page.getByText(/front desk|pay at the|pay later/i),
            ).toHaveCount(0);
            await shot("confirmation.png");

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
            await shot("bookings-list.png", owner.page);

            // Quick look, from the row: Free too.
            await owner.page
                .getByText(`Tara ${own}`)
                .filter({ visible: true })
                .first()
                .click();
            const look = owner.page.getByRole("dialog");
            await expect(
                look
                    .getByText(/\bFree\b/)
                    .filter({ visible: true })
                    .first(),
            ).toBeVisible({ timeout: 15_000 });
            await expect(
                look.getByText(/Awaiting payment|Pays at/),
            ).toHaveCount(0);
            await shot("quick-look.png", owner.page);
            await owner.page.keyboard.press("Escape");

            // The booking's own page: its Money says Free.
            const from = new Date(Date.now() - 86_400_000).toISOString();
            const to = new Date(Date.now() + 5 * 86_400_000).toISOString();
            const calendar = await nw.get<{
                diaries: { bookings: { id: string; serviceId: string }[] }[];
            }>(`/services/bookings?from=${from}&to=${to}`);
            const booked = calendar.diaries
                .flatMap((d) => d.bookings)
                .find((b) => b.serviceId === made.id);
            expect(booked, "the free booking is on the diary").toBeTruthy();
            await owner.page.goto(`/bookings/${booked?.id ?? ""}`);
            await expect(
                owner.page
                    .locator("main")
                    .getByText("Free", { exact: true })
                    .filter({ visible: true })
                    .first(),
            ).toBeVisible({ timeout: 15_000 });
            await shot("booking-detail.png", owner.page);

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
            await shot("service-free.png", owner.page);
            await panel.getByRole("radio", { name: "Paid" }).click();
            await expect(panel.getByLabel("Price")).toBeVisible();
            await shot("service-paid.png", owner.page);
        } finally {
            await nw.delete(`/services/${made.id}`);
            await owner.close();
        }
    });
});
