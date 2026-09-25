import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    demoUser,
    ignoreHTTPSErrors,
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
const NW_STORE = "seed_store";

const member = {
    email: "nisha.kulkarni@saroh.dev",
    password: "demo-password-123",
};

async function signIn(page: Page, who = demoUser) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
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
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${RYE}/orders`,
        { headers: { "x-organization-id": RYE } },
    );
    expect(res.ok()).toBe(true);
    const orders = (await res.json()) as {
        id: string;
        placedAt: string;
        customer: { id: string } | null;
    }[];
    const latest = orders
        .filter((o) => o.customer?.id === PRIYA)
        .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))[0];
    expect(latest, "Priya has an order in the Rye & Co. seed").toBeDefined();
    return latest.id;
}

/** Two Toasters are mounted (one per theme); only one is ever shown. */
const shown = (page: Page, text: string | RegExp) =>
    page.getByText(text).locator("visible=true").first();

/** A paid, collected-at-the-counter order to walk through the kitchen. */
async function freshOrder(page: Page): Promise<string> {
    const headers = { "x-organization-id": NORTHWIND };
    const made = await page.request.post(
        `${urls.API_URL}/stores/${NW_STORE}/orders`,
        {
            headers,
            data: {
                customerId: "seed_customer_6",
                items: [
                    {
                        productId: "seed_product_11",
                        variantId: "seed_variant_11_0",
                        quantity: 1,
                    },
                ],
            },
        },
    );
    expect(made.ok()).toBe(true);
    const { id } = (await made.json()) as { id: string };
    const paid = await page.request.patch(
        `${urls.API_URL}/stores/${NW_STORE}/orders/${id}`,
        { headers, data: { paymentStatus: "PAID" } },
    );
    expect(paid.ok()).toBe(true);
    return id;
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
