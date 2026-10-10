// @covers accounts:/login app:/open app:/ app:/commerce/orders app:/commerce/customers/new app:/bookings app:/bookings/all app:/services app:/customers app:/analytics app:/settings/billing app:/settings/profile api:organizations api:orders api:bookings api:contacts api:customer-workspace api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    bookOwn,
    makeContact,
    makeOrder,
    northwind,
    stamp,
} from "../fixtures/own-data";
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
    shown,
    WHO_CAN_CHANGE,
} from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A Member, in the browser: Maya on Northwind (the showcase seed).
 *
 * A Member is the read-only floor and the kitchen (`READ_ONLY_ACTIONS` and
 * `MEMBER_ACTIONS` in the API's `organization-policy.ts`): the business, its
 * team, its locations and products, its website, the diary and who is on
 * it, and an order's kitchen view with its stage to move (DEC-024). No
 * money, no leads, and nothing else to change.
 *
 * Each test that needs a record has the owner make it first, through the
 * API, in a context of the owner's own; the Member's page only reads it,
 * or moves the one order the test made.
 */

/**
 * `NAV_GROUPS` (`components/shared/nav-items.tsx`) for a Member's
 * permissions and the modules they reach: Payments (`payment:read`),
 * Insights (`analytics:read`), Courses and Class packs are out of reach, and
 * so are Leads, Pipeline, Discount codes and Invoices by their own reads.
 * Sell › Stock is drawn only while the business tracks stock.
 */
const MENU: readonly MenuRow[] = [
    { label: "Home", href: "/" },
    { label: "Overview", href: "/calendar" },
    { label: "Website", href: "/sites" },
    {
        label: "Sell",
        href: "/commerce",
        pages: [
            { label: "Orders", href: "/commerce/orders" },
            { label: "Products", href: "/commerce/products" },
            { label: "Stock", href: "/commerce/stock", optional: true },
            { label: "Customers", href: "/commerce/customers" },
            { label: "Location", href: "/commerce/locations" },
        ],
    },
    {
        label: "Bookings",
        href: "/bookings",
        pages: [
            { label: "Calendar", href: "/bookings" },
            { label: "Services", href: "/services" },
            { label: "Availability", href: "/bookings/availability" },
        ],
    },
    { label: "Contacts", href: "/contacts" },
    { label: "Settings", href: "/settings" },
];

/** `SETTINGS_PAGES` a Member's reads open: the team, the modules, the site. */
const SETTINGS = [
    "/settings/people",
    "/settings/modules",
    "/settings/profile",
    "/settings/share",
];

/** The Orders list at this width: the desk grid or the phone cards. */
const orders = (page: Page) =>
    page.getByRole("list", { name: "Orders" }).filter({ visible: true });

test.describe("a Member", () => {
    test("is offered the rows a Member reads, and no others", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await openNorthwindAs(page, "northwindMember");
        await expectMenu(page, MENU);
        await expectSettingsTabs(page, SETTINGS);
    });

    test("is told who can change it when they open what a Member can't", async ({
        page,
    }) => {
        await openNorthwindAs(page, "northwindMember");
        // A section out of reach.
        await expectDenied(page, "/analytics", { thing: "Insights" });
        // A form whose save the API would refuse, said before it is drawn.
        await expectDenied(page, "/commerce/customers/new", {
            thing: "New customer",
        });
        await expect(
            page.getByRole("link", { name: "Back to Customers" }),
        ).toBeVisible();
        await expect(page.getByLabel("Email")).toHaveCount(0);
    });

    test("reads a customer and the services, with nothing to press that would be refused", async ({
        page,
        browser,
    }, testInfo) => {
        const owner = await asOwner(browser);
        const tag = stamp(testInfo);
        const who = await makeContact(owner.request, {
            firstName: "Member",
            lastName: `Reads ${tag}`,
        });
        try {
            await openNorthwindAs(page, "northwindMember");
            await page.goto(`/customers/${who.id}`);
            await expect(
                page.getByRole("heading", { name: who.name }),
            ).toBeVisible();
            // Shown, off, with why beside it.
            await expect(
                page.getByRole("button", { name: "Edit details" }),
            ).toBeDisabled();
            await expect(
                page.getByText(
                    "Your role can see this customer but not edit them.",
                ),
            ).toBeVisible();
            await expect(page.getByRole("main")).not.toContainText("₹");

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
            // Each service opens to read, never to edit.
            await expect(
                page.getByRole("link", { name: /^View / }).first(),
            ).toBeVisible();
            await expect(
                page.getByRole("link", { name: /^Edit / }),
            ).toHaveCount(0);
        } finally {
            await northwind(owner.request).delete(`/contacts/${who.id}`);
            await owner.close();
        }
    });

    test("is refused calmly when a tab opened with more access saves as a Member", async ({
        page,
        browser,
    }, testInfo) => {
        // A tab left open while the person's role was lowered: the sheet was
        // drawn for someone who could save, and the save is a Member's. The
        // test opens it as the Admin, then carries on as the Member.
        const owner = await asOwner(browser);
        const tag = stamp(testInfo);
        const who = await makeContact(owner.request, {
            firstName: "Stale",
            lastName: `Tab ${tag}`,
        });
        try {
            await openNorthwindAs(page, "admin");
            await page.goto(`/customers/${who.id}`);
            await page.getByRole("button", { name: "Edit details" }).click();
            const sheet = page.getByRole("dialog", { name: "Edit details" });
            await sheet.getByLabel("First name").fill("Changed");

            // The same tab, now the Member's session. Northwind stays open:
            // the open business is the workspace's own cookie.
            await useSession(page, "northwindMember");
            await sheet
                .getByRole("button", { name: "Save", exact: true })
                .click();

            // Said in the neutral style, never as the red error a breakage
            // gets, and it says what the role can't do.
            const said = /^Your role can't change customers/;
            await expect(shown(page, said)).toBeVisible();
            await expect(
                page.locator('[data-sonner-toast][data-type="error"]'),
            ).toHaveCount(0);
            await expect(page.getByText("Details saved.")).toHaveCount(0);

            // And nothing was saved.
            const after = await northwind(owner.request).get<{
                firstName: string | null;
            }>(`/contacts/${who.id}`);
            expect(after.firstName).toBe("Stale");
        } finally {
            await northwind(owner.request).delete(`/contacts/${who.id}`);
            await owner.close();
        }
    });

    test("works an order's kitchen stage, and sees no money or way to take an order", async ({
        page,
        browser,
    }) => {
        test.setTimeout(120_000);
        const owner = await asOwner(browser);
        const order = await makeOrder(owner.request, { stage: "PREPARING" });
        try {
            await openNorthwindAs(page, "northwindMember");
            await page.goto(`/commerce/orders?q=${order.orderId}`);
            await expect(
                orders(page)
                    .getByRole("listitem")
                    .filter({ hasText: `#${order.orderId}` }),
            ).toBeVisible();
            // Taking and exporting orders are powers a Member doesn't hold.
            await expectNotOffered(page, "New order");
            await expectNotOffered(page, "Export");

            await page.goto(`/commerce/orders/${order.id}`);
            await expect(
                page.getByRole("group", { name: /Preparing, step 2 of 4/ }),
            ).toBeVisible();
            await expect(
                page.getByRole("region", { name: "Money" }),
            ).toHaveCount(0);
            await expect(page.getByText(/₹/)).toHaveCount(0);
            await expectNotOffered(page, /^Refund/);
            await expectNotOffered(page, /^Cancel order/);

            // The one thing a Member changes: the stage.
            await page
                .getByRole("button", { name: "Mark ready", exact: true })
                .click();
            await page.getByRole("button", { name: "Mark now" }).click();
            await expect(shown(page, "Marked ready.")).toBeVisible();
            await expect(
                page.getByRole("group", { name: /Ready, step 3 of 4/ }),
            ).toBeVisible();
        } finally {
            // Collected, so it holds no place in anyone's kitchen.
            await owner.request.post(
                `${urls.API_URL}/organizations/${NORTHWIND_ORG}/orders/${order.id}/stage`,
                {
                    headers: northwind(owner.request).headers,
                    data: { to: "COLLECTED" },
                },
            );
            await owner.close();
        }
    });

    test("reads a booking, with no way to move or cancel it", async ({
        page,
        browser,
    }, testInfo) => {
        const owner = await asOwner(browser);
        const tag = stamp(testInfo);
        const who = await makeContact(owner.request, {
            firstName: "Diary",
            lastName: `Reads ${tag}`,
        });
        const booked = await bookOwn(owner.request, who.id);
        try {
            await openNorthwindAs(page, "northwindMember");
            await page.goto(`/bookings/${booked.id}`);
            // "Booked by Diary Reads …", or "Booked for … by" whoever made it.
            await expect(
                page.getByText(/^Booked (by|for) Diary Reads /),
            ).toBeVisible();
            await expect(
                page.getByRole("note").filter({
                    hasText:
                        "Your role can read this booking but not change it.",
                }),
            ).toContainText(WHO_CAN_CHANGE);
            await expect(
                page.getByRole("button", { name: "Move", exact: true }),
            ).toHaveCount(0);
            await expect(
                page.getByRole("button", { name: "Cancel", exact: true }),
            ).toHaveCount(0);
            // Money to take is shown to whoever is at the desk, and is off
            // for a role that can't take it (DEC-098): never a live button.
            await expect(
                page
                    .getByRole("button", { name: /^Take / })
                    .and(page.locator(":enabled")),
            ).toHaveCount(0);
        } finally {
            const nw = northwind(owner.request);
            await nw.delete(`/services/bookings/${booked.id}`);
            await nw.delete(`/contacts/${who.id}`);
            await owner.close();
        }
    });

    test("is not offered New booking on All bookings", async ({ page }) => {
        test.fixme(
            true,
            "All bookings draws New booking for everyone; a Member holds no booking:write and the API refuses the save. The diary (/bookings) already asks.",
        );
        await openNorthwindAs(page, "northwindMember");
        await page.goto("/bookings/all");
        await expect(
            page.getByRole("heading", { name: "All bookings" }),
        ).toBeVisible();
        await expectNotOffered(page, "New booking");
    });

    test("has no way to the plans, and reads who has", async ({ page }) => {
        await openNorthwindAs(page, "northwindMember");
        await expectNoWayToPlans(page);
    });

    test("is offered Leave on Your profile, and stays", async ({ page }) => {
        await openNorthwindAs(page, "northwindMember");
        await expectLeaveOfferedThenStay(page);
    });
});
