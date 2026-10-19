// @covers accounts:/login app:/open app:/bookings app:/bookings/all api:bookings api:contacts api:customer-workspace
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { northwind, phone, stamp } from "../fixtures/own-data";
import { ownService } from "../fixtures/own-service";
import { useSession } from "../fixtures/sessions";

/**
 * New booking as a guided journey (U8, #1024): Who, What, With, When,
 * Check and book, then Booked with WhatsApp, SMS and Copy message — full
 * screen on a phone, a wide side panel with a step list at a desk.
 *
 * Writes go to Northwind only: the caller is made by the test with a name
 * and phone of its own (DEC-170), on a service the test makes for itself
 * (`fixtures/own-service.ts`), so the time it books is its own and no test
 * beside it can take it. The booking is cancelled and the service archived
 * before it ends. The day it opens on is read, never written.
 */

const NORTHWIND = "seed_org";

async function signIn(page: Page) {
    await useSession(page, "owner");
    await page.goto(`/open/${NORTHWIND}`);
}

/** New booking's own button: beside "…" at a desk, floating on a phone. */
const newBooking = (page: Page) =>
    page
        .getByRole("button", { name: "New booking", exact: true })
        .filter({ visible: true })
        .first();

/** The sticky foot's one button: "Next: …", "Add and use", "Book …". */
const next = (sheet: Locator) =>
    sheet.locator('[data-overlay-foot] button[type="submit"]');

test.describe("New booking, step by step (U8)", () => {
    test("books a caller by name and phone, and says what to do next", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        const s = stamp(testInfo);
        const name = `Zara ${s}`;
        const service = await ownService(page.request, testInfo, "Steps");
        let bookingId: string | null = null;
        try {
            await page.goto("/bookings");
            await newBooking(page).click();
            const sheet = page.getByRole("dialog", { name: "New booking" });
            await expect(sheet).toBeVisible();
            await expect(
                sheet.getByText("Step 1 of 5 · Customer").first(),
            ).toBeVisible();

            // Who: a caller by name and phone alone.
            await sheet.getByLabel("Find the customer").fill(name);
            await sheet
                .getByRole("button", { name: new RegExp(`Add “${name}”`) })
                .click();
            await sheet.getByLabel("Phone").fill(phone().replace("+91 ", ""));
            await expect(next(sheet)).toHaveText("Add and use");
            await next(sheet).click();

            // What: this test's own service.
            await expect(
                sheet.getByText("Step 2 of 5 · Service").first(),
            ).toBeVisible();
            await sheet
                .getByRole("radiogroup", { name: "Service" })
                .getByRole("radio", {
                    name: new RegExp(
                        service.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                    ),
                })
                .click();
            await next(sheet).click();

            // With, where it is asked: nobody takes this service, so it isn't.
            const when = sheet.getByText("Step 4 of 5 · Day and time").first();
            const withWho = sheet.getByText(/^Step 3 of 5/).first();
            await expect(when.or(withWho)).toBeVisible();
            if (await withWho.isVisible()) await next(sheet).click();
            await expect(when).toBeVisible();

            // When: a free time today, else the next free day's; the service
            // is open all day and only this test books it.
            const time = sheet
                .getByRole("radio", { name: /^\d{1,2}:\d\d [ap]m/ })
                .first();
            await expect(
                time.or(sheet.getByRole("button", { name: /^Next free day/ })),
            ).toBeVisible();
            if (!(await time.isVisible())) {
                await sheet
                    .getByRole("button", { name: /^Next free day/ })
                    .click();
            }
            await time.click();
            await next(sheet).click();

            // Check and book: Pays at the visit is picked (DEC-170).
            await expect(
                sheet.getByText("Step 5 of 5 · Check and book").first(),
            ).toBeVisible();
            await expect(
                sheet.getByRole("radio", { name: /Pays at the visit/ }),
            ).toBeChecked();
            await expect(next(sheet)).toHaveText(/^Book Zara · /);
            await next(sheet).click();

            // Booked: what next, through the phone's own apps (Q12).
            await expect(
                sheet.getByRole("heading", { name: "Zara is booked" }),
            ).toBeVisible();
            await expect(
                sheet.getByRole("link", {
                    name: /Send confirmation on WhatsApp/,
                }),
            ).toHaveAttribute(
                "href",
                /^https:\/\/wa\.me\/91\d{10}\?text=Hi%20Zara/,
            );
            await expect(
                sheet.getByRole("link", { name: /Send it by SMS/ }),
            ).toHaveAttribute("href", /^sms:\+91\d{10}\?&body=/);
            await expectNothingHiddenSideways(page);

            // Its own booking goes: cancelled through the API.
            const view = await sheet
                .getByRole("link", { name: "View booking" })
                .filter({ visible: true })
                .first()
                .getAttribute("href");
            bookingId = view?.split("/").at(-1) ?? null;
            expect(bookingId).toBeTruthy();
        } finally {
            if (bookingId) {
                await northwind(page.request).delete(
                    `/services/bookings/${bookingId}`,
                );
            }
            await service.remove();
        }
    });

    test("opens on the day the Calendar asked for, and closing leaves the address", async ({
        page,
    }) => {
        await signIn(page);
        const day = new Date(Date.now() + 3 * 86_400_000)
            .toISOString()
            .slice(0, 10);
        await page.goto(`/bookings?date=${day}&new=1`);
        const sheet = page.getByRole("dialog", { name: "New booking" });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText("Who is it for?").first()).toBeVisible();
        // Nothing chosen: Escape just closes, and a reload won't reopen it.
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(page).not.toHaveURL(/new=1/);
    });

    test("closing with someone picked asks first", async ({ page }) => {
        await signIn(page);
        await page.goto("/bookings");
        await newBooking(page).click();
        const sheet = page.getByRole("dialog", { name: "New booking" });
        // Someone picked from the recent customers: work to lose.
        await sheet.getByRole("list").getByRole("button").first().click();
        await expect(
            sheet.getByText("Step 2 of 5 · Service").first(),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        const ask = page.getByRole("alertdialog", {
            name: "Discard what you typed?",
        });
        await expect(ask).toBeVisible();
        await ask.getByRole("button", { name: "Keep booking" }).click();
        await expect(sheet).toBeVisible();
        await page.keyboard.press("Escape");
        await page
            .getByRole("alertdialog")
            .getByRole("button", { name: "Discard" })
            .click();
        await expect(sheet).toBeHidden();
    });
});
