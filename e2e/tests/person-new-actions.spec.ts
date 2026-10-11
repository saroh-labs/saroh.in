// @covers accounts:/login app:/open app:/contacts app:/commerce/orders app:/bookings api:customer-workspace api:contacts api:orders api:bookings
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeContact, stamp } from "../fixtures/own-data";
import type { Role } from "../fixtures/sessions";
import { useSession } from "../fixtures/sessions";

/**
 * New order and New booking from a person's page (#247): each opens the
 * flow that already exists — the Orders list's sheet, the calendar's
 * dialog — with that person already chosen, so nobody searches for them
 * again. Change still picks anyone else.
 *
 * Nothing is placed or booked: each flow is opened, read and closed, on a
 * Northwind contact the test makes for itself. Rye's Member is only read.
 */

const NORTHWIND = "seed_org";
const RYE = "seed_sc_rc_org";
const PRIYA = "seed_sc_rc_contact_priya";

async function signIn(page: Page, org: string, who: Role = "owner") {
    await useSession(page, who);
    await page.goto(`/open/${org}`);
}

/** The person page's own header buttons (links that open each flow). */
const start = (page: Page, name: string) =>
    page.getByRole("main").getByRole("link", { name, exact: true });

test.describe("new order and new booking from the person", () => {
    test("New order opens the sheet with them chosen", async ({
        page,
    }, testInfo) => {
        await signIn(page, NORTHWIND);
        const s = stamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Order",
            lastName: s,
            email: `order-${s}@example.com`,
        });

        await page.goto(`/contacts/${who.id}`);
        await expect(
            page.getByRole("heading", { level: 1, name: who.name }),
        ).toBeVisible();
        // On a phone the header's buttons wrap; nothing scrolls sideways.
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);

        await start(page, "New order").click();
        await expect(page).toHaveURL(
            new RegExp(`/commerce/orders\\?new=1&contactId=${who.id}$`),
        );
        const sheet = page.getByRole("dialog", { name: "New order" });
        await expect(sheet).toBeVisible();
        // Picked already: their card and its Change, not the search.
        await expect(
            sheet.getByRole("button", {
                name: `Change the customer, now ${who.name}`,
            }),
        ).toBeVisible();
        await expect(sheet.getByText(`order-${s}@example.com`)).toBeVisible();

        // Untouched, so it closes without asking, and the list keeps its
        // own address — a reload doesn't open it again.
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(page).not.toHaveURL(/contactId=/);
    });

    test("New booking opens the dialog with them chosen", async ({
        page,
    }, testInfo) => {
        await signIn(page, NORTHWIND);
        const s = stamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Booking",
            lastName: s,
            email: `booking-${s}@example.com`,
        });

        await page.goto(`/contacts/${who.id}`);
        await start(page, "New booking").click();
        await expect(page).toHaveURL(
            new RegExp(`/bookings\\?new=1&contactId=${who.id}$`),
        );
        const dialog = page.getByRole("dialog", { name: "New booking" });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(who.name).first()).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(page).not.toHaveURL(/contactId=/);
    });

    test("an address naming no one opens the flow empty", async ({ page }) => {
        await signIn(page, NORTHWIND);
        await page.goto("/commerce/orders?new=1&contactId=no_such_contact");
        const sheet = page.getByRole("dialog", { name: "New order" });
        await expect(sheet).toBeVisible();
        await expect(
            sheet.getByRole("button", { name: /^Change the customer/ }),
        ).toHaveCount(0);
    });
});

test.describe("new order and new booking, as a Member", () => {
    test("neither is offered to a role that can't take them", async ({
        page,
    }) => {
        await signIn(page, RYE, "member");
        await page.goto(`/contacts/${PRIYA}`);
        await expect(
            page.getByRole("heading", { name: "Priya Raman" }),
        ).toBeVisible();
        // A Member stages orders (DEC-024) but takes neither (B16, E26).
        await expect(start(page, "New order")).toHaveCount(0);
        await expect(start(page, "New booking")).toHaveCount(0);
    });
});
