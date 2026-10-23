// @covers accounts:/login app:/open app:/ app:/commerce/orders app:/bookings app:/billing/subscriptions app:/settings/people app:/settings/billing app:/settings/data app:/settings/profile api:organizations api:billing api:capabilities
import { expect, test } from "@playwright/test";

import type { MenuRow } from "../fixtures/roles";
import {
    expectDenied,
    expectLeaveOfferedThenStay,
    expectMenu,
    expectPlanReadOnly,
    expectSettingsTabs,
    NORTHWIND_NAME,
    ONLY_OWNER_CAN_CHANGE,
    openNorthwindAs,
} from "../fixtures/roles";
import { people } from "../fixtures/sessions";

/**
 * An Admin, in the browser: Arun on Northwind (the showcase seed).
 *
 * An Admin holds everything but the powers that are the owner's alone
 * (`OWNER_ONLY_ACTIONS` in the API's `organization-policy.ts`: closing the
 * business, its web address, and what it pays Saroh), so the menu is the
 * whole of `NAV_GROUPS` for Northwind's modules, and Settings is every tab
 * but Your data (`SETTINGS_PAGES`, `ownerOnly`). Plan and billing opens to
 * read, and changes nothing (DEC-131, amended 2026-10-11). What an Admin is
 * kept from is the business's only owner: not removed, not moved to another
 * role (the API's last-owner rule, `organization-members.service.ts`).
 *
 * Nothing here is saved: every sheet and confirm is closed by its way out.
 */

/**
 * Every row of `NAV_GROUPS` (`components/shared/navigation/nav-items.tsx`) whose module
 * Northwind runs. Sell › Stock is drawn only while the business tracks stock,
 * which a product spec may have turned off, so it is allowed and not asked.
 * Class packs is not in it: the module is not offered on any plan (DEC-099),
 * so it is hidden from the menu for every role, whatever the seed turned on.
 */
const MENU: readonly MenuRow[] = [
    { label: "Home", href: "/" },
    { label: "Calendar", href: "/calendar" },
    { label: "Website", href: "/sites" },
    {
        label: "Sell",
        href: "/commerce",
        pages: [
            { label: "Orders", href: "/commerce/orders" },
            { label: "Products", href: "/commerce/products" },
            { label: "Stock", href: "/commerce/stock", optional: true },
            { label: "Customers", href: "/commerce/customers" },
            { label: "Discount codes", href: "/commerce/discounts" },
            { label: "Location", href: "/commerce/locations" },
        ],
    },
    {
        label: "Bookings",
        href: "/bookings",
        pages: [
            { label: "Bookings", href: "/bookings" },
            { label: "Services", href: "/services" },
            { label: "Hours and time off", href: "/bookings/availability" },
            { label: "Courses", href: "/courses" },
        ],
    },
    {
        label: "Payments",
        href: "/billing",
        pages: [
            { label: "Subscriptions", href: "/billing/subscriptions" },
            { label: "Invoices", href: "/billing/invoices" },
        ],
    },
    { label: "Contacts", href: "/contacts" },
    { label: "Leads", href: "/leads" },
    { label: "Pipeline", href: "/pipeline" },
    { label: "Insights", href: "/analytics" },
    { label: "Settings", href: "/settings" },
];

/** `SETTINGS_PAGES` without Your data, which is the owner's by role. */
const SETTINGS = [
    "/settings/organization",
    "/settings/people",
    "/settings/modules",
    "/settings/billing",
    "/settings/profile",
    "/settings/share",
    "/settings/activity",
    "/settings/providers",
];

test.describe("an Admin", () => {
    test.beforeEach(async ({ page }) => {
        await openNorthwindAs(page, "admin");
    });

    test("is offered the whole menu, and every Settings tab but Your data", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await expectMenu(page, MENU);
        await expectSettingsTabs(page, SETTINGS);
    });

    test("is told Your data is the owner's when they open its address", async ({
        page,
    }) => {
        await expectDenied(page, "/settings/data", {
            thing: "the business's data",
            who: ONLY_OWNER_CAN_CHANGE,
        });
        // Nothing to download is drawn behind the denial.
        await expect(
            page.getByRole("button", { name: /download/i }),
        ).toHaveCount(0);
    });

    test("reads the only owner on Team, and can't remove them or change their role", async ({
        page,
    }) => {
        await page.goto("/settings/people");
        const roster = page.getByRole("listitem").filter({
            has: page.getByRole("button", {
                name: /role and permissions$/,
            }),
        });
        const owner = roster.filter({ hasText: people.owner.email });
        await expect(owner).toBeVisible();

        // An Admin does remove people, so the missing button is the rule
        // and not the page: someone else's row has it, the owner's doesn't.
        await expect(
            page
                .getByRole("button", {
                    name: new RegExp(`^Remove .+ from ${NORTHWIND_NAME}$`),
                })
                .first(),
        ).toBeVisible();
        await expect(
            owner.getByRole("button", { name: /^Remove / }),
        ).toHaveCount(0);

        // Their role opens to read. Every role is off, Save is off, and
        // the sheet says why.
        await owner
            .getByRole("button", { name: /role and permissions$/ })
            .click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toContainText(
            `${NORTHWIND_NAME} keeps at least one owner. Make someone else an owner before changing or removing this one.`,
        );
        const roles = sheet
            .getByRole("radiogroup", { name: "Role" })
            .getByRole("radio");
        await expect(roles.first()).toBeVisible();
        await expect(roles.and(page.locator(":enabled"))).toHaveCount(0);
        await expect(
            sheet.getByRole("button", { name: "Save", exact: true }),
        ).toBeDisabled();
        await expect(
            sheet.getByRole("button", {
                name: `Remove from ${NORTHWIND_NAME}`,
            }),
        ).toHaveCount(0);
        await sheet.getByRole("button", { name: "Cancel" }).click();
        await expect(sheet).toBeHidden();

        // Their own row is where they would leave from; nobody removes
        // themselves.
        const self = roster.filter({ hasText: people.admin.email });
        await expect(
            self.getByRole("button", { name: `Leave ${NORTHWIND_NAME}` }),
        ).toBeVisible();
        await expect(
            self.getByRole("button", { name: /^Remove / }),
        ).toHaveCount(0);
    });

    test("opens Settings › Plan and billing to read, and is offered no way to change it", async ({
        page,
    }) => {
        // The plan, the plans and the invoices, the note that only the
        // owner can change it, and no control that would: a plan's button,
        // a coupon, the payment method, a payment to carry on, an add-on.
        await expectPlanReadOnly(page);
        await expect(
            page
                .getByRole("navigation", { name: "Settings" })
                .getByRole("link", { name: /^Plan and billing/ }),
        ).toHaveAttribute("aria-current", "page");
    });

    test("is offered Leave on Your profile, and stays", async ({ page }) => {
        await expectLeaveOfferedThenStay(page);
    });
});

test("the only owner reads why they can't leave, where the button would be", async ({
    page,
}) => {
    await openNorthwindAs(page, "owner");
    await page.goto("/settings/profile");
    const section = page.getByRole("region", {
        name: `Leave ${NORTHWIND_NAME}`,
    });
    await expect(section).toContainText(
        `You're the only owner of ${NORTHWIND_NAME}, and it always needs one. To leave, make someone else an owner first in Settings › Team.`,
    );
    await expect(section.getByRole("button")).toHaveCount(0);
});
