import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * The product editor film (#472), as a test: make a product on one page,
 * part by part — basics, then variants, stock and photos once it exists —
 * publish it, and read it back on the product page.
 *
 * It runs on Leela & Loom, the showcase boutique, and leaves it as it found
 * it: the product it makes is deleted afterwards, and one left by a failed
 * run is deleted before it starts. Photos go in by address, since a test
 * stack has no file storage.
 */

const ORG = "seed_sc_ll_org";
const STORE = "seed_sc_ll_store";
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

/** Deletes every product of that name — the one made here, or a leftover. */
async function removeProducts(request: APIRequestContext, name: string) {
    const res = await request.get(api(""), { headers: orgHeader });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as
        | { id: string; name: string }[]
        | { items: { id: string; name: string }[] };
    const list = Array.isArray(body) ? body : body.items;
    for (const p of list.filter((x) => x.name === name)) {
        const del = await request.delete(api(`/${p.id}`), {
            headers: orgHeader,
        });
        expect(del.ok()).toBe(true);
    }
}

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
        await removeProducts(page.request, name);

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

            // 6–7. A count for each size; the smallest runs low.
            const stock = page.getByRole("region", { name: "Stock" });
            await stock.getByRole("button", { name: "Add stock" }).click();
            for (const [size, qty, low] of [
                ["15 ml", "24", "5"],
                ["30 ml", "12", "4"],
                ["50 ml", "3", "4"],
            ] as const) {
                await stock.getByLabel(`${size} on hand`).fill(qty);
                await stock
                    .getByLabel(`${size} warn when on hand reaches`)
                    .fill(low);
            }
            await expect(
                stock.getByText(/50 ml has 3 left/).first(),
            ).toBeVisible();
            await stock.getByRole("button", { name: "Save stock" }).click();
            await expect(page.getByText("Stock saved.").first()).toBeVisible();

            // 8. Three photos by address; the first is the cover.
            const photos = page.getByRole("region", { name: "Photos" });
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
            await photos.getByRole("button", { name: "Save photos" }).click();
            await expect(page.getByText("Photos saved.").first()).toBeVisible();

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
            await expect(page.getByText("1 low").first()).toBeVisible();
        } finally {
            await removeProducts(page.request, name);
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
        await removeProducts(page.request, taken);
        await removeProducts(page.request, name);

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
            await removeProducts(page.request, name);
            await removeProducts(page.request, taken);
        }
    });
});
