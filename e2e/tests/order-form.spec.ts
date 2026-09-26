import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * New order, by hand, at a GST-registered business (#508 U8, ADR-008): its
 * prices include GST, so the form offers no add-on tax and its total is
 * subtotal + shipping − discount — the sum `orders.service.ts` saves (pinned
 * there by `orders.service.discount.spec.ts`).
 *
 * Rye & Co. is the only registered seed business and is the film set, so
 * this reads the form and never places the order.
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

test.describe("new order at a GST-registered business", () => {
    test("adds no tax: prices include GST and the total is what is saved", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${RYE}`);
        await page.goto(`/commerce/orders/new?storefront=${RYE_STORE}`);
        await expect(
            page.getByRole("heading", { name: "New order" }),
        ).toBeVisible();

        await page.getByRole("combobox", { name: "Product" }).click();
        await page.getByRole("option", { name: /^Sourdough loaf —/ }).click();
        await page.getByLabel("Quantity").fill("2");

        await expect(page.getByLabel(/^Tax/)).toHaveCount(0);
        await expect(page.getByText("prices include GST")).toBeVisible();
        await expect(page.getByText("Includes GST")).toBeVisible();
        // 2 × ₹480, GST inside; nothing added on top. Exact: the summary's
        // "Subtotal ₹960 · …" line also contains "total ₹960".
        await expect(
            page.getByText("Total ₹960", { exact: true }),
        ).toBeVisible();

        await page.getByLabel("Discount", { exact: true }).fill("60");
        await expect(
            page.getByText("Total ₹900", { exact: true }),
        ).toBeVisible();
    });
});

/**
 * The API's refusal of a line ("… — Only 1 left at …") is about the lines as
 * they were sent (e80f2211): changing a quantity, adding a line, removing
 * one or picking another product clears it until the next save. Each of the
 * four is wired by hand, so each is checked.
 *
 * Runs on Northwind Supply (writes and error paths go there, never on the
 * film sets). It makes a product of its own counted at 1, never places an
 * order, and takes the product away afterwards: deleted if it can be, else
 * — it has a stock history (DEC-032) — set to Not sold under a name and an
 * address of its own.
 */
const NW_ORG = "seed_org";
const NW_STORE = "seed_store";
const nwApi = (path: string) =>
    `${urls.API_URL}/stores/${NW_STORE}/products${path}`;
const nwHeader = { "x-organization-id": NW_ORG };

async function retireProducts(request: APIRequestContext, name: string) {
    const res = await request.get(nwApi(""), { headers: nwHeader });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as
        | { id: string; name: string }[]
        | { items: { id: string; name: string }[] };
    const list = Array.isArray(body) ? body : body.items;
    for (const p of list.filter((x) => x.name === name)) {
        const del = await request.delete(nwApi(`/${p.id}`), {
            headers: nwHeader,
        });
        if (del.ok()) continue;
        expect(del.status()).toBe(409);
        const stamp = Date.now().toString(36);
        const retired = await request.patch(nwApi(`/${p.id}`), {
            headers: nwHeader,
            data: {
                name: `${name} (retired ${stamp})`,
                slug: `e2e-retired-${stamp}-${p.id.slice(-6)}`,
                status: "ARCHIVED",
            },
        });
        expect(retired.ok()).toBe(true);
    }
}

test.describe("a line the API refused", () => {
    test("its error clears when the lines change: quantity, add, remove, product", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Last Jar ${testInfo.project.name}`;
        await signIn(page);
        await page.goto(`/open/${NW_ORG}`);
        await retireProducts(page.request, name);

        const made = await page.request.post(nwApi(""), {
            headers: nwHeader,
            data: { name, price: "100.00", status: "PUBLISHED" },
        });
        expect(made.ok()).toBe(true);
        const { id } = (await made.json()) as { id: string };
        const counted = await page.request.put(nwApi(`/${id}/inventory`), {
            headers: nwHeader,
            data: { quantity: 1 },
        });
        expect(counted.ok()).toBe(true);

        try {
            await page.goto(`/commerce/orders/new?storefront=${NW_STORE}`);
            await page.getByLabel("Customer").click();
            await page.getByRole("option").first().click();

            const product = page.getByRole("combobox", { name: "Product" });
            const quantity = page.getByLabel("Quantity");
            const refused = page.getByRole("alert").filter({
                hasText: `${name} — Only 1 left at`,
            });
            const create = page.getByRole("button", { name: "Create order" });

            await product.first().click();
            await page
                .getByRole("option", { name: new RegExp(`^${name} —`) })
                .click();
            const refuse = async () => {
                await quantity.first().fill("2");
                await create.click();
                await expect(refused).toBeVisible();
            };

            // 1. The quantity changes.
            await refuse();
            await quantity.first().fill("1");
            await expect(refused).toHaveCount(0);

            // 2. A line is added.
            await refuse();
            await page.getByRole("button", { name: "Add item" }).click();
            await expect(refused).toHaveCount(0);

            // 3. A line is removed (the one just added).
            await refuse();
            await page.getByRole("button", { name: "✕" }).nth(1).click();
            await expect(refused).toHaveCount(0);

            // 4. Another product is picked.
            await refuse();
            await product.first().click();
            await page
                .getByRole("option", { name: new RegExp(`^(?!${name}).+ — `) })
                .first()
                .click();
            await expect(refused).toHaveCount(0);
        } finally {
            await retireProducts(page.request, name);
        }
    });
});
