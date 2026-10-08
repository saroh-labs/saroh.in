// @covers accounts:/login app:/open app:/commerce/stock api:stock api:products
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import type { Storefront } from "../fixtures/throwaway-products";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { demoReviewer, demoUser, urls } from "../playwright.config";

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

/** Rye & Co. (the showcase) and Nisha, its counter — a Member. */
const rye = {
    org: "seed_sc_rc_org",
    member: { email: "nisha.kulkarni@saroh.dev", password: demoUser.password },
};

async function signIn(
    page: Page,
    who: { email: string; password: string } = demoUser,
) {
    await useSession(page, who);
}

const api = (path: string) => `${urls.API_URL}/stores/${STORE}/products${path}`;
// The API refuses a write with no Origin (#50).
const orgHeader = { "x-organization-id": ORG, origin: urls.APP_URL };

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
            // The product picker — not the "What happened" kinds above it.
            await sheet
                .getByRole("combobox", { name: "What", exact: true })
                .click();
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
                await dialog
                    .getByRole("combobox", { name: "What", exact: true })
                    .click();
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
        // Rye's counter (a Member) reads the catalogue, so reads stock, but
        // can't change it. Read-only: nothing is saved on the demo store.
        await signIn(page, rye.member);
        await page.goto(`/open/${rye.org}`);
        await page.goto("/commerce/stock");
        await expect(
            page.getByRole("heading", { name: "Stock", level: 1 }),
        ).toBeVisible();
        // The shelves are there to read…
        await expect(page.getByText("Sourdough loaf").first()).toBeVisible();
        // …and nothing on the screen changes them.
        for (const name of ["Count stock", "Record stock", "Move stock"]) {
            await expect(page.getByRole("button", { name })).toHaveCount(0);
        }
    });

    test("on a phone, nothing on Levels or the Log hides sideways", async ({
        page,
    }, testInfo) => {
        // T2/T3: under 760px each shelf is a card with a line per storefront
        // and each log entry two wrapping lines — no scroller, no column cut
        // off. Read-only on Rye (two storefronts, Hill Road and Online).
        test.skip(
            !testInfo.project.name.startsWith("phone"),
            "the phone layout",
        );
        await signIn(page, rye.member);
        await page.goto(`/open/${rye.org}`);

        /** What scrolls or clips sideways inside `main`, bar the tab strip. */
        const hidden = () =>
            page
                .locator("main")
                .evaluate((main) =>
                    [...main.querySelectorAll("*")]
                        .filter(
                            (el) =>
                                !el.closest("nav") &&
                                getComputedStyle(el).overflowX !== "visible" &&
                                el.scrollWidth > el.clientWidth + 1,
                        )
                        .map(
                            (el) =>
                                `${el.tagName}.${(el.getAttribute("class") ?? "").slice(0, 60)} ${el.scrollWidth}/${el.clientWidth}`,
                        ),
                );

        await page.goto("/commerce/stock");
        const levels = page.getByRole("list", { name: "Stock levels" });
        await expect(levels).toBeVisible();
        // A beans size Online sells: its Online line is on screen, whole.
        const beans = levels
            .getByRole("listitem")
            .filter({ hasText: "House blend beans" })
            .filter({ hasText: /Online.*can sell|Online.*Sold out/ })
            .first();
        await expect(beans).toBeVisible();
        const online = beans.getByText(/^Online ·$/);
        // Scrolled to, its whole line is on screen: nothing cut sideways.
        await online.scrollIntoViewIfNeeded();
        await expect(online).toBeInViewport({ ratio: 1 });
        expect(await hidden()).toEqual([]);

        await page.goto("/commerce/stock?tab=log");
        const entry = page.locator("main li").filter({ hasText: "→" }).first();
        await expect(entry).toBeVisible();
        const after = entry.getByText(/^\d+ → \d+$/);
        await after.scrollIntoViewIfNeeded();
        await expect(after).toBeInViewport({ ratio: 1 });
        expect(await hidden()).toEqual([]);
    });

    test("a role without Commerce is shown the door, not stock", async ({
        page,
    }) => {
        // The Reviewer is website only: Commerce, stock with it, is locked.
        await signIn(page, demoReviewer);
        await page.goto(`/open/${ORG}`);
        await page.goto("/commerce/stock");
        await expect(
            page.getByRole("heading", {
                name: "You do not have access to Commerce",
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Stock", level: 1 }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Count stock" }),
        ).toHaveCount(0);
    });
});
