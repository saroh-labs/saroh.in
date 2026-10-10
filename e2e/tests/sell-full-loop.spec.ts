// @covers site:/shop site:/shop/[productSlug] site:/account/orders app:/open app:/commerce/orders app:/customers api:orders api:products api:stores api:sites api:site-accounts api:customer-workspace pkg:site-blocks
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { takeProduct } from "../fixtures/throwaway-products";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

/**
 * The whole paid path of an order, end to end (#122): a product in the
 * catalogue, bought at the checkout on Northwind's site, paid, walked
 * through the kitchen to Collected, refunded, and the customer's history
 * saying so — the customer in a browser of their own, the team in the
 * workspace.
 *
 * How it pays. No browser spec settles an online payment: the stack's
 * provider connections hold placeholder credentials (the seed never makes
 * one that looks usable), so the API can't make a provider order, and the
 * fake provider the booking page's spec uses stands in for the window and
 * the hold's poll in the browser only — nothing reaches the API's webhook.
 * The success webhook is the API's integration specs' (`public-checkout
 * .db.spec.ts`, against `FakeProvider`). So the customer chooses "Pay when
 * you collect" — a real order from the moment it is placed — and the
 * counter takes the money and records it, which makes it paid exactly as
 * an online payment does as far as the kitchen, the refund and the history
 * go. The refund is the counter's too: money taken by hand goes back by
 * hand ("Record as refunded", #865).
 *
 * What it needs. The shop sits behind `SITE_SHOP` (off by default), so this
 * runs where the stack was prepared as `site-shop.spec.ts` asks and says so
 * with `E2E_SITE_SHOP=1`: Northwind's override on and its site selling from
 * a storefront. The customer's own history is read on the site's account
 * area when the stack runs it (`SITE_ACCOUNT_AREA=on`); the workspace's
 * Customer Detail is read either way.
 *
 * What it owns. Its product (`LOOP_PRODUCT`, untracked, so it holds no stock
 * another test counts) and a new customer per run, with a new email and a
 * visitor address of their own. It turns on "Pay when you collect" and
 * Pick-up at the storefront the site sells from, which every checkout on
 * Northwind reads, so it is `@serial` and puts both back as they were.
 *
 * Hydration (#846): a server-drawn button pressed before React has hydrated
 * does nothing, so each first press on a page is retried until what it does
 * is seen (`pressUntil`).
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const SHOP_READY = process.env.E2E_SITE_SHOP === "1";
const ACCOUNT_AREA = process.env.SITE_ACCOUNT_AREA === "on";

/** The product this spec sells; it brings back the same one every run. */
const LOOP_PRODUCT = "E2E Full Loop Loaf";

interface Storefront {
    id: string;
    fulfilmentTypes: string[];
    offerPayOnHandover: boolean;
}

/** Press `button` until `done` is seen: a press before hydration is lost. */
async function pressUntil(button: Locator, done: Locator): Promise<void> {
    await expect(async () => {
        await button.click();
        await expect(done).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
}

/** The storefront Northwind's site sells from (G11). */
async function sellsFrom(page: Page): Promise<string> {
    const nw = northwind(page.request);
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

/** A toast; two Toasters are mounted (one per theme), one is shown. */
const toast = (page: Page, text: string | RegExp) =>
    page.getByText(text).locator("visible=true").first();

test.describe("selling, end to end (#122)", () => {
    test.skip(
        !SHOP_READY,
        "Needs Northwind's shop switched on (E2E_SITE_SHOP=1)",
    );

    test(
        "catalogue → checkout on the site → paid → collected → refunded → in the customer's history",
        { tag: "@serial" },
        async ({ page, browser }, testInfo) => {
            test.setTimeout(240_000);

            // The team, in the workspace.
            await useSession(page);
            await page.goto(`/open/${NORTHWIND_ORG}`);
            const nw = northwind(page.request);

            // The storefront the site sells from: Pick-up and "Pay when you
            // collect" on for this test, put back after.
            const storeId = await sellsFrom(page);
            const was = await nw.get<Storefront>(`/storefronts/${storeId}`);
            await nw.patch(`/storefronts/${storeId}`, {
                offerPayOnHandover: true,
                fulfilmentTypes: was.fulfilmentTypes.includes("PICKUP")
                    ? was.fulfilmentTypes
                    : ["PICKUP", ...was.fulfilmentTypes],
            });

            // Catalogue: our own product, published and listed there.
            const productId = await takeProduct(
                page.request,
                { organizationId: NORTHWIND_ORG, storeId },
                LOOP_PRODUCT,
                { price: "240.00", status: "PUBLISHED" },
            );
            const product = await nw.get<{
                slug?: string;
                product?: { slug: string };
            } | null>(`/stores/${storeId}/products/${productId}`);
            const slug = product?.slug ?? product?.product?.slug ?? "";
            expect(slug, "the product has an address on the shop").not.toBe("");

            // The customer, in a browser of their own.
            const shopper = await browser.newContext({ ignoreHTTPSErrors });
            const site = await shopper.newPage();
            try {
                await asNewVisitor(site);
                const email = `loop-${testInfo.project.name}-${Date.now()}@example.in`;

                // Checkout on the merchant's site.
                await site.goto(`${SITE}/shop/${slug}`);
                await expect(
                    site.getByRole("heading", { name: LOOP_PRODUCT }),
                ).toBeVisible();
                await pressUntil(
                    site.getByRole("button", { name: "Add to bag" }),
                    site
                        .getByRole("status")
                        .filter({ hasText: "added to your bag" }),
                );
                await site.getByRole("button", { name: /^Your bag, / }).click();
                const bag = site.getByRole("dialog");
                await expect(
                    bag.getByRole("heading", { name: "Your bag" }),
                ).toBeVisible();
                await expect(bag).toContainText(LOOP_PRODUCT);
                // The ways come with the server's quote: Pick-up is on.
                const pickUp = bag.getByRole("radio", { name: /Pick-up/ });
                await expect(pickUp).toBeVisible({ timeout: 15_000 });
                await pickUp.click();
                await expect(pickUp).toHaveAttribute("aria-checked", "true");
                const go = bag.getByRole("button", { name: /^Continue · / });
                await expect(go).toBeEnabled({ timeout: 15_000 });
                // Offered beside paying online only when both are open;
                // alone, it is the way and no choice is drawn.
                const collect = bag.getByRole("radio", {
                    name: "Pay when you collect",
                });
                if ((await collect.count()) > 0) {
                    await collect.click();
                    await expect(collect).toHaveAttribute(
                        "aria-checked",
                        "true",
                    );
                }
                // Nothing here may open a provider's window.
                await site.route("https://checkout.razorpay.com/**", (r) =>
                    r.abort(),
                );
                await go.click();
                await signInOnSheet(site, email);

                // Signed in, the bag goes on to place it; pressed again only
                // if it came back asking.
                const placed = site.getByRole("dialog", {
                    name: "Order placed",
                });
                await expect(async () => {
                    const place = site.getByRole("button", {
                        name: /^Place order · /,
                    });
                    if (await place.isVisible()) await place.click();
                    await expect(placed).toBeVisible({ timeout: 3_000 });
                }).toPass({ timeout: 30_000 });
                await expect(placed).toContainText(
                    "You'll pay when you collect your order.",
                );
                const number =
                    /Order (\S+) ·/.exec(await placed.innerText())?.[1] ?? "";
                expect(number, "the sheet names the order").not.toBe("");
                const href =
                    (await placed
                        .getByRole("link", { name: "See your order" })
                        .getAttribute("href")) ?? "";
                const orderId = decodeURIComponent(
                    href.split("/shop/order/")[1] ?? "",
                );
                expect(orderId, "the sheet links the order").not.toBe("");

                // Paid: the counter takes the money and records it.
                await page.goto(`/commerce/orders/${orderId}`);
                const ref = `#${number}`;
                await expect(
                    page.getByRole("group", {
                        name: "Progress: New, step 1 of 4",
                    }),
                ).toBeVisible();
                const banner = page
                    .getByRole("status")
                    .filter({ hasText: "Pay on collection" });
                await expect(banner).toBeVisible();
                const record = page.getByRole("alertdialog", {
                    name: "Record this order as paid?",
                });
                await pressUntil(
                    banner.getByRole("button", { name: "Mark paid" }),
                    record,
                );
                // Cash is chosen already: the banner's way in.
                await expect(
                    record.getByRole("radio", { name: "Cash" }),
                ).toBeChecked();
                await record
                    .getByRole("button", { name: "Record as paid" })
                    .click();
                await expect(toast(page, `${ref} marked paid`)).toBeVisible();
                await expect(banner).toHaveCount(0);

                // Fulfilled: Preparing, Ready (held, then now), Collected.
                await page
                    .getByRole("button", {
                        name: "Start preparing",
                        exact: true,
                    })
                    .click();
                await expect(
                    page.getByRole("group", { name: /Preparing, step 2 of 4/ }),
                ).toBeVisible();
                await page
                    .getByRole("button", { name: "Mark ready", exact: true })
                    .click();
                await page.getByRole("button", { name: "Mark now" }).click();
                await expect(
                    page.getByRole("group", { name: /Ready, step 3 of 4/ }),
                ).toBeVisible();
                await page
                    .getByRole("button", {
                        name: "Mark collected",
                        exact: true,
                    })
                    .click();
                await expect(
                    page.getByText("Nothing left to do"),
                ).toBeVisible();

                // Refunded: money taken by hand goes back by hand.
                await page
                    .getByRole("button", { name: `More actions for ${ref}` })
                    .click();
                await page
                    .getByRole("menuitem", { name: "Record as refunded" })
                    .click();
                const refund = page.getByRole("alertdialog", {
                    name: "Record a refund?",
                });
                await expect(
                    refund.getByRole("radio", { name: /Full amount/ }),
                ).toBeChecked();
                await refund.getByRole("radio", { name: "Cash" }).click();
                await refund
                    .getByRole("button", { name: "Record as refunded" })
                    .click();
                await expect(
                    toast(page, `${ref} marked refunded`),
                ).toBeVisible();
                await expect(
                    page.getByRole("group", { name: "Progress: refunded" }),
                ).toBeVisible();
                await expect
                    .poll(
                        async () =>
                            (
                                await nw.get<{
                                    paymentStatus: string;
                                    refundStanding: string;
                                }>(`/orders/${orderId}`)
                            ).paymentStatus,
                    )
                    .toBe("REFUNDED");

                // The customer's history, as the team sees it: their
                // Customer Detail lists the order (the checkout linked
                // their account's contact to it).
                const read = await nw.get<{
                    customer: { contactId: string | null } | null;
                }>(`/orders/${orderId}`);
                const contactId = read.customer?.contactId ?? "";
                expect(contactId, "the order is linked to a contact").not.toBe(
                    "",
                );
                await page.goto(`/customers/${contactId}?tab=ord`);
                await expect(
                    page
                        .getByText(ref, { exact: true })
                        .filter({ visible: true }),
                ).toHaveCount(1);

                // And as the customer sees it, on the site's account area.
                if (ACCOUNT_AREA) {
                    await site.goto(`${SITE}/account/orders`);
                    const details = site.getByRole("link", {
                        name: `Details of order ${ref}`,
                    });
                    await expect(details).toBeVisible();
                    const track = site.getByRole("dialog", {
                        name: `Order ${ref}`,
                    });
                    await pressUntil(details, track);
                    await expect(track).toContainText("Refunded");
                }
            } finally {
                await shopper.close();
                await nw.patch(`/storefronts/${storeId}`, {
                    offerPayOnHandover: was.offerPayOnHandover,
                    fulfilmentTypes: was.fulfilmentTypes,
                });
            }
        },
    );
});
