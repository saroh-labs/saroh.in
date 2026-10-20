// @covers site:/shop site:/checkout api:orders api:sites pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { overrideNorthwindFlag, setNorthwindLook } from "../fixtures/site-look";
import { takeProduct } from "../fixtures/throwaway-products";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import { asNewVisitor, expectNoZoomOnFocus, readSiteCode } from "./site-codes";

/**
 * The shop in each look (DEC-172, plan U11, #1102), on Northwind's own
 * site, desk and phone (the `desk-serial` and `phone-serial` projects).
 *
 * For Folio, Quiet and Live, a new visitor:
 *
 * - adds two of this spec's own products from their pages, the second
 *   page's Add to bag turning into the − 1 + stepper;
 * - opens the bag, which asks nothing about pick-up or delivery and leads
 *   to the checkout page;
 * - in checkout, chooses pick-up once, confirms the email with the code
 *   inside Your details, chooses to pay at pick-up, and the place button
 *   says so;
 * - places the order and lands on Order placed.
 *
 * What it owns: `SITE_SHOP` and `SITE_LOOKS` turned on for Northwind alone
 * (per-business overrides, put back after), Northwind's site style (put
 * back and published again), the storefront's Pick-up and "Pay when you
 * collect" (put back), and two products called "E2E Look Shop …", brought
 * back the same each run. It leaves one unpaid pay-at-pick-up order per
 * look and project on Northwind.
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;
const PRODUCTS = ["E2E Look Shop Loaf", "E2E Look Shop Jam"] as const;

interface Storefront {
    id: string;
    fulfilmentTypes: string[];
    offerPayOnHandover: boolean;
}

/** The storefront Northwind's site sells from (G11). */
async function sellsFrom(nw: ReturnType<typeof northwind>): Promise<string> {
    const sites =
        await nw.get<{ id: string; subdomain: string | null }[]>("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    const read = await nw.get<{
        sellsFrom: { storefront: { id: string } | null } | null;
    }>(`/sites/${site?.id ?? ""}`);
    const id = read.sellsFrom?.storefront?.id;
    expect(id, "Northwind's site sells from a storefront").toBeTruthy();
    return id ?? "";
}

/** The visible one of a control drawn twice (a desk aside, a phone bar). */
const visible = (page: Page, selector: string) =>
    page.locator(selector).filter({ visible: true }).first();

/** Add the product on its own page; a press before hydration is lost. */
async function addFromItsPage(page: Page, slug: string, name: string) {
    await page.goto(`${SITE}/shop/${slug}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const add = page
        .getByRole("button", { name: /Add to bag/ })
        .filter({ visible: true })
        .first();
    const stepper = page
        .getByRole("button", { name: `Take ${name} out of your bag` })
        .filter({ visible: true })
        .first();
    await expect(async () => {
        await add.click();
        await expect(stepper).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    // The stepper is 44px a button, on a phone too.
    const box = await stepper.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
}

test.describe("the shop in each look", { tag: "@serial" }, () => {
    test.beforeEach(({ page }) => asNewVisitor(page));

    for (const id of LOOKS) {
        test(`${id}: two items, the bag, then checkout with pick-up and pay at pick-up`, async ({
            page,
            browser,
        }, testInfo) => {
            test.setTimeout(180_000);

            // The team's side: the shop on, the storefront taking pick-up
            // and payment at the counter, and this spec's two products.
            const shop = await overrideNorthwindFlag(
                browser,
                "SITE_SHOP",
                testInfo,
            );
            const team = await browser.newContext({
                baseURL: urls.APP_URL,
                ignoreHTTPSErrors,
            });
            const teamPage = await team.newPage();
            await useSession(teamPage);
            const nw = northwind(teamPage.request);
            const storeId = await sellsFrom(nw);
            const was = await nw.get<Storefront>(`/storefronts/${storeId}`);
            await nw.patch(`/storefronts/${storeId}`, {
                offerPayOnHandover: true,
                fulfilmentTypes: was.fulfilmentTypes.includes("PICKUP")
                    ? was.fulfilmentTypes
                    : ["PICKUP", ...was.fulfilmentTypes],
            });
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                const slugs: string[] = [];
                for (const [i, name] of PRODUCTS.entries()) {
                    const productId = await takeProduct(
                        teamPage.request,
                        { organizationId: NORTHWIND_ORG, storeId },
                        name,
                        {
                            price: i === 0 ? "240.00" : "180.00",
                            status: "PUBLISHED",
                        },
                    );
                    const product = await nw.get<{
                        slug?: string;
                        product?: { slug: string };
                    } | null>(`/stores/${storeId}/products/${productId}`);
                    const slug = product?.slug ?? product?.product?.slug ?? "";
                    expect(slug, `${name} has an address on the shop`).not.toBe(
                        "",
                    );
                    slugs.push(slug);
                }
                await look.publish();

                // Two items, each from its page.
                for (const [i, name] of PRODUCTS.entries()) {
                    await addFromItsPage(page, slugs[i] ?? "", name);
                }

                // The bag: the lines and the total, no pick-up question.
                await page
                    .getByRole("button", { name: "Your bag, 2 items" })
                    .filter({ visible: true })
                    .first()
                    .click();
                const bag = page.getByRole("dialog");
                await expect(bag).toHaveAttribute("data-sheet-look", id);
                for (const name of PRODUCTS)
                    await expect(bag).toContainText(name);
                await expect(bag.getByRole("radiogroup")).toHaveCount(0);
                await expect(bag.getByRole("radio")).toHaveCount(0);
                const out = bag
                    .getByRole("link", { name: /Check out/ })
                    .filter({ visible: true })
                    .first();
                await expect(out).toHaveAttribute("href", "/checkout");
                await out.click();

                // Checkout asks pick-up or delivery once.
                await expect(page).toHaveURL(/\/checkout$/);
                const ways = page.getByRole("radiogroup", {
                    name: "1 · Pick-up or delivery",
                });
                await expect(ways).toHaveCount(1, { timeout: 15_000 });
                await ways.getByRole("radio", { name: /Pick-up/ }).click();
                await expect(page.locator("[data-pickup-ready]")).toBeVisible();

                // Your details: the code, inside the page.
                const email = `shop-${id}-${testInfo.project.name}-${Date.now()}@example.com`;
                const emailField = page.getByLabel("Email");
                await expectNoZoomOnFocus(emailField);
                await emailField.fill(email);
                await emailField.press("Tab");
                const code = await readSiteCode(email);
                const codeField = page.getByLabel("Code");
                await expect(codeField).toHaveAttribute(
                    "autocomplete",
                    "one-time-code",
                );
                await codeField.fill(code);
                await expect(page.getByText(/^Ordering as/)).toBeVisible({
                    timeout: 15_000,
                });

                // Pay at pick-up: the button follows the choice.
                const pays = page.getByRole("radiogroup", {
                    name: "3 · How you'll pay",
                });
                const collect = pays.getByRole("radio", {
                    name: /Pay at pick-up/,
                });
                if ((await collect.count()) > 0) await collect.click();
                const place = visible(page, "[data-place-order]");
                await expect(place).toHaveText(
                    /^Place order · pay .+ at pick-up$/,
                );
                // Nothing here may open a provider's window.
                await page.route("https://checkout.razorpay.com/**", (r) =>
                    r.abort(),
                );
                await place.click();

                // Order placed.
                await expect(page).toHaveURL(/\/shop\/order\//, {
                    timeout: 30_000,
                });
                await expect(
                    page.getByRole("heading", { name: "Order placed." }),
                ).toBeVisible();
                await expect(
                    page.locator(`[data-look-placed="${id}"]`),
                ).toContainText("We'll email you when it's ready for pick-up.");
            } finally {
                await look.restore();
                await nw.patch(`/storefronts/${storeId}`, {
                    offerPayOnHandover: was.offerPayOnHandover,
                    fulfilmentTypes: was.fulfilmentTypes,
                });
                await team.close();
                await shop.restore();
            }
        });
    }
});
