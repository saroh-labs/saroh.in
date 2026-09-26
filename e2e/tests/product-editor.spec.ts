import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoUser, urls } from "../playwright.config";

/**
 * The product editor film (#472), as a test: make a product on one page,
 * part by part — basics, then variants and photos once it exists — publish
 * it, and read it back on the product page.
 *
 * It runs on Leela & Loom, the showcase boutique, and leaves it as it found
 * it: the product it makes is deleted afterwards, and one left by a failed
 * run goes the same way before it starts. It never counts stock there — a
 * count is history that is never deleted (DEC-032), so the product could
 * only be archived and would stay on the showcase. The Stock section's save
 * is checked on Northwind Supply instead, below. Photos go in by address,
 * since a test stack has no file storage.
 */

const ORG = "seed_sc_ll_org";
const STORE = "seed_sc_ll_store";
const LEELA: Storefront = { organizationId: ORG, storeId: STORE };
/** Writes that leave history go to the base seed, never a showcase. */
const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };
const PHOTOS = [
    "https://images.unsplash.com/photo-1671493235081-5842463637cd?w=1600&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1671493234884-b1611bcf3e69?w=1600&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1671493229048-4dddd00ca84a?w=1600&q=80&auto=format&fit=crop",
];

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

const api = (path: string) => `${urls.API_URL}/stores/${STORE}/products${path}`;
const orgHeader = { "x-organization-id": ORG };

test.describe("product editor", () => {
    test("create, add variants, stock and photos, publish, then read it back", async ({
        page,
    }, testInfo) => {
        test.setTimeout(180_000);
        // One name per project: desk and phone run one after the other on
        // the same store, and a SKU pattern numbers products by position.
        const name = `Rosehip Face Oil ${testInfo.project.name}`;

        await signIn(page);
        await page.goto(`/open/${ORG}`);
        await removeProducts(page.request, LEELA, name);

        try {
            // 1. A new product needs a name and a price.
            await page.goto(`/commerce/products/new?storefront=${STORE}`);
            await expect(page.getByText("Not created yet")).toBeVisible();
            await expect(
                page.getByText("Add a name and a price to create it."),
            ).toBeVisible();
            const create = page.getByRole("button", { name: "Create draft" });
            await expect(create).toBeDisabled();

            // 2. Name, price, category. No MRP: the larger sizes sell above
            // 649, and a variant can't sell for more than the MRP.
            await page.locator("#pe-name").fill(name);
            await page.locator("#pe-price").fill("649");
            await page.getByRole("combobox", { name: /^Category:/ }).click();
            await page
                .getByRole("option", { name: "Serums & treatments" })
                .click();
            await expect(
                page.getByText(
                    "It will be created as a draft — only the team will see it.",
                ),
            ).toBeVisible();

            // 3. Create it: you stay on the page, now editing it.
            await create.click();
            await expect(
                page.getByText(/^Created as a draft\./).first(),
            ).toBeVisible();
            await page.waitForURL(/\/commerce\/products\/[^/]+\/edit/);
            await expect(page.getByText("All changes saved")).toBeVisible();

            // 4–5. Three variants from the Volume option, then one save.
            const variants = page.getByRole("region", { name: "Variants" });
            await variants
                .getByRole("button", { name: "Add variants" })
                .click();
            for (const [size, price] of [
                ["15 ml", ""],
                ["30 ml", "1099"],
                ["50 ml", "1599"],
            ] as const) {
                await variants
                    .getByRole("combobox", { name: "New variant Volume" })
                    .click();
                await page
                    .getByRole("option", { name: size, exact: true })
                    .click();
                await expect(
                    variants.getByLabel("New variant SKU"),
                ).toHaveAttribute("placeholder", /-\d+ML$/);
                if (price) {
                    await variants
                        .getByLabel(
                            "New variant price, blank uses the product's",
                        )
                        .fill(price);
                }
                await variants
                    .getByRole("button", { name: "Add to list" })
                    .click();
            }
            await expect(variants.getByText("Unsaved")).toBeVisible();
            await variants
                .getByRole("button", { name: "Save variants" })
                .click();
            await expect(
                page.getByText("Variants saved.").first(),
            ).toBeVisible();

            // 6–7. Stock is left uncounted here (see the header); each size
            //    offers its own count.
            const stock = page.getByRole("region", { name: "Stock" });
            await expect(
                stock.getByRole("button", { name: "Add stock" }),
            ).toBeVisible();

            // 8. Three photos by address; the first is the cover.
            const photos = page.getByRole("region", {
                name: "Photos and videos",
            });
            for (const [i, url] of PHOTOS.entries()) {
                await photos
                    .getByRole("button", { name: "Or add one by its address" })
                    .click();
                await photos.getByLabel("Photo address").fill(url);
                await photos
                    .getByLabel("What it shows")
                    .fill(`Rosehip oil, view ${i + 1}`);
                await photos.getByRole("button", { name: "Add photo" }).click();
            }
            await expect(
                photos.getByText("Cover", { exact: true }).first(),
            ).toBeVisible();
            // The first is the cover, so only the other two offer it.
            await expect(
                photos.getByRole("button", {
                    name: /^Make photo \d the cover$/,
                }),
            ).toHaveCount(2);
            await photos.getByRole("button", { name: "Save media" }).click();
            await expect(
                page.getByText("Photos and videos saved.").first(),
            ).toBeVisible();

            // 9. Publishing is its own step, named for what it does.
            const visibility = page.getByRole("region", { name: "Visibility" });
            await visibility
                .getByRole("button", { name: /^Status: Draft/ })
                .click();
            await page
                .getByRole("menuitemradio", { name: /^Published/ })
                .click();
            await expect(
                visibility.getByText(/Saving publishes it for the first time/),
            ).toBeVisible();
            await visibility
                .getByRole("button", { name: "Publish", exact: true })
                .click();
            await expect(
                page.getByText("Published. Customers can buy it now.").first(),
            ).toBeVisible();

            // 10. The product page says everything that was just set.
            const id = /\/commerce\/products\/([^/]+)\/edit/.exec(
                page.url(),
            )?.[1];
            expect(id).toBeTruthy();
            await page.goto(`/commerce/products/${id}?storefront=${STORE}`);
            await expect(
                page.getByRole("heading", { name, level: 1 }),
            ).toBeVisible();
            await expect(
                page.getByText(/₹649\s*–\s*₹1,599/).first(),
            ).toBeVisible();
        } finally {
            await removeProducts(page.request, LEELA, name);
        }
    });

    test("the Stock section counts the product and saves it", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        // On Northwind: a count is history, so the product is set aside
        // afterwards under one fixed name and brought back next run.
        const name = `E2E Stock Count ${testInfo.project.name}`;
        const inventory = (id: string) =>
            `${urls.API_URL}/stores/${NW.storeId}/products/${id}/inventory`;
        const nwHeader = { "x-organization-id": NW.organizationId };

        await signIn(page);
        await page.goto(`/open/${NW.organizationId}`);

        try {
            const id = await takeProduct(page.request, NW, name, {
                price: "120.00",
                status: "DRAFT",
            });
            // A product brought back has a count already: aim for another
            // number, so the save has something to change.
            const before = await page.request.get(inventory(id), {
                headers: nwHeader,
            });
            expect(before.ok()).toBe(true);
            const { quantity } = (await before.json()) as {
                quantity: number | null;
            };
            const target = quantity === 3 ? 2 : 3;

            await page.goto(
                `/commerce/products/${id}/edit?storefront=${NW.storeId}#sec-stock`,
            );
            const stock = page.getByRole("region", { name: "Stock" });
            const add = stock.getByRole("button", { name: "Add stock" });
            const onHand = page.locator("#pe-qty");
            await expect(add.or(onHand)).toBeVisible();
            if (await add.isVisible()) await add.click();
            await onHand.fill(String(target));
            await stock.getByLabel("Warn when on hand reaches").fill("4");
            await stock.getByRole("button", { name: "Save stock" }).click();
            await expect(page.getByText("Stock saved.").first()).toBeVisible();

            const after = await page.request.get(inventory(id), {
                headers: nwHeader,
            });
            expect(await after.json()).toMatchObject({
                quantity: target,
                lowStockAlert: 4,
            });
        } finally {
            await removeProducts(page.request, NW, name);
        }
    });

    test("says a price above the MRP before Save, and a refusal in the API's words", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const taken = `Neem Face Wash ${testInfo.project.name}`;
        const name = `Kumkumadi Night Cream ${testInfo.project.name}`;

        await signIn(page);
        await page.goto(`/open/${ORG}`);
        await removeProducts(page.request, LEELA, taken);
        await removeProducts(page.request, LEELA, name);

        try {
            // A product whose address the new one will try to take.
            const made = await page.request.post(api(""), {
                headers: orgHeader,
                data: { name: taken, price: "299", currency: "INR" },
            });
            expect(made.ok()).toBe(true);
            const { id: takenId } = (await made.json()) as { id: string };
            const takenRes = await page.request.get(api(`/${takenId}`), {
                headers: orgHeader,
            });
            const { slug: takenSlug } = (await takenRes.json()) as {
                slug: string;
            };

            // 1. A cream with an MRP of 799.
            await page.goto(`/commerce/products/new?storefront=${STORE}`);
            await page.locator("#pe-name").fill(name);
            await page.locator("#pe-price").fill("649");
            await page.locator("#pe-mrp").fill("799");
            await page.getByRole("button", { name: "Create draft" }).click();
            await page.waitForURL(/\/commerce\/products\/[^/]+\/edit/);
            await expect(page.getByText("All changes saved")).toBeVisible();

            // 2. A size priced above the MRP is refused on the add row,
            // before anything is sent.
            const variants = page.getByRole("region", { name: "Variants" });
            await variants
                .getByRole("button", { name: "Add variants" })
                .click();
            await variants
                .getByRole("combobox", { name: "New variant Volume" })
                .click();
            await page
                .getByRole("option", { name: "30 ml", exact: true })
                .click();
            await variants
                .getByLabel("New variant price, blank uses the product's")
                .fill("1099");
            await expect(
                variants.getByText(/Above the MRP of ₹799/),
            ).toBeVisible();
            await expect(
                variants.getByRole("button", { name: "Add to list" }),
            ).toBeDisabled();

            // 3. An address another product has: only the API knows, and
            // the card says what it said.
            const basics = page.getByRole("region", { name: "Basics" });
            await page.locator("#pe-slug").fill(takenSlug);
            await basics.getByRole("button", { name: "Save basics" }).click();
            await expect(
                basics.getByText("That slug is already taken"),
            ).toBeVisible();
            await expect(page.getByText("Something went wrong")).toHaveCount(0);
        } finally {
            await removeProducts(page.request, LEELA, name);
            await removeProducts(page.request, LEELA, taken);
        }
    });
});
