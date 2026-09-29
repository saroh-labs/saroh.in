// @covers accounts:/login app:/open app:/commerce/orders app:/commerce/orders/new api:orders api:products api:customers api:contacts api:stores
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoUser, urls } from "../playwright.config";

/**
 * New order v2 (plan B, B13): the sheet on the Orders list, at the counter
 * or on the phone. The old New order page's address opens it.
 */

const RYE = "seed_sc_rc_org";
const RYE_STORE = "seed_sc_rc_store";

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

/**
 * At a GST-registered business (#508 U8, ADR-008) prices include GST, so
 * the sheet adds no tax: the total is what `orders.service.ts` saves.
 * Rye & Co. is the film set: this reads the sheet and never places the
 * order.
 */
test.describe("new order at a GST-registered business", () => {
    test("adds no tax: prices include GST and the total is what is saved", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${RYE}`);
        // The old page's address opens the sheet on the Orders list.
        await page.goto(`/commerce/orders/new?storefront=${RYE_STORE}`);
        const sheet = page.getByRole("dialog", { name: "New order" });
        await expect(sheet).toBeVisible();
        await expect(page).toHaveURL(/\/commerce\/orders\?/);

        await sheet.getByLabel("Add a product").fill("Sourdough");
        // Sourdough has sizes since the showcase grew (#526); 800g is ₹480.
        const eight = sheet
            .getByRole("group", { name: /^Add Sourdough/ })
            .getByRole("button", { name: /^800g · ₹480/ });
        await eight.click();
        await eight.click();

        // 2 × ₹480, GST inside; nothing added on top. The footer's total,
        // not the line's (which reads the same).
        const footer = sheet.getByRole("button", { name: /· create$|^Create/ });
        const total = sheet.getByRole("group", { name: "Order total" });
        await expect(total.getByText("₹960", { exact: true })).toBeVisible();
        await expect(sheet.getByText(/ tax( ·|$)/)).toHaveCount(0);
        await expect(footer).toBeVisible();

        await sheet.getByRole("button", { name: "+ Add a discount" }).click();
        await sheet.getByLabel("Discount").fill("60");
        await expect(total.getByText("₹900", { exact: true })).toBeVisible();
    });
});

/**
 * Northwind Supply takes the writes (never the film sets). Its store offers
 * Local delivery and Shipping, not Pick-up, so the flows below fill the
 * address when there is no Pick-up to choose.
 */
const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };

/** Pick-up where the storefront offers it; else its first way, addressed. */
async function leaves(sheet: Locator) {
    // The choices draw once the lines are priced: wait for them before
    // counting, or a slow quote reads as "no Pick-up" and takes the
    // delivery branch.
    const ways = sheet.getByRole("radiogroup", { name: "How it leaves" });
    await expect(ways.getByRole("radio").first()).toBeVisible();
    const pickUp = ways.getByRole("radio", { name: "Pick-up" });
    if (await pickUp.count()) {
        await pickUp.click();
        return;
    }
    await sheet.getByLabel("Delivery address").last().fill("12 Church St");
    await sheet.getByLabel("Town or city").fill("Bengaluru");
    await sheet.getByLabel("State").fill("Karnataka");
    await sheet.getByLabel("PIN code").fill("560001");
}

/** Adds one of each product by name. */
async function addLines(sheet: Locator, names: readonly string[]) {
    for (const name of names) {
        await sheet.getByLabel("Add a product").fill(name);
        await sheet
            .getByRole("group", { name: `Add ${name}` })
            .getByRole("button")
            .first()
            .click();
    }
}

/**
 * The happy path: a walk-in who gives a phone (so a customer, B13b), two
 * lines, cash ₹500 for ₹430 → ₹70 change where it is picked up; the order
 * is paid and on the list under their name, never as a walk-in. Two
 * products of its own, set aside afterwards (`fixtures/throwaway-products.ts`).
 * A phone per project, so a rerun finds the same customer by it.
 */
test.describe("a walk-in who gives a phone, paid in cash", () => {
    test("is kept as a customer, and ₹500 for ₹430 gives ₹70 change", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const bread = `E2E Counter Bread ${testInfo.project.name}`;
        const cake = `E2E Counter Cake ${testInfo.project.name}`;
        const name = `Asha ${testInfo.project.name}`;
        const phone =
            testInfo.project.name === "phone"
                ? "+91 90000 22202"
                : "+91 90000 22201";
        await signIn(page);
        await page.goto(`/open/${NW.organizationId}`);
        try {
            await takeProduct(page.request, NW, bread, {
                price: "180.00",
                status: "PUBLISHED",
            });
            await takeProduct(page.request, NW, cake, {
                price: "250.00",
                status: "PUBLISHED",
            });

            await page.goto(`/commerce/orders?storefront=${NW.storeId}`);
            await page.getByRole("button", { name: "New order" }).click();
            const sheet = page.getByRole("dialog", { name: "New order" });

            // Who: a walk-in's name and phone; the form says a phone keeps
            // them as a customer before it is used.
            await sheet.getByRole("radio", { name: "Walk-in" }).click();
            await sheet.getByLabel("Name").fill(name);
            await expect(
                sheet.getByText("Add a phone to keep them as a customer."),
            ).toBeVisible();
            await sheet.getByLabel("Phone (if they give one)").fill(phone);
            await expect(
                sheet.getByText(
                    "They'll be kept as a customer, by this phone.",
                ),
            ).toBeVisible();
            await sheet
                .getByRole("button", { name: "Keep as customer" })
                .click();
            await expect(
                sheet.getByText(`${phone} · kept as a customer`),
            ).toBeVisible();

            await addLines(sheet, [bread, cake]);
            await expect(sheet.getByText("2 items")).toBeVisible();
            await leaves(sheet);

            // Cash: what was handed over, and the change, at a pick-up.
            await sheet.getByRole("radio", { name: "Cash" }).click();
            const ways = await sheet
                .getByRole("radiogroup", { name: "How it leaves" })
                .getByRole("radio", { checked: true })
                .textContent();
            if (ways?.startsWith("Pick-up")) {
                await sheet.getByLabel("Cash given").fill("500");
                await expect(sheet.getByText("Change ₹70")).toBeVisible();
                await sheet
                    .getByRole("button", { name: "Take ₹430 cash · create" })
                    .click();
                await expect(
                    page.getByText("Order created — give ₹70 change."),
                ).toBeVisible();
            } else {
                await sheet
                    .getByRole("button", { name: /cash · create$/ })
                    .click();
                await expect(page.getByText(/^Order created/)).toBeVisible();
            }

            // On the list under their name, as a customer: not a walk-in.
            await page.getByLabel("Search orders").fill(name);
            await expect(
                page.getByText(name).filter({ visible: true }).first(),
            ).toBeVisible();
            await expect(page.getByText(`${name} (walk-in)`)).toHaveCount(0);
        } finally {
            await removeProducts(page.request, NW, bread);
            await removeProducts(page.request, NW, cake);
        }
    });
});

/**
 * A walk-in with only a name stays a walk-in, with no record (B13b), so
 * nothing can be sent to them: a delivery is refused before anything is
 * made. Reads the sheet and never places the order.
 */
test.describe("a walk-in with only a name", () => {
    test("reads Walk-in, and can't be sent a delivery", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const loaf = `E2E Plain Loaf ${testInfo.project.name}`;
        await signIn(page);
        await page.goto(`/open/${NW.organizationId}`);
        try {
            await takeProduct(page.request, NW, loaf, {
                price: "120.00",
                status: "PUBLISHED",
            });
            await page.goto(`/commerce/orders?storefront=${NW.storeId}`);
            await page.getByRole("button", { name: "New order" }).click();
            const sheet = page.getByRole("dialog", { name: "New order" });

            await sheet.getByRole("radio", { name: "Walk-in" }).click();
            await sheet.getByLabel("Name").fill("Ravi");
            await sheet.getByRole("button", { name: "Use walk-in" }).click();
            await expect(
                sheet.getByText("Walk-in", { exact: true }),
            ).toBeVisible();

            await addLines(sheet, [loaf]);
            await expect(sheet.getByText("1 item")).toBeVisible();
            await leaves(sheet);
            const ways = await sheet
                .getByRole("radiogroup", { name: "How it leaves" })
                .getByRole("radio", { checked: true })
                .textContent();
            const create = sheet
                .getByRole("group", { name: "Order total" })
                .getByRole("button");
            if (ways?.startsWith("Pick-up")) {
                await expect(create).toBeEnabled();
            } else {
                await expect(
                    sheet.getByText(
                        "Deliveries need a customer to send the tracking to.",
                    ),
                ).toBeVisible();
                await expect(create).toBeDisabled();
            }
        } finally {
            await removeProducts(page.request, NW, loaf);
        }
    });
});
