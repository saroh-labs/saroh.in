import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * The Orders list's rows and tabs (plan B, B3), after "Saroh Orders Screen":
 * All · Open · Refunded with the API's counts, a step pill with its progress
 * said in words, the age or "Late", the unpaid line, and paging by the API's
 * cursor — against the seeded stack.
 *
 * Read-only: nothing here writes. Northwind Supply is the generic dev
 * business; Rye & Co. is a film set and is only read, by its Member.
 */

const NORTHWIND = "seed_org";
const RYE = "seed_sc_rc_org";

const member = {
    email: "nisha.kulkarni@saroh.dev",
    password: "demo-password-123",
};

interface Row {
    id: string;
    orderId: string;
    standing: string;
    store: { id: string; name: string };
    fulfilmentType: string;
    late?: boolean;
    total?: string;
}
interface ListPage {
    rows: Row[];
    counts: { all: number; open: number; refunded: number };
    nextCursor: string | null;
}

async function signIn(page: Page, who = demoUser) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

async function memberPage(browser: Browser): Promise<Page> {
    const context = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const page = await context.newPage();
    await signIn(page, member);
    return page;
}

/** One page of the list, as the screen asks for it. */
async function list(page: Page, org: string, query = ""): Promise<ListPage> {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${org}/orders?v=2${query}`,
        { headers: { "x-organization-id": org, origin: urls.APP_URL } },
    );
    expect(res.ok()).toBe(true);
    return (await res.json()) as ListPage;
}

/** The list the page draws at this width: the desk grid or the phone cards. */
const orders = (page: Page) =>
    page.getByRole("list", { name: "Orders" }).locator("visible=true");

const tab = (page: Page, name: string) =>
    page.getByRole("navigation", { name: "Orders" }).getByRole("link", {
        name: new RegExp(`^${name}`),
    });

test.describe("orders list", () => {
    test("the Open tab lists only open orders, with the API's counts", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const all = await list(page, NORTHWIND);
        const open = await list(page, NORTHWIND, "&tab=open");

        await page.goto("/commerce/orders");
        await expect(tab(page, "All")).toHaveAttribute("aria-current", "true");
        for (const [name, n] of [
            ["All", all.counts.all],
            ["Open", all.counts.open],
            ["Refunded", all.counts.refunded],
        ] as const) {
            await expect(tab(page, name)).toContainText(String(n));
        }

        await tab(page, "Open").click();
        await expect(page).toHaveURL(/tab=open/);
        await expect(tab(page, "Open")).toHaveAttribute("aria-current", "true");
        const shown = orders(page).getByRole("listitem");
        if (open.rows.length === 0) {
            await expect(
                page.getByText("Nothing left to fulfil"),
            ).toBeVisible();
            return;
        }
        await expect(shown).toHaveCount(open.rows.length);
        // Nothing refunded or cancelled is on the Open tab.
        await expect(
            orders(page).getByText(/^(Refunded|Cancelled)$/),
        ).toHaveCount(0);
        await expect(shown.first()).toContainText(
            `#${open.rows.at(0)?.orderId}`,
        );
    });

    test("a late Pick-up order reads Late, in words", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const late = await list(
            page,
            NORTHWIND,
            "&tab=open&late=true&fulfilment=PICKUP",
        );
        const order = late.rows.at(0);
        test.skip(!order, "No open Pick-up order is past its threshold here.");
        if (!order) return;

        await page.goto(`/commerce/orders?tab=open&q=${order.orderId}`);
        const row = orders(page)
            .getByRole("listitem")
            .filter({ hasText: `#${order.orderId}` });
        await expect(row.getByText(/^Late · /)).toBeVisible();
        await expect(
            row.getByRole("img", { name: /^Step \d of \d · Pick-up/ }),
        ).toBeVisible();
    });

    test("pages by the cursor, and back", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const first = await list(page, NORTHWIND);
        test.skip(!first.nextCursor, "Fewer than one page of orders here.");

        await page.goto("/commerce/orders");
        await expect(
            page.getByText(`Showing 1–50 of ${first.counts.all}`),
        ).toBeVisible();
        await page.getByRole("link", { name: "Next" }).click();
        await expect(page).toHaveURL(/cursor=/);
        await expect(page.getByText(/Showing 51–/)).toBeVisible();
        await page.getByRole("link", { name: "Previous" }).click();
        await expect(
            page.getByText(`Showing 1–50 of ${first.counts.all}`),
        ).toBeVisible();
        await expect(page).not.toHaveURL(/cursor=/);
    });

    test("one storefront names none on its rows", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const { rows } = await list(page, NORTHWIND);
        test.skip(rows.length === 0, "No orders here.");

        await page.goto("/commerce/orders");
        const filter = page.getByRole("button", { name: /Storefront filter/ });
        const row = orders(page).getByRole("listitem").first();
        if ((await filter.count()) === 0) {
            // One storefront: nothing to tell apart.
            await expect(row).not.toContainText(rows.at(0)?.store.name ?? "");
        } else {
            await expect(row).toContainText(rows.at(0)?.store.name ?? "");
        }
    });

    test("on a phone the rows stack, and the whole row opens the order", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const { rows } = await list(page, NORTHWIND);
        test.skip(rows.length === 0, "No orders here.");

        await page.goto("/commerce/orders");
        const card = orders(page).getByRole("listitem").first();
        await expect(card).toBeVisible();
        const doc = await page.evaluate(() => ({
            vw: window.innerWidth,
            sw: document.documentElement.scrollWidth,
        }));
        expect(doc.sw).toBeLessThanOrEqual(doc.vw);

        // Tap the card away from the name: the link's hit area is the card.
        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        if (!box) return;
        await page.mouse.click(box.x + box.width - 12, box.y + box.height - 8);
        await expect(page).toHaveURL(/\/commerce\/orders\/[^/?]+/);
    });

    test("the kitchen sees the pill and progress, and no money", async ({
        browser,
    }) => {
        const page = await memberPage(browser);
        await page.goto(`/open/${RYE}`);
        await page.goto("/commerce/orders");
        await expect(
            page.getByRole("heading", { name: "Orders" }),
        ).toBeVisible();
        await expect(page.getByText(/₹/)).toHaveCount(0);
        await expect(page.getByText(/unpaid$/)).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Export" })).toHaveCount(
            0,
        );
        const { rows } = await list(page, RYE, "&tab=open");
        if (rows.length > 0) {
            // Money is left out by the API, not hidden by the screen.
            expect(rows.every((r) => r.total === undefined)).toBe(true);
            await tab(page, "Open").click();
            await expect(
                orders(page)
                    .getByRole("img", { name: /^Step \d+ of \d+ · / })
                    .first(),
            ).toBeVisible();
        }
        await page.close();
    });
});
