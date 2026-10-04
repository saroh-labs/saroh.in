// @covers accounts:/login app:/open app:/commerce/orders api:orders api:payments api:stock api:customer-workspace api:bookings
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Fulfilment } from "../fixtures/own-data";
import { ADDRESS, makeOrder } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import {
    demoUser,
    ignoreHTTPSErrors,
    ownSeededDatabase,
    refundOrder,
    urls,
} from "../playwright.config";

/**
 * Order Detail (U14, #499; ADR-008): the kitchen flow, the ten-second Ready
 * hold with its Undo, the Member's view without money, and the allergy
 * banner — against the seeded stack.
 *
 * The kitchen flow runs on an order it makes in Northwind Supply, the
 * generic dev business, paid by hand: Rye & Co. is the film set and is only
 * read here. A refund needs a payment taken through a provider, which a dev
 * stack has none of; that journey runs when `E2E_REFUND_ORDER_ID` names a
 * provider-paid order with three lines (in its organization,
 * `E2E_REFUND_ORG`), and is skipped otherwise.
 */

const RYE = "seed_sc_rc_org";
/** #1063: Priya Raman, whose note names sesame; the loaf may contain it. */
const PRIYA = "seed_sc_rc_customer_priya";
const NORTHWIND = "seed_org";

const member = {
    email: "nisha.kulkarni@saroh.dev",
    password: "demo-password-123",
};

async function signIn(page: Page, who = demoUser) {
    await useSession(page, who);
}

/**
 * Priya's order today — the loaf that may contain sesame.
 *
 * Looked up, not named: the showcase numbers Rye's orders in the order they
 * were placed over five weeks relative to NOW, so how many come before
 * today's changes with the day the seed runs and a fixed id pointed at
 * somebody else's order (seed_sc_rc_order_62 was Sana's on 25 Sep). Her
 * latest order is today's, which is the one the seed writes the case into.
 */
async function priyaOrderToday(page: Page): Promise<string> {
    // The list's v2 shape (plan B, B1): asked by customer, newest first.
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${RYE}/orders?v=2&customerId=${PRIYA}`,
        { headers: { "x-organization-id": RYE, origin: urls.APP_URL } },
    );
    expect(res.ok()).toBe(true);
    const { rows } = (await res.json()) as {
        rows: {
            id: string;
            placedAt: string;
            customer: { id: string } | null;
        }[];
    };
    const latest = rows
        .filter((o) => o.customer?.id === PRIYA)
        .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))[0];
    expect(latest, "Priya has an order in the Rye & Co. seed").toBeDefined();
    return latest.id;
}

/** Two Toasters are mounted (one per theme); only one is ever shown. */
const shown = (page: Page, text: string | RegExp) =>
    page.getByText(text).locator("visible=true").first();

/**
 * A paid order to walk through the kitchen, made for the test: collected at
 * the counter, or (B10) delivered by the business or shipped by a courier.
 * Its line is the untracked `ORDER_LINE`, so it never holds a unit of a
 * shelf another test counts (it used to take the seed's trolley, whose
 * stock ran out once specs ran side by side).
 */
async function freshOrder(
    page: Page,
    fulfilment: Fulfilment = "PICKUP",
    { paid = true }: { paid?: boolean } = {},
): Promise<string> {
    return (await makeOrder(page.request, { fulfilment, paid })).id;
}

/** Walk an order to Ready through the API, as the kitchen would have. */
async function readyOrder(
    page: Page,
    fulfilment: "LOCAL_DELIVERY" | "SHIPPING",
): Promise<string> {
    return (await makeOrder(page.request, { fulfilment, stage: "READY" })).id;
}

test.describe("order detail", () => {
    test("start, hold Ready and undo it, mark ready, collect", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const id = await freshOrder(page);
        await page.goto(`/commerce/orders/${id}`);

        await expect(
            page.getByRole("group", { name: "Progress: New, step 1 of 4" }),
        ).toBeVisible();

        // The stepper answers the keyboard, not only the header button.
        await page
            .getByRole("button", { name: "Start preparing — next step" })
            .focus();
        await page.keyboard.press("Enter");
        await expect(
            shown(page, "Preparing. Items are locked now."),
        ).toBeVisible();
        await expect(
            page.getByRole("group", { name: /Preparing, step 2 of 4/ }),
        ).toBeVisible();

        // Ready is held ten seconds; its Undo records nothing.
        await page
            .getByRole("button", { name: "Mark ready", exact: true })
            .click();
        await expect(page.getByText(/Marking ready in \d+s/)).toBeVisible();
        await expect(
            page.getByText(
                /Nothing is sent to Sneha — the step shows on the order/,
            ),
        ).toBeVisible();
        await page
            .getByRole("status")
            .filter({ hasText: "Marking ready" })
            .getByRole("button", { name: "Undo" })
            .click();
        await expect(
            shown(page, "Still preparing. Nothing was recorded."),
        ).toBeVisible();

        // Held again, then recorded now.
        await page
            .getByRole("button", { name: "Mark ready", exact: true })
            .click();
        await page.getByRole("button", { name: "Mark now" }).click();
        await expect(shown(page, "Marked ready.")).toBeVisible();
        await expect(
            page.getByRole("group", { name: /Ready, step 3 of 4/ }),
        ).toBeVisible();

        await page
            .getByRole("button", { name: "Mark collected", exact: true })
            .click();
        await expect(page.getByText("Nothing left to do")).toBeVisible();

        const timeline = page.getByRole("region", { name: "What happened" });
        for (const step of ["Preparing", "Ready", "Collected"]) {
            await expect(
                timeline.getByText(step, { exact: true }).first(),
            ).toBeVisible();
        }
        // Saroh sends no messages, and the page never says it did.
        await expect(page.getByText(/texted|emailed|sms sent/i)).toHaveCount(0);
    });

    test("names the allergy a line may contain", async ({ page }) => {
        await signIn(page);
        await page.goto(`/open/${RYE}`);
        await page.goto(`/commerce/orders/${await priyaOrderToday(page)}`);
        const banner = page.getByRole("alert").filter({
            hasText: "Priya is allergic to sesame",
        });
        await expect(banner).toContainText(
            "Sourdough loaf — may contain sesame",
        );
        await expect(
            page.getByText("May contain sesame").first(),
        ).toBeVisible();

        const doc = await page.evaluate(() => ({
            vw: window.innerWidth,
            sw: document.documentElement.scrollWidth,
        }));
        expect(doc.sw).toBeLessThanOrEqual(doc.vw);
    });

    test("the customer card says their Needs attention, for the counter too (B15)", async ({
        browser,
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${RYE}`);
        const orderId = await priyaOrderToday(page);
        await page.goto(`/commerce/orders/${orderId}`);
        const card = page.getByRole("region", { name: "Customer" });
        // "Needs attention: Sesame", as the design reads (DEC-073); a
        // screen reader hears the kind too.
        await expect(card.getByText("Needs attention:")).toBeVisible();
        await expect(
            card.getByRole("list", { name: "Needs attention" }),
        ).toContainText("Allergy: Sesame");

        // A Member at the counter (order:stage, contact:read) sees the same
        // allergy, and the banner still checks the lines by allergen.
        const counter = await memberPage(browser);
        await counter.goto(`/open/${RYE}`);
        await counter.goto(`/commerce/orders/${orderId}`);
        await expect(
            counter
                .getByRole("region", { name: "Customer" })
                .getByRole("list", { name: "Needs attention" }),
        ).toContainText("Allergy: Sesame");
        await expect(
            counter.getByRole("alert").filter({
                hasText: "Priya is allergic to sesame",
            }),
        ).toBeVisible();
        await counter.close();
    });

    test("a Member moves stages but sees no money, refund or edit", async ({
        browser,
    }) => {
        const page = await memberPage(browser);
        await page.goto(`/open/${RYE}`);
        await page.goto(`/commerce/orders/${await priyaOrderToday(page)}`);

        await expect(
            page.getByRole("button", { name: "Start preparing", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("region", { name: "Money" })).toHaveCount(
            0,
        );
        await expect(page.getByRole("button", { name: "Refund…" })).toHaveCount(
            0,
        );
        await expect(
            page.getByRole("button", { name: "Edit items or address" }),
        ).toHaveCount(0);
        await expect(page.getByText(/₹/)).toHaveCount(0);

        // And reaches the list through the kitchen, without totals.
        await page.goto("/commerce/orders");
        await expect(
            page.getByRole("heading", { name: "Orders" }),
        ).toBeVisible();
        await expect(page.getByText(/₹/)).toHaveCount(0);
        await page.close();
    });

    test("refund two of three lines leaves the order partly refunded", async ({
        page,
    }) => {
        const id = refundOrder.id;
        const org = refundOrder.org ?? NORTHWIND;
        test.skip(
            !id,
            "Needs a provider-paid order with three lines (E2E_REFUND_ORDER_ID); a dev stack takes no provider payments.",
        );
        await signIn(page);
        await page.goto(`/open/${org}`);
        await page.goto(`/commerce/orders/${id}`);

        await page.getByRole("button", { name: "Refund…" }).click();
        const panel = page.getByRole("region", { name: "Refund" });
        const lines = panel.getByRole("checkbox");
        await expect(lines).toHaveCount(3);
        await lines.nth(0).click();
        await lines.nth(1).click();
        await panel.getByRole("button", { name: /^Refund / }).click();

        await expect(page.getByText(/Refunding .* in \d+s/)).toBeVisible();
        await page.getByRole("button", { name: "Refund now" }).click();
        await expect(shown(page, /The rest of the order stands/)).toBeVisible();

        const money = page.getByRole("region", { name: "Money" });
        await expect(money.getByText(/^Refunded /).first()).toBeVisible();
        await expect(
            money.getByRole("link", { name: /Credit note/ }),
        ).toBeVisible();
    });

    test("another amount needs a reason, and refunds only that (B8)", async ({
        page,
    }) => {
        const id = refundOrder.id;
        const org = refundOrder.org ?? NORTHWIND;
        test.skip(
            !id,
            "Needs a provider-paid order (E2E_REFUND_ORDER_ID); a dev stack takes no provider payments.",
        );
        await signIn(page);
        await page.goto(`/open/${org}`);
        await page.goto(`/commerce/orders/${id}`);

        await page.getByRole("button", { name: "Refund…" }).click();
        const panel = page.getByRole("region", { name: "Refund" });
        await panel.getByLabel("Refund another amount, in rupees").fill("1");
        const go = panel.getByRole("button", { name: /^Refund / });
        await expect(go).toBeDisabled();
        await expect(
            panel.getByText("Say why you're refunding this amount."),
        ).toBeVisible();
        await panel.getByLabel("Why").selectOption({ label: "Late" });
        await expect(go).toHaveText("Refund ₹1");
        await go.click();
        await page.getByRole("button", { name: "Refund now" }).click();
        await expect(shown(page, /The rest of the order stands/)).toBeVisible();
        await expect(
            page
                .getByRole("region", { name: "What happened" })
                .getByText("Refunded ₹1 · late"),
        ).toBeVisible();
    });

    test("Add an item before preparing puts it on the order (B8)", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        // Unpaid: the edit changes what is due, and no money moves.
        const id = await freshOrder(page, "PICKUP", { paid: false });
        await page.goto(`/commerce/orders/${id}`);

        await page
            .getByRole("button", { name: "Edit items or address" })
            .click();
        const panel = page.getByRole("region", { name: "Edit order" });
        const add = panel.getByLabel("Add an item");
        await expect(add).toBeVisible();
        // The first of the seed's own products on offer that isn't sold out:
        // never another test's "E2E …" product, which it may be taking away
        // at this moment, nor the line the order already has.
        const choice = await add
            .locator("option:not([disabled]):not([value=''])")
            .filter({ hasNotText: /^E2E / })
            .first()
            .getAttribute("value");
        expect(choice).toBeTruthy();
        await add.selectOption(choice ?? "");
        await expect(panel.getByText("· added")).toBeVisible();
        await panel.getByRole("button", { name: /^Save/ }).click();
        await expect(shown(page, /^Saved\./)).toBeVisible();
        await expect(
            page
                .getByRole("region", { name: "What happened" })
                .getByText(/added 1 line/),
        ).toBeVisible();
    });
});

async function memberPage(browser: Browser): Promise<Page> {
    const context = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const page = await context.newPage();
    await signIn(page, member);
    return page;
}

/**
 * The shipping panel (B10, DEC-045): handing a Shipping order to a courier
 * records who took it and their number, both optional, and the number can
 * be added later. A local delivery goes out with the business's own people
 * and is never asked for a courier. Saroh books no pickup and sends nothing.
 */
test.describe("shipping on order detail", () => {
    test("hand over with a courier and number: on the card and in the timeline", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const id = await readyOrder(page, "SHIPPING");
        await page.goto(`/commerce/orders/${id}`);

        await expect(
            page.getByRole("button", { name: "Print packing slip" }),
        ).toBeVisible();
        await page
            .getByRole("button", { name: "Hand to courier", exact: true })
            .click();
        const panel = page.getByRole("region", { name: "Hand to courier" });
        await expect(panel.getByText(/^To 14 Lake View Road/)).toBeVisible();
        await panel.getByRole("radio", { name: "Blue Dart" }).click();
        await panel.getByLabel("Tracking number").fill("BD 9920 1140");
        await panel.getByRole("button", { name: "Handed over" }).click();

        await expect(
            shown(page, "Handed to Blue Dart · BD 9920 1140."),
        ).toBeVisible();
        const card = page.getByRole("region", { name: "Customer" });
        await expect(card.getByText("Blue Dart ·")).toBeVisible();
        await expect(card.getByText("BD 9920 1140")).toBeVisible();
        await expect(card.getByText("No tracking number yet")).toHaveCount(0);
        const timeline = page.getByRole("region", { name: "What happened" });
        await expect(
            timeline.getByText("Handed to Blue Dart · BD 9920 1140"),
        ).toBeVisible();
        await expect(page.getByText(/texted|emailed|sms sent/i)).toHaveCount(0);
    });

    test("hand over without a number, then add it", async ({ page }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const id = await readyOrder(page, "SHIPPING");
        await page.goto(`/commerce/orders/${id}`);

        await page
            .getByRole("button", { name: "Hand to courier", exact: true })
            .click();
        await page
            .getByRole("region", { name: "Hand to courier" })
            .getByRole("button", { name: "Handed over" })
            .click();
        await expect(shown(page, /^Handed to Delhivery\./)).toBeVisible();

        const card = page.getByRole("region", { name: "Customer" });
        await expect(card.getByText("No tracking number yet")).toBeVisible();
        await card
            .getByRole("button", { name: "Add the tracking number" })
            .click();
        const panel = page.getByRole("region", {
            name: "Tracking",
            exact: true,
        });
        await expect(panel.getByLabel("Tracking number")).toBeFocused();
        await panel.getByLabel("Tracking number").fill("1487 2290 3314");
        await panel.getByRole("button", { name: "Save" }).click();

        await expect(shown(page, "Tracking number saved.")).toBeVisible();
        await expect(card.getByText("1487 2290 3314")).toBeVisible();
        await expect(card.getByText("No tracking number yet")).toHaveCount(0);
        await expect(
            page
                .getByRole("region", { name: "What happened" })
                .getByText("Edited · tracking number 1487 2290 3314"),
        ).toBeVisible();
    });

    test("Other asks for the courier's name, and the order keeps it (B8)", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const id = await readyOrder(page, "SHIPPING");
        await page.goto(`/commerce/orders/${id}`);

        await page
            .getByRole("button", { name: "Hand to courier", exact: true })
            .click();
        const panel = page.getByRole("region", { name: "Hand to courier" });
        await panel.getByRole("radio", { name: "Other" }).click();
        const name = panel.getByLabel("Courier's name");
        await expect(name).toBeFocused();
        // No name yet: nothing to hand over to.
        await expect(
            panel.getByRole("button", { name: "Handed over" }),
        ).toBeDisabled();
        await name.fill("DTDC");
        await panel.getByLabel("Tracking number").fill("D 4410 2291");
        await panel.getByRole("button", { name: "Handed over" }).click();

        await expect(
            shown(page, "Handed to DTDC · D 4410 2291."),
        ).toBeVisible();
        await expect(
            page
                .getByRole("region", { name: "What happened" })
                .getByText("Handed to DTDC · D 4410 2291"),
        ).toBeVisible();
    });

    test("a pay link: shown once, then replaced (B11)", async ({ page }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        // An unpaid order: made, never marked paid. Northwind's Cashfree
        // connection can open a checkout, so a link can be made.
        const id = await freshOrder(page, "PICKUP", { paid: false });
        await page.goto(`/commerce/orders/${id}`);

        const money = page.getByRole("region", { name: "Money" });
        await money.getByRole("button", { name: "Make a pay link" }).click();
        const address = money.locator("code");
        await expect(address).toContainText("/pay/o/");
        const first = (await address.textContent()) ?? "";
        await expect(
            money.getByText("Shown this once — copy it now."),
        ).toBeVisible();

        // The customer's page reads the order, by the token alone.
        const token = first.split("/pay/o/")[1];
        const read = await page.request.get(
            `${urls.API_URL}/public/order-pay/${token}`,
        );
        expect(read.ok()).toBe(true);
        expect(await read.json()).toMatchObject({ status: "DUE" });

        // After a reload the address is gone: only when it was made shows.
        await page.reload();
        await expect(money.getByText(/^Pay link made/)).toBeVisible();
        await expect(money.locator("code")).toHaveCount(0);

        // A new link says the old one stops working, and it does.
        await money.getByRole("button", { name: "New pay link" }).click();
        await page.getByRole("button", { name: "Make a new link" }).click();
        await expect(money.locator("code")).toContainText("/pay/o/");
        await expect(money.locator("code")).not.toHaveText(first);
        const old = await page.request.get(
            `${urls.API_URL}/public/order-pay/${token}`,
        );
        expect(old.status()).toBe(404);
    });

    test("a local delivery never asks for a courier", async ({ page }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const id = await readyOrder(page, "LOCAL_DELIVERY");
        await page.goto(`/commerce/orders/${id}`);

        // The order's next step is drawn: before it is, no courier button
        // says nothing.
        await expect(
            page.getByRole("button", {
                name: "Send out for delivery",
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Hand to courier" }),
        ).toHaveCount(0);
        await page
            .getByRole("button", { name: "Send out for delivery", exact: true })
            .click();
        await expect(
            page.getByRole("group", { name: /Out for delivery, step 4 of 5/ }),
        ).toBeVisible();
        await expect(
            page.getByRole("region", { name: "Hand to courier" }),
        ).toHaveCount(0);
        await expect(
            page
                .getByRole("region", { name: "Customer" })
                .getByText("Tracking"),
        ).toHaveCount(0);
    });
});

/**
 * Change how it's fulfilled, and cancel as a full refund (round-2 B9): both
 * until handover. Written on Northwind, on unpaid orders it makes, so no
 * money moves and no provider is needed.
 */
test.describe("change and cancel on order detail (B9)", () => {
    test("change how it's fulfilled: the step says what it was and what it is", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const id = await freshOrder(page, "PICKUP", { paid: false });
        await page.goto(`/commerce/orders/${id}`);

        const open = page.getByRole("button", {
            name: "Change how it's fulfilled…",
        });
        test.skip(
            await open.isDisabled(),
            "Northwind's storefront offers one way only for this product.",
        );
        await open.click();
        const sheet = page.getByRole("dialog", {
            name: "Change how it's fulfilled",
        });
        const other = sheet.locator('[role="radio"][aria-checked="false"]');
        const label = (await other.first().textContent()) ?? "";
        await other.first().click();
        if (/delivery|shipping/i.test(label)) {
            await sheet.getByLabel("Street and number").fill(ADDRESS.line1);
            await sheet.getByLabel("Town or city").fill(ADDRESS.city);
            await sheet.getByLabel("State").fill(ADDRESS.state);
            await sheet.getByLabel("PIN code").fill(ADDRESS.postalCode);
        }
        await sheet.getByLabel("Delivery charge").fill("0");
        await sheet.getByRole("button", { name: /^Save/ }).click();
        await expect(shown(page, /^Now /)).toBeVisible();
        await expect(
            page
                .getByRole("region", { name: "What happened" })
                .getByText(`Changed from Pick-up to ${label}`),
        ).toBeVisible();
    });

    test("cancel an unpaid order: held, then kept as cancelled with its reason", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const id = await freshOrder(page, "PICKUP", { paid: false });
        await page.goto(`/commerce/orders/${id}`);

        await page.getByRole("button", { name: "Cancel order…" }).click();
        const sheet = page.getByRole("region", { name: /^Cancel #/ });
        await expect(
            sheet.getByText(/It stays on record as cancelled, never deleted/),
        ).toBeVisible();
        await sheet.getByLabel("Why").selectOption({ label: "Late" });
        await sheet.getByRole("button", { name: "Cancel order" }).click();
        await expect(page.getByText(/Cancelling in \d+s/)).toBeVisible();
        await page.getByRole("button", { name: "Cancel now" }).click();
        await expect(
            shown(page, "Order cancelled. It stays in Orders as cancelled."),
        ).toBeVisible();
        await expect(
            page
                .getByRole("region", { name: "What happened" })
                .getByText("Cancelled · late"),
        ).toBeVisible();
    });

    test("from the handover on, change and cancel say why not", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const id = await readyOrder(page, "LOCAL_DELIVERY");
        const headers = {
            "x-organization-id": NORTHWIND,
            origin: urls.APP_URL,
        };
        const moved = await page.request.post(
            `${urls.API_URL}/organizations/${NORTHWIND}/orders/${id}/stage`,
            { headers, data: { to: "OUT_FOR_DELIVERY" } },
        );
        expect(moved.ok()).toBe(true);
        await page.goto(`/commerce/orders/${id}`);

        const cancel = page.getByRole("button", { name: "Cancel order…" });
        await expect(cancel).toBeDisabled();
        await expect(cancel).toHaveAttribute(
            "title",
            "It has been handed over, so it can't be cancelled. Refund it instead.",
        );
        await expect(
            page.getByRole("button", { name: "Change how it's fulfilled…" }),
        ).toBeDisabled();
    });
});

/**
 * A treatment's order is fulfilled by its visits (B14, R16), on Kavi Dental
 * (E29), whose treatments' orders E9 seeds. Kavi is a film set: the Visits
 * card is only read here, and "Mark visit N attended" — a write — runs only
 * in CI, on the test run's own seeded database.
 */
const KAVI = "seed_sc_kavi_org";

interface TreatmentRead {
    id: string;
    orderId: string;
    attention?: { entries: { label: string }[] } | null;
    visits?: {
        total: number;
        attended: number;
        next: { attend: number | null; book: number | null };
    } | null;
}

/** Kavi's treatments' orders, read as Order Detail reads them. */
async function kaviTreatments(page: Page): Promise<TreatmentRead[]> {
    const headers = { "x-organization-id": KAVI, origin: urls.APP_URL };
    const base = `${urls.API_URL}/organizations/${KAVI}/orders`;
    const list = await page.request.get(`${base}?v=2`, { headers });
    expect(list.ok()).toBe(true);
    const { rows } = (await list.json()) as {
        rows: { id: string; fulfilmentType: string }[];
    };
    const reads: TreatmentRead[] = [];
    for (const row of rows) {
        if (!row.fulfilmentType.startsWith("APPOINTMENT_")) continue;
        const res = await page.request.get(`${base}/${row.id}`, { headers });
        expect(res.ok()).toBe(true);
        reads.push((await res.json()) as TreatmentRead);
    }
    return reads;
}

test.describe("visits on a treatment's order (B14)", () => {
    test("the Visits card in place of the kitchen, read only", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${KAVI}`);
        const treatments = await kaviTreatments(page);
        const multi = treatments.find((t) => (t.visits?.total ?? 0) > 1);
        expect(multi, "Kavi Dental seeds a treatment of visits").toBeDefined();
        if (!multi?.visits) return;
        await page.goto(`/commerce/orders/${multi.id}`);

        const card = page.getByRole("region", { name: "Visits" });
        await expect(card).toContainText(
            `${multi.visits.attended} of ${multi.visits.total} attended`,
        );
        await expect(card.getByRole("list", { name: "Visits" })).toBeVisible();
        // No kitchen: no stages, no ticket, no wait clock.
        await expect(
            page.getByRole("button", { name: "Start preparing" }),
        ).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^Print/ })).toHaveCount(
            0,
        );
        await expect(
            page.getByRole("group", { name: /^Visits: / }),
        ).toBeVisible();

        const doc = await page.evaluate(() => ({
            vw: window.innerWidth,
            sw: document.documentElement.scrollWidth,
        }));
        expect(doc.sw).toBeLessThanOrEqual(doc.vw);
    });

    test("a treatment's customer card says their Needs attention too (DEC-073)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${KAVI}`);
        const noted = (await kaviTreatments(page)).find(
            (t) => (t.attention?.entries.length ?? 0) > 0,
        );
        expect(
            noted,
            "Kavi Dental seeds a patient with Needs attention",
        ).toBeDefined();
        const label = noted?.attention?.entries[0]?.label;
        if (!noted || !label) return;
        await page.goto(`/commerce/orders/${noted.id}`);
        const card = page.getByRole("region", { name: "Customer" });
        await expect(card.getByText("Needs attention:")).toBeVisible();
        await expect(
            card.getByRole("list", { name: "Needs attention" }),
        ).toContainText(label);
        await expect(
            page.getByRole("region", { name: "Visits" }),
        ).toContainText(label);
    });

    test("Book visit N opens New booking for the treatment (nothing is saved)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${KAVI}`);
        const toBook = (await kaviTreatments(page)).find(
            (t) => t.visits?.next.book != null,
        );
        test.skip(!toBook, "No Kavi treatment has a visit to book today");
        if (!toBook?.visits) return;
        const n = toBook.visits.next.book;
        await page.goto(`/commerce/orders/${toBook.id}`);
        await page.getByRole("button", { name: `Book visit ${n}` }).click();
        await expect(
            page.getByRole("dialog", {
                name: `Book visit ${n} of ${toBook.visits.total}`,
            }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
    });

    // @serial: it takes the first visit waiting on Kavi's seeded treatments,
    // which the other project's copy of this test would take too.
    test(
        "Mark visit N attended, in the test run's own database",
        {
            tag: "@serial",
        },
        async ({ page }) => {
            test.skip(
                !ownSeededDatabase,
                "Kavi is a film set: writes run in CI only",
            );
            await signIn(page);
            await page.goto(`/open/${KAVI}`);
            const due = (await kaviTreatments(page)).find(
                (t) => t.visits?.next.attend != null,
            );
            test.skip(!due, "No Kavi visit has started and waits to be marked");
            if (!due?.visits) return;
            const n = due.visits.next.attend;
            await page.goto(`/commerce/orders/${due.id}`);
            await page
                .getByRole("button", { name: `Mark visit ${n} attended` })
                .click();
            await expect(
                shown(page, `Visit ${n} marked attended.`),
            ).toBeVisible();
            await expect(
                page.getByRole("region", { name: "What happened" }),
            ).toContainText(`Visit ${n} attended`);
        },
    );
});

/**
 * A cancel's refund the provider has accepted reads "Refund on its way"
 * until its webhook confirms it, never "Refunded" (B9, DEC-067). Read-only,
 * on Northwind: it looks for such an order and skips when there is none
 * (in test mode the provider confirms within seconds).
 */
test.describe("a refund on its way (B9)", () => {
    test("Order Detail says Refund on its way, not Refunded, until the provider confirms", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const headers = {
            "x-organization-id": NORTHWIND,
            origin: urls.APP_URL,
        };
        const base = `${urls.API_URL}/organizations/${NORTHWIND}/orders`;
        const list = await page.request.get(`${base}?v=2&tab=refunded`, {
            headers,
        });
        expect(list.ok()).toBe(true);
        const { rows } = (await list.json()) as { rows: { id: string }[] };
        let found: string | null = null;
        for (const row of rows.slice(0, 20)) {
            const res = await page.request.get(`${base}/${row.id}`, {
                headers,
            });
            const read = (await res.json()) as {
                money: { refundsOnTheWay?: unknown[] } | null;
            };
            if ((read.money?.refundsOnTheWay ?? []).length > 0) {
                found = row.id;
                break;
            }
        }
        test.skip(!found, "No refund waiting on its provider on Northwind.");

        await page.goto(`/commerce/orders/${found}`);
        const money = page.getByRole("region", { name: "Money" });
        await expect(money.getByText(/^Refund on its way · /)).toBeVisible();
        await expect(money.getByText("Refunded in full")).toHaveCount(0);
    });
});
