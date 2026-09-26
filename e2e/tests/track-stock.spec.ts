import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * Track stock and Sold out by hand (#515), through the screens that change
 * them: the editor's Stock switch turns tracking off (after asking), the
 * product page's untracked card marks the product sold out and available
 * again, and its Track stock button turns tracking back on.
 *
 * It runs on Northwind Supply, the base seed (Rye & Co. and Pulse Fitness
 * stay camera-ready). The seed's own products hold stock for open orders,
 * and Track stock off is refused while anything is promised, so it makes a
 * product of its own, counted at 7. It leaves that product as it found it,
 * tracked with its count back at 7, then deletes it; one left by a failed
 * run is deleted before it starts.
 */

const ORG = "seed_org";
const STORE = "seed_store";
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

/** Deletes every product of that name: the one made here, or a leftover. */
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

/** Track stock on, and the shelf counted back to what it was. */
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
    expect(await counted.json()).toMatchObject({ quantity: COUNT });
}

test.describe("Track stock and Sold out", () => {
    test("stop tracking in the editor, mark sold out and available, then track again", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        // One name per project: desk and phone run one after the other.
        const name = `E2E Beeswax Wrap ${testInfo.project.name}`;

        await signIn(page);
        await page.goto(`/open/${ORG}`);
        await removeProducts(page.request, name);

        // Made and counted through the API: a published product at 7.
        const made = await page.request.post(api(""), {
            headers: orgHeader,
            data: { name, price: "240.00", status: "PUBLISHED" },
        });
        expect(made.ok()).toBe(true);
        const { id } = (await made.json()) as { id: string };
        const counted = await page.request.put(api(`/${id}/inventory`), {
            headers: orgHeader,
            data: { quantity: COUNT },
        });
        expect(counted.ok()).toBe(true);

        try {
            // 1. The editor's Stock section: the switch is on; turning it
            //    off asks first, because the count goes to 0.
            await page.goto(
                `/commerce/products/${id}/edit?storefront=${STORE}#sec-stock`,
            );
            const track = page.getByRole("switch", {
                name: "Track stock for this product",
            });
            await expect(track).toHaveAttribute("aria-checked", "true");
            await track.click();
            const ask = page.getByRole("alertdialog");
            await expect(ask).toContainText(`Stop tracking ${name}?`);
            await ask.getByRole("button", { name: "Stop tracking" }).click();
            await expect(
                page.getByText("Stock is no longer tracked for this product."),
            ).toBeVisible();
            await expect(track).toHaveAttribute("aria-checked", "false");

            // 2. The product page: not tracked, and available on the shop.
            await page.goto(`/commerce/products/${id}?storefront=${STORE}`);
            await expect(page.getByText("Not tracked")).toBeVisible();
            await expect(
                page.getByText("Available on the shop."),
            ).toBeVisible();

            // 3. Mark it sold out by hand, then available again.
            await page.getByRole("button", { name: "Mark sold out" }).click();
            await expect(page.getByText(/^Marked sold out at /)).toBeVisible();
            await expect(
                page.getByText("Sold out — marked by hand"),
            ).toBeVisible();
            await page.getByRole("button", { name: "Mark available" }).click();
            await expect(page.getByText(/^Available again at /)).toBeVisible();
            await expect(
                page.getByText("Available on the shop."),
            ).toBeVisible();

            // 4. Track stock again: it starts at 0 and opens the count.
            await page.getByRole("button", { name: "Track stock" }).click();
            await expect(
                page.getByText("Stock is tracked for this product again."),
            ).toBeVisible();
            await page.waitForURL(/\/commerce\/products\/[^/]+\/edit/);
            await expect(
                page.getByRole("switch", {
                    name: "Track stock for this product",
                }),
            ).toHaveAttribute("aria-checked", "true");
        } finally {
            // As it was found: tracked, counted at 7. Then gone.
            await putBack(page.request, id);
            await removeProducts(page.request, name);
        }
    });
});
