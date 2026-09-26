import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoUser, urls } from "../playwright.config";

/**
 * Collections on the screens (#524): New collection on the Products list's
 * Collections chip picks two products by hand, and both product pages then
 * show it; an automatic collection is locked on the product page's Edit
 * collections, and its sheet says it keeps the way it fills.
 *
 * It runs on Northwind Supply, the base seed — Rye & Co., Pulse Fitness and
 * Leela & Loom stay camera-ready. It makes its own two products, category
 * and collections, and takes every one of them away afterwards, whatever
 * happened.
 */

const ORG = "seed_org";
const STORE = "seed_store";
const NW: Storefront = { organizationId: ORG, storeId: STORE };
const headers = { "x-organization-id": ORG };
const orgApi = (path: string) => `${urls.API_URL}/organizations/${ORG}${path}`;

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

/** Delete every collection called one of `names` (a failed run's too). */
async function removeCollections(
    request: APIRequestContext,
    names: string[],
): Promise<void> {
    const res = await request.get(orgApi("/collections"), { headers });
    expect(res.ok()).toBe(true);
    const rows = (await res.json()) as { id: string; name: string }[];
    for (const c of rows.filter((r) => names.includes(r.name))) {
        const del = await request.delete(orgApi(`/collections/${c.id}`), {
            headers,
        });
        expect(del.ok()).toBe(true);
    }
}

/** Delete the category called `name`, once no collection uses it. */
async function removeCategory(
    request: APIRequestContext,
    name: string,
): Promise<void> {
    const res = await request.get(orgApi("/catalogue/categories"), {
        headers,
    });
    expect(res.ok()).toBe(true);
    const rows = (await res.json()) as { id: string; name: string }[];
    for (const c of rows.filter((r) => r.name === name)) {
        await request.delete(orgApi(`/catalogue/categories/${c.id}`), {
            headers,
        });
    }
}

test.describe("Collections", () => {
    test("a hand-picked collection shows on both product pages; an automatic one is locked", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const tag = testInfo.project.name;
        const first = `E2E Coll Jam ${tag}`;
        const second = `E2E Coll Honey ${tag}`;
        const picked = `E2E Pantry picks ${tag}`;
        const automatic = `E2E Pantry shelf ${tag}`;
        const category = `E2E Pantry ${tag}`;

        await signIn(page);
        await page.goto(`/open/${ORG}`);
        const request = page.request;
        await removeCollections(request, [picked, automatic]);
        await removeCategory(request, category);
        const firstId = await takeProduct(request, NW, first, {
            price: "180",
            status: "PUBLISHED",
        });
        const secondId = await takeProduct(request, NW, second, {
            price: "260",
            status: "PUBLISHED",
        });

        try {
            // New collection, picked by hand: two products, in order.
            await page.goto("/commerce/products?view=collections");
            await page
                .getByRole("button", { name: "New collection" })
                .or(page.getByRole("link", { name: "New collection" }))
                .first()
                .click();
            const sheet = page.getByRole("dialog", { name: "New collection" });
            await expect(sheet).toBeVisible();
            await sheet.getByLabel("Name").fill(picked);
            for (const name of [first, second]) {
                await sheet.getByLabel("Add products").fill(name);
                await sheet.getByRole("checkbox", { name }).click();
            }
            await expect(sheet.getByText("2 of 500")).toBeVisible();
            await sheet
                .getByRole("button", { name: "Create collection" })
                .click();
            await expect(page.getByText(`${picked} created.`)).toBeVisible();
            await expect(
                page
                    .getByRole("listitem")
                    .filter({ hasText: picked })
                    .getByText("2 products · picked by hand"),
            ).toBeVisible();

            // Both product pages say they are in it.
            for (const id of [firstId, secondId]) {
                await page.goto(`/commerce/products/${id}?tab=collections`);
                await expect(
                    page.getByRole("tabpanel").getByText(picked, {
                        exact: true,
                    }),
                ).toBeVisible();
                await expect(
                    page.getByText("2 products · picked by hand"),
                ).toBeVisible();
            }

            // An automatic one, by a category the first product is in.
            const made = await request.post(orgApi("/catalogue/categories"), {
                headers,
                data: { name: category },
            });
            expect(made.ok()).toBe(true);
            const categoryId = ((await made.json()) as { id: string }).id;
            const moved = await request.patch(
                `${urls.API_URL}/stores/${STORE}/products/${firstId}`,
                { headers, data: { categoryId } },
            );
            expect(moved.ok()).toBe(true);
            const auto = await request.post(orgApi("/collections"), {
                headers,
                data: { name: automatic, categoryId },
            });
            expect(auto.ok()).toBe(true);

            await page.goto(`/commerce/products/${firstId}?tab=collections`);
            await expect(page.getByText(`It's in ${category}.`)).toBeVisible();
            await page
                .getByRole("button", { name: "Edit collections" })
                .click();
            const edit = page.getByRole("dialog", { name: "Edit collections" });
            const locked = edit.getByRole("checkbox", { name: automatic });
            await expect(locked).toHaveAttribute("aria-checked", "true");
            await expect(locked).toHaveAttribute("aria-disabled", "true");
            await expect(
                edit.getByText(/change the product's category to change this/),
            ).toBeVisible();

            // Untick the hand-picked one here; the page follows.
            await edit.getByRole("checkbox", { name: picked }).click();
            await edit.getByRole("button", { name: "Save" }).click();
            await expect(
                page.getByText(`${first}'s collections saved.`),
            ).toBeVisible();
            await expect(
                page.getByRole("tabpanel").getByText(picked, { exact: true }),
            ).toHaveCount(0);

            // The automatic one's sheet keeps its kind.
            await page
                .getByRole("button", { name: `Open ${automatic}` })
                .click();
            const own = page.getByRole("dialog", {
                name: `Edit ${automatic}`,
            });
            await expect(own.getByText("Automatic, by category")).toBeVisible();
            await expect(own.getByText(/keeps the way it fills/)).toBeVisible();
        } finally {
            await removeCollections(request, [picked, automatic]);
            await removeCategory(request, category);
            await removeProducts(request, NW, first);
            await removeProducts(request, NW, second);
        }
    });
});
