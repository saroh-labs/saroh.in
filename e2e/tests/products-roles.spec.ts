// @covers accounts:/login app:/open app:/commerce/products app:/commerce/products/new app:/commerce/products/import api:products api:stores api:imports
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { asOwner, openNorthwindAs } from "../fixtures/roles";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Products for everyone on the team, not only the owner (16 Oct audits,
 * SEV 4). The locations used to come from the ones the signed-in person
 * OWNS, so on Northwind an Admin was told "No locations yet" on New product
 * and Import and "Product not found" on Edit, and a Member got the same
 * "not found" in place of the read-only editor. The locations are now the
 * business's, and what someone may change is their role's answer.
 *
 * Every product here is the test's own, stamped, and taken away after.
 */

const NW: Storefront = { organizationId: NORTHWIND_ORG, storeId: "seed_store" };

interface Location {
    id: string;
    name: string;
}

/** A location's row in the chooser, by its name. */
const named = (name: string) =>
    new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

test.describe("products for every role on Northwind", () => {
    test("an Admin edits a product they don't own a location of", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Admin Edit ${stamp(testInfo)}`;
        const renamed = `${name} renamed`;
        const owner = await asOwner(browser);
        try {
            const id = await takeProduct(owner.request, NW, name, {
                price: "120",
                status: "DRAFT",
            });

            await openNorthwindAs(page, "admin");
            await page.goto(`/commerce/products/${id}/edit`);
            await expect(page.getByText("Product not found")).toHaveCount(0);
            await expect(page.locator("#pe-name")).toHaveValue(name);
            // No read-only line: an Admin may change products.
            await expect(
                page.getByText(/viewing as|signed in as/i),
            ).toHaveCount(0);

            await page.locator("#pe-name").fill(renamed);
            await page
                .getByRole("region", { name: "Basics" })
                .getByRole("button", { name: /^Save/ })
                .click();
            await expect(page.getByText("All changes saved")).toBeVisible();

            const saved = await northwind(owner.request).get<{ name: string }>(
                `/stores/${NW.storeId}/products/${id}`,
            );
            expect(saved.name).toBe(renamed);
        } finally {
            await removeProducts(owner.request, NW, name);
            await removeProducts(owner.request, NW, renamed);
            await owner.close();
        }
    });

    test("an Admin creates a product at a location of the business", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Admin New ${stamp(testInfo)}`;
        const owner = await asOwner(browser);
        const locations = await northwind(owner.request).get<Location[]>(
            "/storefronts",
        );
        try {
            await openNorthwindAs(page, "admin");
            await page.goto("/commerce/products/new");
            await expect(page.getByText("No locations yet")).toHaveCount(0);
            // Northwind has more than one location, so it asks which.
            await page
                .getByRole("link", { name: named(locations[0].name) })
                .click();
            await page.locator("#pe-name").fill(name);
            await page.locator("#pe-price").fill("75");
            await page.getByRole("button", { name: "Create draft" }).click();
            await page.waitForURL(/\/commerce\/products\/[^/]+\/edit/);
            await expect(page.getByText("All changes saved")).toBeVisible();
        } finally {
            for (const s of locations) {
                await removeProducts(
                    owner.request,
                    { organizationId: NW.organizationId, storeId: s.id },
                    name,
                );
            }
            await owner.close();
        }
    });

    test("a Member opens Edit and reads the product, with the one access line", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Member Read ${stamp(testInfo)}`;
        const owner = await asOwner(browser);
        try {
            const id = await takeProduct(owner.request, NW, name, {
                price: "90",
                status: "DRAFT",
            });

            await openNorthwindAs(page, "northwindMember");
            await page.goto(`/commerce/products/${id}/edit`);
            await expect(page.getByText("Product not found")).toHaveCount(0);
            await expect(page.locator("#pe-name")).toHaveValue(name);
            await expect(
                page.getByText(/(viewing|signed in) as Member\./),
            ).toBeVisible();
            await expect(
                page.getByText(
                    /You can (read this product but not change it|look, but not change anything)/,
                ),
            ).toBeVisible();
        } finally {
            await removeProducts(owner.request, NW, name);
            await owner.close();
        }
    });

    test("an Admin choosing where an import goes sees every location, and what each is", async ({
        page,
        browser,
    }) => {
        const owner = await asOwner(browser);
        let locations: Location[];
        try {
            locations = await northwind(owner.request).get<Location[]>(
                "/storefronts",
            );
        } finally {
            await owner.close();
        }
        expect(locations.length).toBeGreaterThan(1);

        await openNorthwindAs(page, "admin");
        await page.goto("/commerce/products/import");
        await expect(
            page.getByRole("heading", {
                name: "Which location do they go into?",
            }),
        ).toBeVisible();
        await expect(page.getByText("No locations yet")).toHaveCount(0);
        await expect(
            page.getByText(
                /^They'll be sold here\. You can add them to your other locations? from each product\.$/,
            ),
        ).toBeVisible();
        for (const l of locations) {
            const row = page.getByRole("link", { name: named(l.name) });
            await expect(row).toBeVisible();
            await expect(row).toContainText(
                /(No counter|Customers visit) · \d+ products?/,
            );
        }
    });
});
