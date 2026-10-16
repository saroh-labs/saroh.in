// @covers accounts:/login app:/open app:/commerce/products api:products api:stock
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { urls } from "../playwright.config";

/**
 * The product page finishes its own jobs (Products audit, 16 Oct 2026):
 * a draft is published from its header, at once, and Undo puts it back;
 * the stock sheet counts and prices but never deletes a variant — it has
 * no Remove, so saving it leaves every variant there.
 *
 * Runs on Northwind Supply. Each test makes its own product, one name per
 * project, and takes it away after (`fixtures/throwaway-products.ts`).
 */

const NW: Storefront = { organizationId: "seed_org", storeId: "seed_store" };
const orgHeader = {
    "x-organization-id": NW.organizationId,
    origin: urls.APP_URL,
};
const store = (path: string) =>
    `${urls.API_URL}/stores/${NW.storeId}/products${path}`;

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`/open/${NW.organizationId}`);
}

async function statusOf(
    request: APIRequestContext,
    id: string,
): Promise<string> {
    const res = await request.get(store(`/${id}`), { headers: orgHeader });
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { status: string }).status;
}

async function variantsOf(
    request: APIRequestContext,
    id: string,
): Promise<{ id: string; sku: string; title: string }[]> {
    const res = await request.get(store(`/${id}/variants`), {
        headers: orgHeader,
    });
    expect(res.ok()).toBe(true);
    return (await res.json()) as { id: string; sku: string; title: string }[];
}

test.describe("product page — status and the stock sheet", () => {
    test("a draft is published from its header, and Undo makes it a draft again", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Publish Undo ${testInfo.project.name}`;
        await signIn(page);

        try {
            const id = await takeProduct(page.request, NW, name, {
                price: "140.00",
                status: "DRAFT",
            });
            await page.goto(
                `/commerce/products/${id}?storefront=${NW.storeId}`,
            );
            const title = page.getByRole("heading", { level: 1, name });
            await expect(title).toBeVisible();

            // No "Not on the shop yet ↗": the draft's one thing is Publish.
            await expect(
                page.getByRole("button", { name: /Not on the shop/ }),
            ).toHaveCount(0);
            // The header's (desk) or docked (phone) Publish; the checklist
            // ends with the same one.
            const publish = page
                .locator("[data-product-actions]")
                .getByRole("button", { name: "Publish", exact: true });
            await expect(publish).toBeVisible();
            await publish.click();

            await expect(page.getByText(`${name} is live.`)).toBeVisible();
            await expect
                .poll(() => statusOf(page.request, id))
                .toBe("PUBLISHED");
            await expect(
                page
                    .locator("[data-product-actions]")
                    .getByRole("button", { name: "Publish", exact: true }),
            ).toHaveCount(0);

            await page.getByRole("button", { name: "Undo" }).click();
            await expect(page.getByText("Undone.")).toBeVisible();
            await expect.poll(() => statusOf(page.request, id)).toBe("DRAFT");
            await expect(
                page
                    .locator("[data-product-actions]")
                    .getByRole("button", { name: "Publish", exact: true }),
            ).toBeVisible();
        } finally {
            await removeProducts(page.request, NW, name);
        }
    });

    test("the stock sheet never deletes a variant", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Sheet Keeps Variants ${testInfo.project.name}`;
        await signIn(page);

        try {
            const id = await takeProduct(page.request, NW, name, {
                price: "90.00",
                status: "PUBLISHED",
            });
            const have = await variantsOf(page.request, id);
            for (const title of ["Small", "Large"]) {
                const sku = `E2E-KEEP-${title.toUpperCase()}-${testInfo.project.name}`;
                if (have.some((v) => v.sku === sku)) continue;
                const made = await page.request.post(store(`/${id}/variants`), {
                    headers: orgHeader,
                    data: { sku, title },
                });
                expect(made.ok()).toBe(true);
            }
            const before = await variantsOf(page.request, id);
            expect(before.length).toBeGreaterThanOrEqual(2);

            await page.goto(
                `/commerce/products/${id}?storefront=${NW.storeId}&tab=stock`,
            );
            // A first count ("Add stock") or a later one: the same sheet.
            await page
                .getByRole("tabpanel")
                .getByRole("button", {
                    name: /^(Add stock|Edit stock and prices)$/,
                })
                .first()
                .click();
            const sheet = page.getByRole("dialog");
            await expect(sheet).toBeVisible();

            // Nothing in it removes a variant, and the keyboard starts in
            // a count, not in a variant's name.
            await expect(
                sheet.getByRole("button", { name: /^Remove / }),
            ).toHaveCount(0);
            const onHand = sheet
                .locator("input[data-on-hand]:not([readonly])")
                .first();
            await expect(onHand).toBeFocused();

            await onHand.fill("4");
            await sheet.getByRole("button", { name: "Save" }).click();
            await expect(page.getByText(/saved\.$/).first()).toBeVisible();

            // Every variant is still there.
            const after = await variantsOf(page.request, id);
            expect(after.map((v) => v.id).sort()).toEqual(
                before.map((v) => v.id).sort(),
            );
        } finally {
            await removeProducts(page.request, NW, name);
        }
    });
});
