import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoUser, urls } from "../playwright.config";

/**
 * The Editor to the new design (#525), the parts that write: allergens
 * chosen before the first save, and "Sell it at" per variant. Both run on
 * Northwind Supply, the business browser checks may write to, and leave it
 * as they found it — the product each makes is taken away, and an allergen
 * added for the test is removed again (a business with an allergen list
 * reads as one that sells food, so it must not stay).
 */

const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };
const orgHeader = { "x-organization-id": NW.organizationId };
const org = (path: string) =>
    `${urls.API_URL}/organizations/${NW.organizationId}${path}`;
const store = (path: string) =>
    `${urls.API_URL}/stores/${NW.storeId}/products${path}`;

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

interface Allergen {
    id: string;
    name: string;
}

async function allergens(request: APIRequestContext): Promise<Allergen[]> {
    const res = await request.get(org("/catalogue/allergens"), {
        headers: orgHeader,
    });
    expect(res.ok()).toBe(true);
    return (await res.json()) as Allergen[];
}

test.describe("product editor on Northwind (#525)", () => {
    test("allergens can be set before the product is first saved", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Sesame Bun ${testInfo.project.name}`;
        const ALLERGEN = "E2E Sesame";

        await signIn(page);
        await page.goto(`/open/${NW.organizationId}`);
        await removeProducts(page.request, NW, name);
        const before = await allergens(page.request);
        const added = !before.some((a) => a.name === ALLERGEN);

        try {
            if (added) {
                const res = await page.request.post(
                    org("/catalogue/allergens"),
                    { headers: orgHeader, data: { names: [ALLERGEN] } },
                );
                expect(res.ok()).toBe(true);
            }

            await page.goto(`/commerce/products/new?storefront=${NW.storeId}`);
            // With an allergen list, Details reads as the food fields.
            const details = page.getByRole("region", {
                name: "Ready time and allergens",
            });
            await expect(details).toBeVisible();
            await page.locator("#pe-name").fill(name);
            await page.locator("#pe-price").fill("60");
            // Not greyed out while creating: it goes with the create call.
            const chip = details
                .getByRole("group", { name: "Contains" })
                .getByRole("button", { name: ALLERGEN });
            await expect(chip).toBeEnabled();
            await chip.click();
            await expect(chip).toHaveAttribute("aria-pressed", "true");
            await expect(
                details.getByText(
                    `Customers see: Contains ${ALLERGEN.toLowerCase()}.`,
                ),
            ).toBeVisible();

            await page.getByRole("button", { name: "Create draft" }).click();
            await page.waitForURL(/\/commerce\/products\/[^/]+\/edit/);
            await expect(page.getByText("All changes saved")).toBeVisible();

            const id = /\/commerce\/products\/([^/]+)\/edit/.exec(
                page.url(),
            )?.[1];
            expect(id).toBeTruthy();
            const read = await page.request.get(store(`/${id}`), {
                headers: orgHeader,
            });
            expect(read.ok()).toBe(true);
            const product = (await read.json()) as {
                allergens: { contains: Allergen[] };
            };
            expect(product.allergens.contains.map((a) => a.name)).toEqual([
                ALLERGEN,
            ]);
            // Opened again, nothing reads as unsaved (#525): not the
            // description, not the allergens.
            await page.reload();
            await expect(page.getByText("All changes saved")).toBeVisible();
        } finally {
            await removeProducts(page.request, NW, name);
            if (added) {
                const now = await allergens(page.request);
                const mine = now.find((a) => a.name === ALLERGEN);
                if (mine) {
                    const res = await page.request.delete(
                        org(`/catalogue/allergens/${mine.id}`),
                        { headers: orgHeader },
                    );
                    expect(res.ok()).toBe(true);
                }
            }
        }
    });

    test("unticking a storefront for a variant takes it off that listing", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Sell It At ${testInfo.project.name}`;

        await signIn(page);
        await page.goto(`/open/${NW.organizationId}`);
        const fronts = await page.request.get(org("/storefronts"), {
            headers: orgHeader,
        });
        expect(fronts.ok()).toBe(true);
        const stores = (
            (await fronts.json()) as { id: string; name: string }[]
        ).filter((s) => s.id !== NW.storeId);
        // "Sell it at" shows only with more than one storefront; Northwind
        // gains its Online storefront with the demo data (#526).
        const other = stores.at(0);
        test.skip(!other, "Northwind has one storefront");
        if (!other) return;

        try {
            const id = await takeProduct(page.request, NW, name, {
                price: "250.00",
                status: "DRAFT",
            });
            // Two variants, sold at both storefronts.
            const have = await page.request.get(store(`/${id}/variants`), {
                headers: orgHeader,
            });
            const existing = (await have.json()) as { sku: string }[];
            for (const title of ["Small", "Large"]) {
                const sku = `E2E-SELL-${title.toUpperCase()}-${testInfo.project.name}`;
                if (existing.some((v) => v.sku === sku)) continue;
                const made = await page.request.post(store(`/${id}/variants`), {
                    headers: orgHeader,
                    data: { sku, title },
                });
                expect(made.ok()).toBe(true);
            }
            const listings = org(`/products/${id}/listings`);
            for (const s of [NW.storeId, other.id]) {
                const res = await page.request.put(`${listings}/${s}`, {
                    headers: orgHeader,
                    data: {},
                });
                expect(res.ok()).toBe(true);
            }

            await page.goto(
                `/commerce/products/${id}/edit?storefront=${NW.storeId}#sec-variants`,
            );
            const variants = page.getByRole("region", { name: "Variants" });
            // The second variant's More: where it is sold.
            await variants.getByRole("button", { name: "More" }).nth(1).click();
            const where = variants.getByRole("group", {
                name: /^Where .* is sold$/,
            });
            const chip = where.getByRole("button", { name: other.name });
            await expect(chip).toHaveAttribute("aria-pressed", "true");
            await chip.click();
            await expect(chip).toHaveAttribute("aria-pressed", "false");
            await expect(variants.getByText("Unsaved")).toBeVisible();
            await variants
                .getByRole("button", { name: "Save variants" })
                .click();
            await expect(
                page.getByText("Variants saved.").first(),
            ).toBeVisible();

            const after = await page.request.get(listings, {
                headers: orgHeader,
            });
            expect(after.ok()).toBe(true);
            const views = (await after.json()) as {
                storeId: string;
                listed: boolean;
                variants: { soldHere: boolean }[];
            }[];
            const there = views.find((v) => v.storeId === other.id);
            const here = views.find((v) => v.storeId === NW.storeId);
            // One variant left at the other storefront; both still here.
            expect(there?.listed).toBe(true);
            expect(there?.variants.filter((v) => v.soldHere)).toHaveLength(1);
            expect(here?.variants.filter((v) => v.soldHere)).toHaveLength(2);
        } finally {
            await removeProducts(page.request, NW, name);
        }
    });
});
