// @covers accounts:/login app:/open app:/ api:home api:orders api:bookings
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { needRows, needsYou } from "../fixtures/home";
import { northwind, phone, stamp } from "../fixtures/own-data";
import type { OwnService } from "../fixtures/own-service";
import { bookOnOwn, ownService, STEP_MS } from "../fixtures/own-service";
import { pressUntil } from "../fixtures/press";
import { onPhone, openNorthwindAs } from "../fixtures/roles";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Needs you, grouped by kind (DEC-171, Home plan U7, #1084): each group's
 * rows open inside it with the inline actions they always had, and a
 * booking awaiting payment offers Send payment link and Turn down, both
 * held ten seconds with Undo before anything is written.
 *
 * Every write is on Northwind, on a service and a booking this test makes
 * for itself (`fixtures/own-service.ts`): booked by hand by name and phone
 * at the next free half hour, so it is the soonest awaiting payment, and
 * given a payment link, which is what puts it on Home. It is cancelled and
 * the service archived at the end.
 *
 * At a desk the rows are inside the bookings-awaiting-payment group. On a
 * phone, the same rows and actions are reached through the phone's Home
 * (the group's sheet, U17); a phone
 * whose list doesn't carry the row yet skips rather than invents it.
 */

interface BookingRead {
    id: string;
    status: string;
}

const readBooking = (request: APIRequestContext, id: string) =>
    northwind(request).get<BookingRead>(`/services/bookings/${id}`);

/**
 * A booking of the test's own awaiting payment: made by hand, unpaid,
 * then given a payment link (an issued invoice), as DEC-170 has it. Null
 * when Northwind can't make a link here (no provider on this stack).
 */
async function awaitingBooking(
    request: APIRequestContext,
    service: OwnService,
    name: string,
): Promise<{ id: string } | null> {
    const startAt = new Date(
        (Math.floor(Date.now() / STEP_MS) + 1) * STEP_MS,
    ).toISOString();
    const booked = await bookOnOwn(
        request,
        service,
        { name, phone: phone() },
        { startAt },
    );
    const nw = northwind(request);
    const link = await request.post(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}/services/bookings/${booked.id}/pay-link`,
        { headers: nw.headers },
    );
    if (!link.ok()) {
        await nw.delete(`/services/bookings/${booked.id}`);
        return null;
    }
    return { id: booked.id };
}

/** Cancel the booking if it still stands, and archive the service. */
async function tidy(
    request: APIRequestContext,
    service: OwnService,
    bookingId: string | null,
) {
    if (bookingId) {
        const nw = northwind(request);
        const read = await readBooking(request, bookingId).catch(() => null);
        if (read && read.status !== "CANCELLED") {
            await nw.delete(`/services/bookings/${bookingId}`);
        }
    }
    await service.remove();
}

/**
 * The test's own row, wherever this layout draws it: at a desk inside its
 * group, on a phone (U17) in the awaiting-payment group's sheet.
 */
async function ownRow(page: Page, who: string): Promise<Locator> {
    const rows = await needRows(page, "AWAITING_PAYMENT");
    return rows.filter({ visible: true }).filter({ hasText: who }).first();
}

/**
 * The test's own row says `text`. At a desk, a group whose every row was
 * acted on here folds to "All done" as the hold starts (`need-groups.tsx`,
 * so the count drops at once); opened again, the row is there with what
 * it says and its Undo. Other tests' bookings may keep it open, or not.
 */
async function expectRowSays(
    page: Page,
    row: Locator,
    text: string,
    timeout = 15_000,
): Promise<void> {
    await expect(async () => {
        if (!onPhone(page)) {
            const show = needsYou(page)
                .locator('[data-need-group="AWAITING_PAYMENT"]')
                .getByRole("button", { name: "Show the rows" });
            if ((await show.count()) > 0) await show.click();
        }
        await expect(row).toContainText(text, { timeout: 2_000 });
    }).toPass({ timeout });
}

test.describe("Needs you groups: a booking awaiting payment (U7)", () => {
    test("Turn down is held with Undo, and Undo leaves the booking as it was", async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        // The page's own clock, so the hold is run out, not slept (#24).
        await page.clock.install();
        // Signed in first: the API calls below are the owner's.
        await openNorthwindAs(page, "owner");
        const request = page.request;
        const service = await ownService(request, testInfo, "Turn down");
        const who = `Turn ${stamp(testInfo)}`;
        let bookingId: string | null = null;
        try {
            const made = await awaitingBooking(request, service, who);
            test.skip(!made, "Northwind can't make a payment link here");
            bookingId = made?.id ?? null;

            await page.goto("/");
            const row = await ownRow(page, who);
            test.skip(
                onPhone(page) && (await row.count()) === 0,
                "the phone's Home has no awaiting-payment line for it",
            );
            await expect(row).toBeVisible();

            if (!onPhone(page)) {
                // At a desk, the row is inside its group.
                const group = needsYou(page).locator(
                    '[data-need-group="AWAITING_PAYMENT"]',
                );
                await expect(group).toContainText(/bookings? awaiting payment/);
                // Other tests' bookings may wait beside it: its own row.
                await expect(
                    group.locator("[data-need-row]").filter({ hasText: who }),
                ).toHaveCount(1);
            }

            await row
                .getByRole("button", { name: "Turn down", exact: true })
                .click();
            const confirm = row.getByRole("alertdialog");
            await expect(confirm).toContainText(/cancels|lets the place go/);
            await confirm
                .getByRole("button", { name: "Turn down", exact: true })
                .click();
            await expectRowSays(page, row, "Turning down in 10 seconds");

            // Undo inside the ten seconds: nothing was written.
            await row.getByRole("button", { name: "Undo" }).click();
            await expect(
                row.getByRole("button", { name: "Turn down", exact: true }),
            ).toBeVisible();
            // Past where the hold would have ended, it still stands.
            await page.clock.runFor(11_000);
            const after = await readBooking(request, bookingId ?? "");
            expect(after.status).not.toBe("CANCELLED");
        } finally {
            await tidy(request, service, bookingId);
        }
    });

    test("Turn down left to run cancels the booking", async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        // Signed in first: the API calls below are the owner's.
        await openNorthwindAs(page, "owner");
        const request = page.request;
        const service = await ownService(request, testInfo, "Turned down");
        const who = `Gone ${stamp(testInfo)}`;
        let bookingId: string | null = null;
        try {
            const made = await awaitingBooking(request, service, who);
            test.skip(!made, "Northwind can't make a payment link here");
            bookingId = made?.id ?? null;

            await page.goto("/");
            const row = await ownRow(page, who);
            test.skip(
                onPhone(page) && (await row.count()) === 0,
                "the phone's Home has no awaiting-payment line for it",
            );
            await row
                .getByRole("button", { name: "Turn down", exact: true })
                .click();
            await row
                .getByRole("alertdialog")
                .getByRole("button", { name: "Turn down", exact: true })
                .click();
            await expectRowSays(page, row, "Turned down", 20_000);
            await expect
                .poll(
                    async () =>
                        (await readBooking(request, bookingId ?? "")).status,
                    { timeout: 15_000 },
                )
                .toBe("CANCELLED");
        } finally {
            await tidy(request, service, bookingId);
        }
    });

    test("Send payment link is held with Undo, then gives the new link to copy", async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        // Signed in first: the API calls below are the owner's.
        await openNorthwindAs(page, "owner");
        const request = page.request;
        const service = await ownService(request, testInfo, "Pay link");
        const who = `Link ${stamp(testInfo)}`;
        let bookingId: string | null = null;
        try {
            const made = await awaitingBooking(request, service, who);
            test.skip(!made, "Northwind can't make a payment link here");
            bookingId = made?.id ?? null;

            await page.goto("/");
            const row = await ownRow(page, who);
            test.skip(
                onPhone(page) && (await row.count()) === 0,
                "the phone's Home has no awaiting-payment line for it",
            );
            const send = row.getByRole("button", {
                name: "Send payment link",
                exact: true,
            });
            test.skip(
                (await send.count()) === 0,
                "this stack doesn't take payment online, so no link is offered",
            );

            // Undo first: no link is made.
            await send.click();
            const confirm = row.getByRole("alertdialog");
            await expect(confirm).toContainText(
                "the link sent before stops working",
            );
            await confirm
                .getByRole("button", { name: "Make the link" })
                .click();
            await expectRowSays(page, row, "Making the link in 10 seconds");
            await row.getByRole("button", { name: "Undo" }).click();
            await expect(send).toBeVisible();

            // Then let it run: the link is there to copy.
            await send.click();
            await row
                .getByRole("alertdialog")
                .getByRole("button", { name: "Make the link" })
                .click();
            await expectRowSays(page, row, "Payment link ready", 20_000);
            await expect(
                row.getByRole("button", { name: /Copy/ }),
            ).toBeVisible();
        } finally {
            await tidy(request, service, bookingId);
        }
    });
});

test.describe("Needs you groups at a desk (U7)", () => {
    test.beforeEach(({ page }) => {
        test.skip(onPhone(page), "the desk's groups; the phone's are U17's");
    });

    test("each group is a disclosure; orders open with Home; a closed group's one action opens it in place", async ({
        page,
    }) => {
        await openNorthwindAs(page, "owner");
        await page.goto("/");
        const needs = needsYou(page);
        await expect(needs).toBeVisible();
        const groups = needs.locator("[data-need-group]");
        test.skip((await groups.count()) === 0, "nothing needs Northwind");

        // Every group's toggle says whether it is open.
        const n = await groups.count();
        for (let i = 0; i < n; i++) {
            await expect(
                groups.nth(i).locator("button[aria-expanded]").first(),
            ).toHaveAttribute("aria-expanded", /true|false/);
        }
        const orders = needs.locator('[data-need-group="ORDERS"]');
        if ((await orders.count()) > 0) {
            await expect(orders).toHaveAttribute("data-state", "open");
            await expect(
                orders.getByRole("link", { name: "Open orders" }),
            ).toBeVisible();
        }

        // A closed group with a one-press action ("Reply", "Send payment
        // link", "Retry by payment link") opens at that row's confirm,
        // here, never on another page. Cancel: nothing is sent.
        for (const kind of ["ENQUIRIES", "PAYMENTS", "AWAITING_PAYMENT"]) {
            const group = needs.locator(`[data-need-group="${kind}"]`);
            if ((await group.count()) === 0) continue;
            if ((await group.getAttribute("data-state")) !== "closed") continue;
            // The line's own buttons, other than its disclosure.
            const one = group
                .locator(":scope > div")
                .first()
                .locator("button:not([aria-expanded])");
            const toggle = group.getByRole("button", { name: "Show the rows" });
            if ((await one.count()) === 0) continue;
            const url = page.url();
            await pressUntil(
                one.first(),
                group.locator('[role="alertdialog"], textarea').first(),
            );
            await expect(group).toHaveAttribute("data-state", "open");
            expect(page.url()).toBe(url);
            const cancel = group.getByRole("button", { name: "Cancel" });
            if ((await cancel.count()) > 0) await cancel.first().click();
            await expect(toggle).toHaveCount(0);
            break;
        }
    });

    test(
        "Mark sent inside the orders group, and Undo puts the order back",
        {
            // Needs you shows the oldest open orders, so an order made here
            // would not be among them: it moves the seed's own and puts it
            // back, while nothing else moves orders.
            tag: "@serial",
        },
        async ({ page }) => {
            test.setTimeout(90_000);
            await openNorthwindAs(page, "owner");
            await page.goto("/");
            const orders = needsYou(page).locator('[data-need-group="ORDERS"]');
            test.skip(
                (await orders.count()) === 0,
                "Northwind has no open orders",
            );
            await expect(orders).toHaveAttribute("data-state", "open");
            const row = orders
                .locator("[data-need-row]")
                .filter({
                    has: page.getByRole("button", {
                        name: "Mark sent",
                        exact: true,
                    }),
                })
                .first();
            test.skip((await row.count()) === 0, "no order ready to hand over");
            const title = (
                await row.getByRole("link").first().innerText()
            ).split("\n")[0];

            await row
                .getByRole("button", { name: "Mark sent", exact: true })
                .click();
            await row
                .getByRole("alertdialog")
                .getByRole("button", { name: /^Mark sent/ })
                .click();
            await expect(row.getByText(/^Marked sent/)).toBeVisible();
            await row.getByRole("button", { name: "Undo" }).click();
            await page.reload();
            const again = needsYou(page)
                .locator('[data-need-group="ORDERS"] [data-need-row]')
                .filter({ hasText: title })
                .first();
            await expect(
                again.getByRole("button", { name: "Mark sent", exact: true }),
            ).toBeVisible();
        },
    );
});
