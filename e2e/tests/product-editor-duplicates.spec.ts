// @covers accounts:/login app:/open app:/commerce/products/new app:/commerce/products api:products
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts } from "../fixtures/throwaway-products";
import { urls } from "../playwright.config";

/**
 * A name or a SKU another product has (products audit, 16 Oct 2026):
 * New product takes the first free path ("…-2") and says so as the name is
 * typed, rather than refusing with "slug"; and a SKU another product's
 * variant has is refused under that row's SKU box, naming the holder.
 *
 * Northwind Supply, the business browser checks may write to. Every
 * product here is made for the test, named per project, and taken away
 * afterwards (none is counted, so each can be deleted).
 */

const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };
const orgHeader = {
    "x-organization-id": NW.organizationId,
    origin: urls.APP_URL,
};
const products = (path = "") =>
    `${urls.API_URL}/organizations/${NW.organizationId}/products${path}?storefront=${NW.storeId}`;

test.describe("product editor: names and SKUs other products have", () => {
    test("a taken name is created at the next free path, said as it is typed", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Dupe Tape ${testInfo.project.name}`;

        await useSession(page);
        await page.goto(`/open/${NW.organizationId}`);
        await removeProducts(page.request, NW, name);

        try {
            const made = await page.request.post(products(), {
                headers: orgHeader,
                data: { name, price: "99", currency: "INR" },
            });
            expect(made.ok()).toBe(true);
            const { id: firstId } = (await made.json()) as { id: string };
            const first = await page.request.get(products(`/${firstId}`), {
                headers: orgHeader,
            });
            const { slug } = (await first.json()) as { slug: string };

            await page.goto(`/commerce/products/new?storefront=${NW.storeId}`);
            await page.locator("#pe-name").fill(name);
            await page.locator("#pe-price").fill("99");
            const basics = page.getByRole("region", { name: "Basics" });
            // The path it will really get, before anything is pressed.
            await expect(
                basics.getByText(
                    `${name} already uses ${slug}, so this one gets ${slug}-2.`,
                    { exact: false },
                ),
            ).toBeVisible();
            await expect(basics.getByText(/slug/i)).toHaveCount(0);

            await page.getByRole("button", { name: "Create draft" }).click();
            await page.waitForURL(/\/commerce\/products\/[^/]+\/edit/);
            await expect(
                page.getByText(/^Created as a draft\./).first(),
            ).toBeVisible();
            await expect(page.locator("#pe-slug")).toHaveValue(`${slug}-2`);
        } finally {
            await removeProducts(page.request, NW, name);
        }
    });

    test("a SKU another product has is refused on its row, naming it", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const holder = `E2E Sku Holder ${testInfo.project.name}`;
        const name = `E2E Sku Taker ${testInfo.project.name}`;
        const sku = `E2E-DUP-${testInfo.project.name}`.toUpperCase();

        await useSession(page);
        await page.goto(`/open/${NW.organizationId}`);
        await removeProducts(page.request, NW, holder);
        await removeProducts(page.request, NW, name);

        try {
            const make = async (n: string) => {
                const res = await page.request.post(products(), {
                    headers: orgHeader,
                    data: { name: n, price: "99", currency: "INR" },
                });
                expect(res.ok()).toBe(true);
                return ((await res.json()) as { id: string }).id;
            };
            const holderId = await make(holder);
            const variant = await page.request.post(
                products(`/${holderId}/variants`),
                { headers: orgHeader, data: { sku, title: "Brown" } },
            );
            expect(variant.ok()).toBe(true);
            const id = await make(name);
            // Its own variant, with a SKU of its own: changed in the
            // editor to the holder's, it is refused on the row.
            const own = await page.request.post(products(`/${id}/variants`), {
                headers: orgHeader,
                data: { sku: `${sku}-OWN`, title: "Clear" },
            });
            expect(own.ok()).toBe(true);

            await page.goto(`/commerce/products/${id}/edit`);
            const variants = page.getByRole("region", { name: "Variants" });
            const rowSku = variants.getByLabel("Variant 1 SKU");
            await rowSku.fill(sku);
            await variants
                .getByRole("button", { name: "Save variants" })
                .click();

            // Under the row's SKU box, not a toast or the bar's line.
            const refusal = `${sku} is already ${holder} · Brown.`;
            await expect(variants.getByRole("alert")).toHaveText(refusal);
            await expect(rowSku).toHaveAttribute("aria-invalid", "true");
            await expect(page.getByText(refusal)).toHaveCount(1);

            // The variant kept its own SKU.
            const read = await page.request.get(products(`/${id}`), {
                headers: orgHeader,
            });
            const saved = (await read.json()) as {
                variants: { sku: string }[];
            };
            expect(saved.variants.map((v) => v.sku)).toEqual([`${sku}-OWN`]);
        } finally {
            await removeProducts(page.request, NW, name);
            await removeProducts(page.request, NW, holder);
        }
    });
});
