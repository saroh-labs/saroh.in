// @covers accounts:/login app:/open app:/commerce/orders api:orders api:organizations api:home
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { ADDRESS, makeOrder, northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { takeProduct } from "../fixtures/throwaway-products";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A location's team sees and moves that location's orders (DEC-074).
 *
 * Farah is on Northwind's team as "Storefront team", with a Viewer's role
 * on Northwind Store and none on Online (the seed's
 * `storefront-teammate.ts`). The test makes its own two orders on
 * Northwind — one at Northwind Store, paid and being prepared, and one at
 * Online — and signs in as her: Sell holds Orders alone, her storefront's
 * order is listed and moves to Ready without a rupee on the page, and
 * Online's is neither listed nor opened. Afterwards the owner collects the
 * first and cancels the second.
 */

const ONLINE = "seed_store_online";
/** An untracked product at Online, so the order holds no one's stock. */
const ONLINE_LINE = "E2E Online Line";

/** The owner's side: their own context, so Farah's page stays hers. */
async function ownerRequest(
    browser: Browser,
): Promise<{ request: APIRequestContext; close: () => Promise<void> }> {
    const context = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const page = await context.newPage();
    await useSession(page, "owner");
    return { request: page.request, close: () => context.close() };
}

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
            email: `e2e-dec074-${tag}@example.com`,
            name: `Online ${tag}`,
        },
        items: [{ productId, quantity: 1 }],
        fulfilment: "SHIPPING",
        address: ADDRESS,
    });
    const read = await nw.get<{ orderId: string }>(`/orders/${id}`);
    return { id, orderId: read.orderId };
}

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 760;

/** The Orders list at this width: the desk grid or the phone cards. */
const orders = (page: Page) =>
    page.getByRole("list", { name: "Orders" }).locator("visible=true");

/** Two Toasters are mounted (one per theme); only one is ever shown. */
const shown = (page: Page, text: string | RegExp) =>
    page.getByText(text).locator("visible=true").first();

test("a storefront teammate sees and moves only their storefront's orders (DEC-074)", async ({
    page,
    browser,
}, testInfo) => {
    test.setTimeout(120_000);
    const owner = await ownerRequest(browser);
    const tag = stamp(testInfo);
    const mine = await makeOrder(owner.request, { stage: "PREPARING" });
    const theirs = await onlineOrder(owner.request, tag);

    try {
        await useSession(page, "storefront");
        await page.goto(`/open/${NORTHWIND_ORG}`);
        await page.goto("/commerce/orders");
        await expect(
            page.getByRole("heading", { name: "Orders" }),
        ).toBeVisible();

        // Sell holds Orders alone: no Products, Stock or Storefronts.
        const rail = onPhone(page)
            ? page.getByRole("navigation", { name: "Main" })
            : page.getByRole("navigation", { name: "Primary" });
        for (const gone of [
            "/commerce/products",
            "/commerce/stock",
            "/commerce/storefronts",
            "/commerce/customers",
        ]) {
            await expect(rail.locator(`a[href="${gone}"]`)).toHaveCount(0);
        }
        if (!onPhone(page)) {
            await expect(
                rail.locator('a[href="/commerce/orders"]').first(),
            ).toBeVisible();
        }

        // Her storefront's order is listed; Online's is not.
        await page.goto(`/commerce/orders?q=${mine.orderId}`);
        await expect(
            orders(page)
                .getByRole("listitem")
                .filter({ hasText: `#${mine.orderId}` }),
        ).toBeVisible();
        await page.goto(`/commerce/orders?q=${theirs.orderId}`);
        await expect(page.getByText(/No orders match/)).toBeVisible();
        await expect(page.getByText(`#${theirs.orderId}`)).toHaveCount(0);

        // She moves hers to Ready, and sees no money doing it.
        await page.goto(`/commerce/orders/${mine.id}`);
        await expect(
            page.getByRole("group", { name: /Preparing, step 2 of 4/ }),
        ).toBeVisible();
        await expect(page.getByRole("region", { name: "Money" })).toHaveCount(
            0,
        );
        await expect(page.getByText(/₹/)).toHaveCount(0);
        await page
            .getByRole("button", { name: "Mark ready", exact: true })
            .click();
        await page.getByRole("button", { name: "Mark now" }).click();
        await expect(shown(page, "Marked ready.")).toBeVisible();
        await expect(
            page.getByRole("group", { name: /Ready, step 3 of 4/ }),
        ).toBeVisible();

        // Online's order isn't there for her, even by its address.
        await page.goto(`/commerce/orders/${theirs.id}`);
        await expect(page.getByText("No order here")).toBeVisible();
    } finally {
        // Put the business back: hers collected, Online's cancelled.
        const nw = northwind(owner.request);
        await owner.request.post(
            `${urls.API_URL}/organizations/${NORTHWIND_ORG}/orders/${mine.id}/stage`,
            { headers: nw.headers, data: { to: "COLLECTED" } },
        );
        await owner.request.post(
            `${urls.API_URL}/organizations/${NORTHWIND_ORG}/orders/${theirs.id}/cancel`,
            {
                headers: nw.headers,
                data: { idempotencyKey: `e2e-dec074-${tag}` },
            },
        );
        await owner.close();
    }
});
