import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoUser, urls } from "../playwright.config";

/**
 * Sell › Stock (#527, #521): count a shelf and undo the count, record
 * waste and see it in the log, move stock between storefronts when there
 * are several, and refuse what isn't a whole number.
 *
 * It runs on Northwind Supply (Rye & Co. and Pulse Fitness stay
 * camera-ready), on a product of its own counted at 7 — found by its name
 * with the Levels search, so the seed's own shelves are never counted. It
 * leaves that product counted back at 7 and set to Not sold under one
 * fixed name (`fixtures/throwaway-products.ts`).
 */

const ORG = "seed_org";
const STORE = "seed_store";
const NW: Storefront = { organizationId: ORG, storeId: STORE };
const COUNT = 7;

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

/** Track stock on, and the shelf counted back to 7. */
async function putBack(request: APIRequestContext, productId: string) {
    const on = await request.put(api(`/${productId}/stock-tracking`), {
        headers: orgHeader,
        data: { tracked: true },
    });
    expect(on.ok()).toBe(true);
    const counted = await request.put(api(`/${productId}/inventory`), {
        headers: orgHeader,
        data: { quantity: COUNT },
    });
    expect(counted.ok()).toBe(true);
}

test.describe("Stock screen", () => {
    test("count and undo, record waste, and read the log", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const name = `E2E Stock Jar ${testInfo.project.name}`;

        await signIn(page);
        await page.goto(`/open/${ORG}`);

        let id: string | undefined;
        try {
            id = await takeProduct(page.request, NW, name, {
                price: "120.00",
                status: "PUBLISHED",
            });
            await putBack(page.request, id);

            await page.goto(`/commerce/stock?q=${encodeURIComponent(name)}`);
            await expect(
                page.getByRole("heading", { name: "Stock", level: 1 }),
            ).toBeVisible();
            await expect(page.getByText(name)).toBeVisible();
            await expect(
                page.getByText("7 on hand · 0 promised"),
            ).toBeVisible();

            // 1. Count: "1.5" is refused and keeps Save count off; an empty
            //    box is skipped.
            await page.getByRole("button", { name: "Count stock" }).click();
            await expect(page.getByText(/^Counting\./)).toBeVisible();
            const box = page.getByLabel(new RegExp(`^${name} counted at `));
            await box.first().fill("1.5");
            await expect(
                page.getByText("Whole numbers only.").first(),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: "Save count" }),
            ).toBeDisabled();
            await box.first().fill("9");
            await expect(page.getByText("+2 against the log")).toBeVisible();
            await expect(
                page.getByText("1 counted · 1 differ from the log"),
            ).toBeVisible();
            await page.getByRole("button", { name: "Save count" }).click();
            await expect(
                page.getByText("Count saved: 1 counted, 1 changed."),
            ).toBeVisible();
            await expect(
                page.getByText("9 on hand · 0 promised"),
            ).toBeVisible();

            // 2. Undo reverses the count as a batch.
            await page.getByRole("button", { name: "Undo" }).click();
            await expect(page.getByText("Count undone.")).toBeVisible();
            await expect(
                page.getByText("7 on hand · 0 promised"),
            ).toBeVisible();

            // 3. Record 2 wasted from the sheet, and find it in the log.
            await page.getByRole("button", { name: "Record stock" }).click();
            const sheet = page.getByRole("dialog", { name: "Record stock" });
            await sheet.getByRole("radio", { name: "Wasted" }).click();
            await sheet.getByLabel("What").click();
            await page.getByRole("option", { name, exact: true }).click();
            await sheet.getByLabel("How many").fill("2");
            await sheet.getByRole("button", { name: "Record" }).click();
            await expect(
                page.getByText("Recorded 2 wasted — 5 on hand now."),
            ).toBeVisible();

            await page.goto(
                `/commerce/stock?tab=log&kind=wasted&product=${id}`,
            );
            await expect(page.getByText(name).first()).toBeVisible();
            await expect(page.getByText("7 → 5").first()).toBeVisible();

            // 4. Move stock, where the business has more than one storefront.
            await page.goto(`/commerce/stock?q=${encodeURIComponent(name)}`);
            const move = page.getByRole("button", { name: "Move stock" });
            if (await move.isVisible()) {
                await move.click();
                const dialog = page.getByRole("dialog", { name: "Move stock" });
                await dialog.getByLabel("What").click();
                await page.getByRole("option", { name, exact: true }).click();
                await dialog.getByLabel("How many").fill("50");
                await expect(
                    dialog.getByText(/^Only 5 can be moved/),
                ).toBeVisible();
                await expect(
                    dialog.getByRole("button", { name: "Move" }),
                ).toBeDisabled();
                await dialog.getByRole("button", { name: "Cancel" }).click();
            }
        } finally {
            if (id) await putBack(page.request, id);
            await removeProducts(page.request, NW, name);
        }
    });

    test("a role that can't count sees no Count stock", async ({ page }) => {
        // The Reviewer reads the catalogue but can't change stock.
        await page.goto(`${urls.ACCOUNTS_URL}/login`);
        await page.getByLabel("Email").fill("reviewer@saroh.dev");
        await page
            .getByLabel("Password", { exact: true })
            .fill(demoUser.password);
        await page.getByRole("button", { name: "Log in" }).click();
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
            timeout: 30_000,
        });
        await page.goto(`/open/${ORG}`);
        await page.goto("/commerce/stock");
        await expect(
            page
                .getByRole("heading", { name: "Stock", level: 1 })
                .or(page.getByText("You can't open stock")),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Count stock" }),
        ).toHaveCount(0);
    });
});
