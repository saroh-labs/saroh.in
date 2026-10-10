// @covers accounts:/login app:/open app:/ app:/commerce/orders app:/commerce/products app:/commerce/locations app:/commerce/locations/[storeId]/people app:/contacts app:/bookings app:/settings/modules app:/settings/people app:/settings/billing app:/settings/profile api:orders api:stores api:members api:organizations api:capabilities
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    ADDRESS,
    makeOrder,
    northwind,
    NW_STORE,
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
    NORTHWIND_NAME,
    openNorthwindAs,
} from "../fixtures/roles";
import { people } from "../fixtures/sessions";
import { takeProduct } from "../fixtures/throwaway-products";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A location's team, in the browser: Farah, a Viewer on Northwind's first
 * location and on the team as Location team (F16, DEC-074; the seed's
 * `storefront-teammate.ts`).
 *
 * The role reads the business, its team, its modules, its locations and
 * products, and works the orders of the locations the person is on
 * (`STOREFRONT_TEAM_ACTIONS`; the API's `orders/order-location.ts`). The
 * menu offers the work: Sell with Orders alone (`sellOrdersOnly`).
 *
 * `storefront-team-orders.spec.ts` moves an order as her. Here the orders
 * are only read, on two the owner makes for the test, one at each location.
 */

/** Northwind's first location, as the seed names it; Farah works here. */
const HER_LOCATION = `${NORTHWIND_NAME} Store`;
/** Northwind's other location, which she isn't on. */
const ONLINE = "seed_store_online";
/** An untracked product at Online, so the order holds no one's stock. */
const ONLINE_LINE = "E2E Online Line";

/**
 * `NAV_GROUPS` (`components/shared/nav-items.tsx`) for the role's
 * permissions, then `sellOrdersOnly`: Sell lands on Orders and holds only
 * that. Website, Bookings and Contacts are modules out of the role's reach.
 */
const MENU: readonly MenuRow[] = [
    { label: "Home", href: "/" },
    { label: "Overview", href: "/calendar" },
    {
        label: "Sell",
        href: "/commerce/orders",
        pages: [{ label: "Orders", href: "/commerce/orders" }],
    },
    { label: "Settings", href: "/settings" },
];

/** `SETTINGS_PAGES` the role opens: the team, the modules, their own. */
const SETTINGS = ["/settings/people", "/settings/modules", "/settings/profile"];

/** The Orders list at this width: the desk grid or the phone cards. */
const orders = (page: Page) =>
    page.getByRole("list", { name: "Orders" }).filter({ visible: true });

/** An unpaid order at Online, shipped to a customer made for the test. */
async function onlineOrder(
    request: APIRequestContext,
    tag: string,
): Promise<{ id: string; orderId: string }> {
    const nw = northwind(request);
    const productId = await takeProduct(
        request,
        { organizationId: NORTHWIND_ORG, storeId: ONLINE },
        ONLINE_LINE,
        { price: "90.00", status: "PUBLISHED" },
    );
    const { id } = await nw.post<{ id: string }>(`/stores/${ONLINE}/orders`, {
        customer: {
            email: `e2e-role-${tag}@example.com`,
            name: `Online ${tag}`,
        },
        items: [{ productId, quantity: 1 }],
        fulfilment: "SHIPPING",
        address: ADDRESS,
    });
    const read = await nw.get<{ orderId: string }>(`/orders/${id}`);
    return { id, orderId: read.orderId };
}

test.describe("someone on a location's team", () => {
    test("is offered their location's orders, and Settings to read", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await openNorthwindAs(page, "storefront");
        await expectMenu(page, MENU);
        await expectSettingsTabs(page, SETTINGS);
    });

    test("is told who can change it when they open customers or the diary", async ({
        page,
    }) => {
        await openNorthwindAs(page, "storefront");
        await expectDenied(page, "/contacts", { thing: "Contacts" });
        await expectDenied(page, "/bookings", { thing: "Bookings" });
    });

    test("sees the orders of their location only, without money or a way to take one", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        const owner = await asOwner(browser);
        const tag = stamp(testInfo);
        const mine = await makeOrder(owner.request, { stage: "PREPARING" });
        const theirs = await onlineOrder(owner.request, tag);
        try {
            await openNorthwindAs(page, "storefront");

            // Hers is listed; Online's is not.
            await page.goto(`/commerce/orders?q=${mine.orderId}`);
            await expect(
                orders(page)
                    .getByRole("listitem")
                    .filter({ hasText: `#${mine.orderId}` }),
            ).toBeVisible();
            await expectNotOffered(page, "New order");
            await expectNotOffered(page, "Export");
            await page.goto(`/commerce/orders?q=${theirs.orderId}`);
            await expect(page.getByText(/No orders match/)).toBeVisible();
            await expect(page.getByText(`#${theirs.orderId}`)).toHaveCount(0);

            // Hers opens as the kitchen sees it: the stage to move, no money.
            await page.goto(`/commerce/orders/${mine.id}`);
            await expect(
                page.getByRole("group", { name: /Preparing, step 2 of 4/ }),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: "Mark ready", exact: true }),
            ).toBeEnabled();
            await expect(
                page.getByRole("region", { name: "Money" }),
            ).toHaveCount(0);
            await expect(page.getByText(/₹/)).toHaveCount(0);

            // Online's isn't there for her, even by its address.
            await page.goto(`/commerce/orders/${theirs.id}`);
            await expect(page.getByText("Order not found")).toBeVisible();
        } finally {
            // Put the business back: hers collected, Online's cancelled.
            const headers = northwind(owner.request).headers;
            const order = (id: string, step: string) =>
                `${urls.API_URL}/organizations/${NORTHWIND_ORG}/orders/${id}/${step}`;
            for (const to of ["READY", "COLLECTED"]) {
                await owner.request.post(order(mine.id, "stage"), {
                    headers,
                    data: { to },
                });
            }
            await owner.request.post(order(theirs.id, "cancel"), {
                headers,
                data: { idempotencyKey: `e2e-role-${tag}` },
            });
            await owner.close();
        }
    });

    test("reads the modules and the team, with nothing to change", async ({
        page,
    }) => {
        await openNorthwindAs(page, "storefront");

        await page.goto("/settings/modules");
        await expect(
            page.getByText(
                "Your role can see what this business runs on but not change it.",
            ),
        ).toBeVisible();
        // The switches are shown, and every one is off to her.
        const switches = page.getByRole("switch");
        await expect(switches.first()).toBeVisible();
        await expect(page.getByRole("switch", { disabled: false })).toHaveCount(
            0,
        );
        await expectNotOffered(page, /^Turn on /);

        await page.goto("/settings/people");
        await expect(
            page.getByText(/Only owners and admins can change this\./),
        ).toBeVisible();
        await expectNotOffered(page, /^Invite someone/);
        await expect(
            page.getByRole("button", { name: /^Remove / }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: /role and permissions$/ }),
        ).toHaveCount(0);
        // Her own row says where she works and as what.
        const self = page
            .getByRole("listitem")
            .filter({ hasText: people.storefront.email });
        await expect(self).toContainText(`${HER_LOCATION} · Viewer`);
    });

    test("gets what the invitation to a location says they get", async ({
        page,
        browser,
    }) => {
        // What the owner reads when inviting someone to her location.
        // At the desk, whichever project runs this: she is the one who
        // may be on the phone.
        const context = await browser.newContext({
            baseURL: urls.APP_URL,
            ignoreHTTPSErrors,
            viewport: { width: 1440, height: 900 },
        });
        const owner = await context.newPage();
        try {
            await openNorthwindAs(owner, "owner");
            await owner.goto(`/commerce/locations/${NW_STORE}/people`);
            await owner.getByRole("button", { name: "Invite someone" }).click();
            const sheet = owner.getByRole("dialog", { name: "Invite someone" });
            await expect(sheet).toContainText(
                `They can see ${HER_LOCATION}'s products and orders, and move its orders along, once they accept.`,
            );
            await expect(sheet).toContainText(
                "They also join your team as Location team, unless they are on it already.",
            );
            await sheet.getByRole("button", { name: "Cancel" }).click();
            await expect(sheet).toBeHidden();
        } finally {
            await context.close();
        }

        // And what she has: the orders (above), and the products to read.
        await openNorthwindAs(page, "storefront");
        await page.goto("/commerce/products");
        await expect(
            page.getByRole("heading", { name: "Products", exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: /^You can't open/ }),
        ).toHaveCount(0);
        await expectNotOffered(page, "New product");
        // On the team as the role the invitation names.
        await page.goto("/settings/people");
        await expect(
            page
                .getByRole("listitem")
                .filter({ hasText: people.storefront.email }),
        ).toContainText("Location team");
    });

    test("has no way to the plans, and reads who has", async ({ page }) => {
        await openNorthwindAs(page, "storefront");
        await expectNoWayToPlans(page);
    });

    test("is offered Leave on Your profile, naming the location they come off, and stays", async ({
        page,
    }) => {
        await openNorthwindAs(page, "storefront");
        await expectLeaveOfferedThenStay(page, { locations: [HER_LOCATION] });
    });
});
