// @covers accounts:/login app:/open app:/commerce/orders app:/commerce/orders/tickets api:orders api:payments api:customer-workspace
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { makeOrder } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { demoUser, ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * The Orders list's rows and tabs (plan B, B3), after "Saroh Orders Screen":
 * All · Open · Refunded with the API's counts, a step pill with its progress
 * said in words, the age or "Late", the unpaid line, and paging by the API's
 * cursor — against the seeded stack.
 *
 * Counts, pages and "the first row" are read on Rye & Co., as its owner:
 * a film set, which no test writes to, so what the API said a moment ago is
 * still what the screen draws. Northwind's orders are made and moved by the
 * order specs running beside this one. The writes here — a step and its
 * Undo, a new pay link — go to Northwind, on orders each test makes itself
 * (`fixtures/own-data.ts`).
 */

const NORTHWIND = "seed_org";
const RYE = "seed_sc_rc_org";
/** Where lists and counts are read: nothing changes them mid-test. */
const LISTS = RYE;

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
    steps?: { label: string }[];
    stepIndex?: number;
}
interface ListPage {
    rows: Row[];
    counts: { all: number; open: number; refunded: number };
    nextCursor: string | null;
}

async function signIn(page: Page, who = demoUser) {
    await useSession(page, who);
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

/**
 * Whether the page draws the phone cards (under 760px). The card, as the
 * design draws it, has the pill, the fulfilment in words and the age, and no
 * step bar: the bar and its "Step 2 of 4 · …" are the desk grid's.
 */
const cards = (page: Page) => (page.viewportSize()?.width ?? 1440) < 760;

/**
 * The filter bar at this width (B4, B5). At the desk it is on the page; on a
 * phone it sits in a sheet behind the Filters button, which this opens. The
 * button is drawn once per layout (hidden at the desk), so only the visible
 * one is pressed.
 */
async function filterBar(page: Page) {
    if (cards(page)) {
        await page
            .getByRole("button", { name: /^Filters/ })
            .filter({ visible: true })
            .click();
        return page
            .getByRole("dialog", { name: "Filter orders" })
            .getByRole("group", { name: "Filter orders" });
    }
    return page
        .getByRole("group", { name: "Filter orders" })
        .filter({ visible: true });
}

const tab = (page: Page, name: string) =>
    page.getByRole("navigation", { name: "Orders" }).getByRole("link", {
        name: new RegExp(`^${name}`),
    });

test.describe("orders list", () => {
    test("the Open tab lists only open orders, with the API's counts", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const all = await list(page, LISTS);
        const open = await list(page, LISTS, "&tab=open");

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

    test("a search that finds nothing is empty for the search, not failed", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const q = "no-such-order-b7";
        await page.goto(`/commerce/orders?q=${q}`);
        await expect(
            page.getByRole("heading", { name: `No orders match “${q}”` }),
        ).toBeVisible();
        // Not the failed state, and not a business with no orders.
        await expect(page.getByText("Couldn't load orders")).toHaveCount(0);
        await expect(page.getByText("No orders yet")).toHaveCount(0);
        await page.getByRole("button", { name: "Clear search" }).click();
        await expect(page).not.toHaveURL(/q=/);
    });

    test("an empty tab says what would land there", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const refunded = await list(page, LISTS, "&tab=refunded");
        test.skip(refunded.rows.length > 0, "Northwind has refunds here.");

        await page.goto("/commerce/orders?tab=refunded");
        await expect(
            page.getByRole("heading", { name: "No refunds", exact: true }),
        ).toBeVisible();
        await page.getByRole("button", { name: "View all orders" }).click();
        await expect(tab(page, "All")).toHaveAttribute("aria-current", "true");
    });

    test("a late Pick-up order reads Late, in words", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const late = await list(
            page,
            LISTS,
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
        if (cards(page)) {
            await expect(
                row.getByText("Pick-up", { exact: true }),
            ).toBeVisible();
        } else {
            await expect(
                row.getByRole("img", { name: /^Step \d of \d · Pick-up/ }),
            ).toBeVisible();
        }
    });

    test("pages by the cursor, and back", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const first = await list(page, LISTS);
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

    test("rows name their storefront only when there are several", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const { rows } = await list(page, LISTS);
        test.skip(rows.length === 0, "No orders here.");

        await page.goto("/commerce/orders");
        const filter = page.getByRole("button", { name: /Location filter/ });
        const row = orders(page).getByRole("listitem").first();
        // Counting the filter before the list is drawn counts nothing.
        await expect(row).toBeVisible();
        const storeName = rows.at(0)?.store.name ?? "";
        if ((await filter.count()) === 0 || cards(page)) {
            // One storefront: nothing to tell apart. The phone card, as the
            // design draws it, never has the line; the filter tells them
            // apart there.
            await expect(row).not.toContainText(storeName);
        } else {
            await expect(row).toContainText(storeName);
        }
    });

    test("on a phone the rows stack, and the whole row opens its quick view (B5)", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const { rows } = await list(page, LISTS);
        test.skip(rows.length === 0, "No orders here.");

        await page.goto("/commerce/orders");
        const card = orders(page).getByRole("listitem").first();
        await expect(card).toBeVisible();
        const doc = await page.evaluate(() => ({
            vw: window.innerWidth,
            sw: document.documentElement.scrollWidth,
        }));
        expect(doc.sw).toBeLessThanOrEqual(doc.vw);
        // The page fitting is not enough: no card or box inside it may hide
        // a column sideways (Phone Tables audit T10).
        await expectNothingHiddenSideways(page);

        // The filters are behind one button now (B5), so the first card
        // starts above the fold rather than under a wall of menus.
        const top = await card.boundingBox();
        expect(top).not.toBeNull();
        expect((top?.y ?? 9999) + 40).toBeLessThan(844 - 53);

        // Tap the card away from the name: the button's hit area is the
        // card, and it opens the quick view as a sheet, not the page.
        await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        if (!box) return;
        await page.mouse.click(box.x + box.width - 12, box.y + box.height - 8);
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        await expect(page).toHaveURL(/\/commerce\/orders(\?|$)/);
        await expect(sheet).toContainText(`#${rows[0]?.orderId ?? ""}`);
        const full = sheet.getByRole("link", { name: /Open full page/ });
        await expect(full).toBeVisible();
        await full.click();
        await expect(page).toHaveURL(/\/commerce\/orders\/[^/?]+/);
    });

    test("on a phone the filters open from one button, and say how many are on (B5)", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        await page.goto("/commerce/orders");
        // The list's own toolbar first: before it is drawn, "no filter
        // menus" holds on an empty page.
        await expect(
            page
                .getByRole("button", { name: /^Filters/ })
                .filter({ visible: true }),
        ).toBeVisible();

        // No filter menus on the page itself at this width.
        await expect(
            page.getByRole("group", { name: "Filter orders" }),
        ).toHaveCount(0);
        const button = page
            .getByRole("button", { name: /^Filters/ })
            .filter({ visible: true });
        await expect(button).toHaveCount(1);
        await expect(button).toHaveAttribute("aria-label", "Filters");
        await expect(button).toHaveCSS("cursor", "pointer");

        await button.click();
        const sheet = page.getByRole("dialog", { name: "Filter orders" });
        await expect(sheet).toBeVisible();
        const bar = sheet.getByRole("group", { name: "Filter orders" });
        await expect(bar.getByRole("combobox", { name: "Date" })).toBeVisible();
        await bar.getByRole("button", { name: "Late" }).click();
        await expect(page).toHaveURL(/late=true/);
        await expect(bar.getByRole("button", { name: "Late" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );

        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(sheet).toHaveCount(0);
        await expect(button).toHaveAttribute("aria-label", "Filters, 1 on");

        // Clear filters, from the sheet, empties the address.
        await button.click();
        await page
            .getByRole("dialog", { name: "Filter orders" })
            .getByRole("button", { name: "Clear filters" })
            .click();
        await expect(page).not.toHaveURL(/late=/);
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
            await expect(page).toHaveURL(/tab=open/);
            // The pill says the step in words on either layout; the desk
            // grid adds the bar, itself said in words.
            const top = rows.at(0);
            const step = top?.steps?.at(top.stepIndex ?? 0)?.label;
            if (top && step) {
                await expect(
                    orders(page)
                        .getByRole("listitem")
                        .filter({ hasText: `#${top.orderId}` }),
                ).toContainText(step);
            }
            if (!cards(page)) {
                await expect(
                    orders(page)
                        .getByRole("img", { name: /^Step \d+ of \d+ · / })
                        .first(),
                ).toBeVisible();
            }
        }
        await page.close();
    });
});

interface FilterOptions {
    types: { type: string; label: string }[];
    steps: { key: string; label: string; types: string[] }[];
}

/** What the filter bar offers, as the screen asks for it (B4). */
async function filterOptions(page: Page, org: string): Promise<FilterOptions> {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${org}/orders/filters`,
        { headers: { "x-organization-id": org, origin: urls.APP_URL } },
    );
    expect(res.ok()).toBe(true);
    return (await res.json()) as FilterOptions;
}

/**
 * A treatment's row says its next visit (B14, DEC-067): "Next 19 Sep,
 * 10:00", or "Next visit not booked". Kavi Dental is a film set: read only.
 */
test.describe("a treatment's next visit on the row (B14)", () => {
    const KAVI = "seed_sc_kavi_org";

    test("each open treatment's row says when its next visit is", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${KAVI}`);
        const { rows } = await list(page, KAVI, "&tab=open");
        const treatments = (
            rows as (Row & {
                nextVisit?: { startAt: string; timezone: string } | null;
            })[]
        ).filter(
            (r) =>
                r.fulfilmentType.startsWith("APPOINTMENT_") &&
                r.nextVisit !== undefined,
        );
        test.skip(treatments.length === 0, "No open treatments on Kavi.");

        await page.goto("/commerce/orders?tab=open");
        for (const t of treatments.slice(0, 3)) {
            const row = orders(page)
                .getByRole("listitem")
                .filter({ hasText: `#${t.orderId}` });
            await expect(row).toContainText(
                t.nextVisit
                    ? /Next (today|yesterday|\d{1,2} \w{3})/
                    : "Next visit not booked",
            );
            await expect(row).not.toContainText(/\bLate\b/);
        }
    });

    test("at the desk, a row's status never runs into its Placed column", async ({
        page,
    }) => {
        test.skip(cards(page), "The phone draws cards, not columns.");
        await signIn(page);
        // Kavi's rows carry "Next 2 Oct, 10:45" and an unpaid line; Rye's a
        // "Handed to courier" pill: the longest words the column holds.
        for (const org of [KAVI, RYE]) {
            await page.goto(`/open/${org}`);
            await page.goto("/commerce/orders");
            await expect(
                orders(page).getByRole("listitem").first(),
            ).toBeVisible();
            await expect
                .poll(() =>
                    page.evaluate(() => {
                        const hits: string[] = [];
                        const list = [
                            ...document.querySelectorAll(
                                'ul[aria-label="Orders"]',
                            ),
                        ].find((l) => (l as HTMLElement).offsetParent !== null);
                        for (const li of list?.querySelectorAll(
                            ":scope > li",
                        ) ?? []) {
                            const cells = [...li.children];
                            // From the end: status, placed, total, the menu.
                            if (cells.length < 4) continue;
                            const status = cells[cells.length - 4];
                            const placed = cells[cells.length - 3];
                            const range = document.createRange();
                            range.selectNodeContents(placed);
                            const p = range.getBoundingClientRect();
                            for (const el of status.querySelectorAll("*")) {
                                if (el.children.length > 0) continue;
                                const r = el.getBoundingClientRect();
                                const meets =
                                    r.width > 0 &&
                                    r.right > p.left + 0.5 &&
                                    r.left < p.right &&
                                    r.bottom > p.top &&
                                    r.top < p.bottom;
                                if (meets) hits.push(String(el.textContent));
                            }
                        }
                        return hits;
                    }),
                )
                .toEqual([]);
        }
    });
});

test.describe("orders list filters (B4)", () => {
    test("step, fulfilment and date filters survive a reload", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const options = await filterOptions(page, LISTS);
        const type = options.types.at(0);
        const step = options.steps.find(
            (s) => type && s.types.includes(type.type),
        );
        test.skip(!type || !step, "No orders to filter here.");
        if (!type || !step) return;

        const address = `step=${step.key}&fulfilment=${type.type.toLowerCase()}&date=month`;
        const expected = await list(
            page,
            LISTS,
            `&step=${step.key}&fulfilment=${type.type}&date=month`,
        );
        await page.goto(`/commerce/orders?${address}`);
        await page.reload();
        await expect(page).toHaveURL(new RegExp(`step=${step.key}`));
        const bar = await filterBar(page);
        await expect(bar.getByRole("combobox", { name: "Step" })).toContainText(
            step.label,
        );
        await expect(
            bar.getByRole("combobox", { name: "How it's fulfilled" }),
        ).toContainText(type.label);
        await expect(bar.getByRole("combobox", { name: "Date" })).toContainText(
            "This month",
        );
        if (cards(page)) await page.keyboard.press("Escape");
        await expect(tab(page, "All")).toContainText(
            String(expected.counts.all),
        );
        if (expected.rows.length === 0) {
            await expect(
                page.getByRole("button", { name: "Clear filters" }).last(),
            ).toBeVisible();
        } else {
            await expect(orders(page).getByRole("listitem")).toHaveCount(
                expected.rows.length,
            );
        }
    });

    test("a filter that finds nothing says so, and Clear filters empties the address", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const empty = await list(page, LISTS, "&step=teleported");
        expect(empty.counts.all).toBe(0);

        await page.goto("/commerce/orders?step=teleported&date=today");
        await expect(page.getByText(/^No orders .*today$/)).toBeVisible();
        await expect(page.getByText("No orders yet")).toHaveCount(0);
        await page
            .getByRole("button", { name: "Clear filters" })
            .first()
            .click();
        await expect(page).not.toHaveURL(/step=|date=/);
    });

    test("Late and Needs attention are toggles in the address (B15)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        await page.goto("/commerce/orders");
        const bar = await filterBar(page);
        const late = bar.getByRole("button", { name: "Late" });
        await expect(late).toHaveAttribute("aria-pressed", "false");
        await late.click();
        await expect(page).toHaveURL(/late=true/);
        await expect(late).toHaveAttribute("aria-pressed", "true");

        const attention = bar.getByRole("button", { name: "Needs attention" });
        await expect(attention).toHaveAttribute("aria-pressed", "false");
        await attention.click();
        await expect(page).toHaveURL(/attention=true/);
        await expect(attention).toHaveAttribute("aria-pressed", "true");
        await page.reload();
        await expect(
            (await filterBar(page)).getByRole("button", {
                name: "Needs attention",
            }),
        ).toHaveAttribute("aria-pressed", "true");
    });

    test("a customer's allergy tags their orders, and the filter keeps them (B15)", async ({
        page,
    }) => {
        // Rye & Co. is read here, never changed: Priya's sesame allergy.
        await signIn(page);
        await page.goto(`/open/${RYE}`);
        await page.goto("/commerce/orders?attention=true");
        const tag = page
            .getByRole("img", { name: /^Allergy: Sesame/ })
            .locator("visible=true")
            .first();
        await expect(tag).toBeVisible();
        // The tag reads "Sesame", as the design shows (DEC-067).
        await expect(tag).toHaveText(/^Sesame( \+\d+)?$/);
        await expect(
            page.getByRole("img", { name: /Needs attention couldn't/ }),
        ).toHaveCount(0);
    });
});

/**
 * The quick view and the row menu (plan B, B5), at the desk. Opening,
 * reading and closing are read-only; the writes (a step and its Undo, a new
 * pay link) happen on Northwind only, never on a demo store.
 */
test.describe("orders quick view and row menu (B5)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.skip(
            testInfo.project.name.startsWith("phone"),
            "The row menu is drawn from 760px only; a phone's card opens the same quick view as a sheet, tested above.",
        );
        await page.setViewportSize({ width: 1440, height: 900 });
    });

    const grid = (page: Page) =>
        page.getByRole("list", { name: "Orders" }).first();
    const rowOf = (page: Page, orderId: string) =>
        grid(page)
            .getByRole("listitem")
            .filter({ hasText: `#${orderId}` });
    const quickView = (page: Page) => page.getByRole("dialog");
    /** The customer's name, which opens the row's quick view. */
    const openerOf = (page: Page, orderId: string) =>
        rowOf(page, orderId).locator('button[aria-haspopup="dialog"]');

    test("keyboard only: open, read and close, with focus back on the row", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const { rows } = await list(page, LISTS);
        const top = rows.at(0);
        test.skip(!top, "No orders here.");
        if (!top) return;

        await page.goto("/commerce/orders");
        const opener = openerOf(page, top.orderId);
        await opener.focus();
        await page.keyboard.press("Enter");
        const panel = quickView(page);
        await expect(panel).toBeVisible();
        await expect(panel).toContainText(`#${top.orderId}`);
        await expect(panel.getByRole("list", { name: "Steps" })).toBeVisible();
        await expect(
            panel.getByRole("link", { name: /Open full page/ }),
        ).toBeVisible();
        // As the design draws it (DEC-073): Close is a plain X, and a
        // customer with a record is a Saffron link to it.
        const close = panel.getByRole("button", { name: "Close quick view" });
        await expect(close).toBeVisible();
        await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        const customer = panel
            .getByRole("definition")
            .getByRole("link")
            .first();
        if (await customer.count()) {
            await expect(customer).toHaveAttribute("href", /\/customers\//);
            await expect(customer).toHaveClass(/text-brand/);
        }

        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await expect(opener).toBeFocused();
        // The list stayed where it was.
        await expect(page).toHaveURL(/\/commerce\/orders(\?|$)/);
    });

    test("the row menu opens by keyboard and names what's off, and why", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const { rows } = await list(page, LISTS);
        const top = rows.at(0);
        test.skip(!top, "No orders here.");
        if (!top) return;

        await page.goto("/commerce/orders");
        const trigger = rowOf(page, top.orderId).getByRole("button", {
            name: `More actions for order #${top.orderId}`,
        });
        await trigger.focus();
        await page.keyboard.press("Enter");
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await expect(
            menu.getByRole("menuitem", { name: "Open full page" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(trigger).toBeFocused();
    });

    test("Mark ready from the quick view updates the row, and Undo puts it back", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        // A Pick-up order of its own at Preparing: the newest, so the top of
        // the list's first page. Open, not "Preparing": once it is Ready a
        // Preparing list drops the row, and its quick view with it.
        const target = await makeOrder(page.request, { stage: "PREPARING" });

        await page.goto("/commerce/orders?tab=open");
        await openerOf(page, target.orderId).click();
        const panel = quickView(page);
        await panel.getByRole("button", { name: "Mark ready" }).click();
        await expect(page.getByText(`#${target.orderId} ready.`)).toBeVisible();
        // The panel reads the order again: it is at Ready now.
        await expect(panel.locator('[aria-current="step"]')).toHaveText(
            "Ready",
        );
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Undo" }).click();
        await expect(
            page.getByText(`#${target.orderId} is back to preparing.`),
        ).toBeVisible();
    });

    test("a quick view that can't be read says so in the panel; the list stays", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const { rows } = await list(page, LISTS);
        const top = rows.at(0);
        test.skip(!top, "No orders here.");
        if (!top) return;

        await page.goto("/commerce/orders");
        // The read goes through a Server Action: fail every one of them.
        await page.route("**/commerce/orders*", async (route) => {
            if (route.request().headers()["next-action"]) {
                await route.fulfill({ status: 500, body: "" });
            } else {
                await route.continue();
            }
        });
        await openerOf(page, top.orderId).click();
        await expect(quickView(page).getByRole("alert")).toBeVisible();
        // Behind the modal the list is hidden from the accessibility tree;
        // closing the panel shows it is still there, not replaced by an error.
        await page.keyboard.press("Escape");
        await expect(quickView(page)).toHaveCount(0);
        await expect(grid(page)).toBeVisible();
    });

    test("the kitchen's quick view and menu have no money, refund or pay link", async ({
        browser,
    }) => {
        const page = await memberPage(browser);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`/open/${RYE}`);
        const { rows } = await list(page, RYE);
        const top = rows.at(0);
        if (top) {
            await page.goto("/commerce/orders");
            await rowOf(page, top.orderId)
                .getByRole("button", {
                    name: `More actions for order #${top.orderId}`,
                })
                .click();
            const menu = page.getByRole("menu");
            await expect(menu).toBeVisible();
            await expect(
                menu.getByRole("menuitem", { name: /Refund|pay link|Cancel/ }),
            ).toHaveCount(0);
            await page.keyboard.press("Escape");

            await openerOf(page, top.orderId).click();
            const panel = quickView(page);
            await expect(
                panel.getByRole("list", { name: "Steps" }),
            ).toBeVisible();
            // Whether it is paid, never a figure (UX-010, DEC-024): the
            // Payment line stays, with no amount and nothing to refund or pay.
            await expect(panel.getByText(/₹/)).toHaveCount(0);
            await expect(
                panel.getByRole("button", { name: /Refund|pay link/i }),
            ).toHaveCount(0);
            await expect(
                panel.getByRole("link", { name: /Refund|pay link/i }),
            ).toHaveCount(0);
        }
        await page.close();
    });

    test("New pay link shows a new address once, and the old one stops working", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        // An unpaid open order of its own: the newest, on the first page.
        const target = await makeOrder(page.request, { paid: false });

        // A link made first, through the API, as Order Detail would.
        const first = await page.request.post(
            `${urls.API_URL}/organizations/${NORTHWIND}/orders/${target.id}/pay-link`,
            {
                headers: {
                    "x-organization-id": NORTHWIND,
                    origin: urls.APP_URL,
                },
            },
        );
        test.skip(
            !first.ok(),
            "Northwind has no provider that can take a pay link.",
        );
        const old = ((await first.json()) as { url: string }).url;
        const oldToken = old.split("/").at(-1) ?? "";

        await page.goto("/commerce/orders?tab=open&payment=unpaid");
        await rowOf(page, target.orderId)
            .getByRole("button", {
                name: `More actions for order #${target.orderId}`,
            })
            .click();
        await page.getByRole("menuitem", { name: "New pay link" }).click();
        await expect(
            page.getByText(
                "The link you sent before stops working straight away.",
            ),
        ).toBeVisible();
        await page.getByRole("button", { name: "Make a new link" }).click();
        const shown = page.getByRole("dialog", {
            name: `Pay link for #${target.orderId}`,
        });
        await expect(shown).toBeVisible();
        const fresh = (await shown.locator("code").textContent()) ?? "";
        expect(fresh).not.toBe(old);
        await shown.getByRole("button", { name: "Done" }).click();
        await expect(shown).toHaveCount(0);

        const stale = await page.request.get(
            `${urls.API_URL}/public/order-pay/${oldToken}`,
        );
        expect(stale.status()).toBe(404);
    });
});

test.describe("orders bulk kitchen moves (B6)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.skip(
            testInfo.project.name.startsWith("phone"),
            "Drawn at the desk here; the phone's cards carry the same box.",
        );
        await page.setViewportSize({ width: 1440, height: 900 });
    });

    const rowOf = (page: Page, orderId: string) =>
        page
            .getByRole("list", { name: "Orders" })
            .first()
            .getByRole("listitem")
            .filter({ hasText: `#${orderId}` });
    const bar = (page: Page) =>
        page.getByRole("region", { name: "Selected orders" });

    test("select Preparing rows, Mark ready, and Undo all during the hold moves nothing", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        // Two Pick-up orders of its own at Preparing, newest on the list.
        const picked = [
            await makeOrder(page.request, { stage: "PREPARING" }),
            await makeOrder(page.request, { stage: "PREPARING" }),
        ];

        await page.goto("/commerce/orders?tab=open&step=preparing");
        for (const r of picked) {
            await rowOf(page, r.orderId)
                .getByRole("checkbox", {
                    name: `Select order number ${r.orderId}`,
                })
                .click();
        }
        await expect(bar(page)).toContainText("2 orders selected");
        await bar(page).getByRole("button", { name: "Mark ready (2)" }).click();

        const held = page.getByRole("status").filter({
            hasText: /Marking 2 ready in \d+s/,
        });
        await expect(held).toBeVisible();
        await expect(held).toContainText(
            "It still goes ahead if you leave this page.",
        );
        await held.getByRole("button", { name: "Undo all" }).click();
        await expect(
            page.getByText("Back to Preparing. Nothing was sent."),
        ).toBeVisible();

        // Nothing moved on the server.
        const after = await list(page, NORTHWIND, "&tab=open&step=preparing");
        for (const r of picked) {
            expect(after.rows.some((x) => x.id === r.id)).toBe(true);
        }
    });

    test("Print tickets (N) opens the selected orders' tickets, oldest first, one to a page", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const { rows } = await list(page, LISTS);
        const picked = rows
            .filter(
                (r) => (r as Row & { ticketName?: string | null }).ticketName,
            )
            .slice(0, 2);
        test.skip(picked.length < 2, "Needs two orders with a ticket.");

        await page.goto("/commerce/orders");
        for (const r of picked) {
            await rowOf(page, r.orderId)
                .getByRole("checkbox", {
                    name: `Select order number ${r.orderId}`,
                })
                .click();
        }
        const print = bar(page).getByRole("link", {
            name: "Print tickets (2)",
        });
        await expect(print).toBeVisible();
        await expect(print).toHaveAttribute("target", "_blank");
        await expect(print).toHaveCSS("cursor", "pointer");
        const href = await print.getAttribute("href");
        expect(href).toContain("/commerce/orders/tickets?ids=");

        // The print dialog is the browser's: count the call, don't open it.
        await page.addInitScript(() => {
            (window as unknown as { printed: number }).printed = 0;
            window.print = () => {
                (window as unknown as { printed: number }).printed += 1;
            };
        });
        await page.goto(href ?? "/");
        await expect(
            page.getByRole("heading", { name: "2 tickets" }),
        ).toBeVisible();
        const tickets = page
            .getByRole("list", { name: "Tickets" })
            .getByRole("article");
        await expect(tickets).toHaveCount(2);
        // Oldest first: the list is newest first, so the order flips.
        const oldest = [...picked].reverse();
        await expect(tickets.first()).toContainText(`#${oldest[0]?.orderId}`);
        await expect
            .poll(() =>
                page.evaluate(
                    () => (window as unknown as { printed: number }).printed,
                ),
            )
            .toBe(1);
    });

    test("select every row by keyboard, and Clear empties the selection", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${LISTS}`);
        const { rows } = await list(page, LISTS);
        test.skip(rows.length === 0, "No orders here.");

        await page.goto("/commerce/orders");
        const all = page.getByRole("checkbox", {
            name: "Select every order in this view",
        });
        await all.focus();
        await page.keyboard.press("Space");
        await expect(bar(page)).toContainText(
            rows.length === 1
                ? "1 order selected"
                : `${rows.length} orders selected`,
        );
        await bar(page).getByRole("button", { name: "Clear" }).click();
        await expect(bar(page)).toHaveCount(0);
    });
});
