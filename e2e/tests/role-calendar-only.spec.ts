// @covers accounts:/login app:/open app:/ app:/bookings app:/bookings/all app:/services app:/contacts app:/analytics app:/settings/billing app:/settings/profile api:bookings api:staff api:organizations api:capabilities
import { expect, test } from "@playwright/test";

import { bookOwn, makeContact, northwind, stamp } from "../fixtures/own-data";
import type { MenuRow } from "../fixtures/roles";
import {
    asOwner,
    expectDenied,
    expectLeaveOfferedThenStay,
    expectMenu,
    expectNotOffered,
    expectNoWayToPlans,
    expectSettingsTabs,
    openNorthwindAs,
    WHO_CAN_CHANGE,
} from "../fixtures/roles";

/**
 * Someone on the diary with a login, in the browser: Tara, Calendar only on
 * Northwind (#868; the seed's `calendar-only-teammate.ts`).
 *
 * The role holds `org:read`, `module:read`, `booking:read`, `booking:write`
 * and `service:read` (`CALENDAR_ONLY_ACTIONS`), and what it reaches is
 * narrowed to the person's own bookings (the API's `bookings/own-diary.ts`):
 * another person's booking is not there for them at all. No customers, no
 * team, no set-up and no money.
 *
 * Tara's one booking is the seed's (`seed_booking_calendar-only`, for Meera
 * Nair, months ahead and after hours). It is only read here. The booking
 * that is not hers is made by the owner for the test, and cancelled after.
 */

/** Tara's own booking and who it is for, as the seed writes them. */
const HERS = { id: "seed_booking_calendar-only", booker: "Meera Nair" };

/**
 * `NAV_GROUPS` (`components/shared/nav-items.tsx`) for the role's five
 * permissions: Appointments is the only module in reach, and its Courses
 * page asks a read the role doesn't hold. Settings is offered for
 * `module:read`.
 */
const MENU: readonly MenuRow[] = [
    { label: "Home", href: "/" },
    { label: "Calendar", href: "/calendar" },
    {
        label: "Bookings",
        href: "/bookings",
        pages: [
            { label: "Calendar", href: "/bookings" },
            { label: "Services", href: "/services" },
            { label: "Hours and time off", href: "/bookings/availability" },
        ],
    },
    { label: "Settings", href: "/settings" },
];

/** `SETTINGS_PAGES` the role opens: what the business runs on, and their own. */
const SETTINGS = ["/settings/modules", "/settings/profile"];

test.describe("someone who is Calendar only", () => {
    test.beforeEach(async ({ page }) => {
        await openNorthwindAs(page, "calendarOnly");
    });

    test("is offered the diary and little else", async ({ page }) => {
        test.setTimeout(90_000);
        await expectMenu(page, MENU);
        await expectSettingsTabs(page, SETTINGS);
    });

    test("is told who can change it when they open customers or figures", async ({
        page,
    }) => {
        await expectDenied(page, "/contacts", { thing: "Contacts" });
        await expectDenied(page, "/analytics", { thing: "Insights" });
    });

    test("reads the services, with no way to change what can be booked", async ({
        page,
    }) => {
        await page.goto("/services");
        await expect(
            page.getByRole("heading", { name: "Services", exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("note").filter({
                hasText:
                    "Your role can see these services but not change them.",
            }),
        ).toContainText(WHO_CAN_CHANGE);
        await expectNotOffered(page, "New service");
        // Nothing on a row changes a service: no Taking bookings switch.
        await expect(
            page.getByRole("switch", { name: /^Taking bookings/ }),
        ).toHaveCount(0);
    });

    test("sees their own diary and nobody else's", async ({
        page,
        browser,
    }, testInfo) => {
        const owner = await asOwner(browser);
        const tag = stamp(testInfo);
        const someone = await makeContact(owner.request, {
            firstName: "Someone",
            lastName: `Else ${tag}`,
            email: `someone-else-${tag}@example.com`,
        });
        // With nobody put on it, on a service Tara doesn't take: not hers.
        const theirs = await bookOwn(owner.request, someone.id);
        try {
            // Her booking opens, and it is hers to move or cancel.
            await page.goto(`/bookings/${HERS.id}`);
            await expect(
                page.getByText(`Booked by ${HERS.booker}.`),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: "Move", exact: true }),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: "Cancel", exact: true }),
            ).toBeVisible();
            await expect(
                page.getByText(/^Your role can read this booking/),
            ).toHaveCount(0);

            // The list holds hers and not the other.
            await page.goto("/bookings/all");
            await expect(
                page.getByRole("heading", { name: "All bookings" }),
            ).toBeVisible();
            await expect(
                page.getByText(HERS.booker).filter({ visible: true }).first(),
            ).toBeVisible();
            await expect(page.getByText(someone.name)).toHaveCount(0);

            // By its address, the other booking is not a page of hers.
            await page.goto(`/bookings/${theirs.id}`);
            await expect(
                page.getByRole("heading", { name: "Page not found" }),
            ).toBeVisible();
            await expect(page.getByText(someone.name)).toHaveCount(0);
        } finally {
            const nw = northwind(owner.request);
            await nw.delete(`/services/bookings/${theirs.id}`);
            await nw.delete(`/contacts/${someone.id}`);
            await owner.close();
        }
    });

    test("has no way to the plans, and reads who has", async ({ page }) => {
        await expectNoWayToPlans(page);
    });

    test("is offered Leave on Your profile, and stays", async ({ page }) => {
        await expectLeaveOfferedThenStay(page);
    });
});
