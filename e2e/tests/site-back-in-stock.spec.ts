// @covers site:/shop site:/shop/stop-waiting/[token] app:/commerce/products/[productId] api:stock pkg:site-blocks
import type {
    APIRequestContext,
    Browser,
    Page,
    TestInfo,
} from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { overrideNorthwindFlag, setNorthwindLook } from "../fixtures/site-look";
import { removeProducts, takeProduct } from "../fixtures/throwaway-products";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import { asNewVisitor, expectNoZoomOnFocus } from "./site-codes";

/**
 * "Tell me when it's back" (DEC-174, automatic notices U24, #1155), on
 * Northwind's own site, desk and phone (the `desk-serial` and
 * `phone-serial` projects), Classic and each look.
 *
 * A sold-out product's page offers an email field, "Tell me when it's
 * back" and the opt-in line; a typo is said under the field; an address is
 * taken ("We'll email you at …") with "Stop waiting" right after. The
 * workspace's product page says how many wait. The stop page
 * (`/shop/stop-waiting/<token>`) stops nothing on opening, only on the
 * press. With the business's Back in stock switch off, or the product in
 * stock, no form is drawn.
 *
 * Northwind has its own email provider connected (as `invoices.spec.ts`
 * relies on), which "Tell me" needs. What it owns: `SITE_SHOP` (and
 * `SITE_LOOKS` for a look) turned on for Northwind alone and put back, the
 * site's storefront when the seed left it unanswered (cleared again),
 * Northwind's Back in stock switch (put back as it was), and one product
 * per test, "E2E Back In Stock …", untracked and marked sold out by hand,
 * removed after. Every watch it makes is stopped before the product is
 * available again, so nobody is told it's back; the short sign-up email
 * with "Stop waiting" (DEC-178, #1170) goes to an `@example.com` address.
 *
 * @serial: it changes Northwind's switch, its site's storefront and, for
 * a look, its site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;

type Nw = ReturnType<typeof northwind>;

/** The storefront Northwind's site sells from, chosen if unanswered. */
async function sellsFrom(
    nw: Nw,
): Promise<{ siteId: string; storeId: string; restore: () => Promise<void> }> {
    const sites =
        await nw.get<{ id: string; subdomain: string | null }[]>("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    const siteId = site?.id ?? "";
    const read = await nw.get<{
        sellsFrom: {
            storefront: { id: string } | null;
            choices: { id: string }[];
        } | null;
    }>(`/sites/${siteId}`);
    expect(read.sellsFrom, "SITE_SHOP is on for Northwind").toBeTruthy();
    const chosen = read.sellsFrom?.storefront?.id;
    if (chosen) {
        return { siteId, storeId: chosen, restore: () => Promise.resolve() };
    }
    const first = read.sellsFrom?.choices.at(0)?.id;
    expect(first, "Northwind has a storefront to sell from").toBeTruthy();
    await nw.patch(`/sites/${siteId}/settings`, { storefrontId: first });
    return {
        siteId,
        storeId: first ?? "",
        restore: async () => {
            await nw.patch(`/sites/${siteId}/settings`, {
                storefrontId: null,
            });
        },
    };
}

/** Northwind's Back in stock switch, set, with the way to put it back. */
async function backInStockSwitch(nw: Nw): Promise<{
    set: (on: boolean) => Promise<void>;
    restore: () => Promise<void>;
}> {
    const read = await nw.get<{
        notices: { kind: string; on: boolean; offered: boolean }[];
    }>("/customer-notices/settings");
    const row = read.notices.find((n) => n.kind === "BACK_IN_STOCK");
    expect(
        row?.offered,
        "Back in stock is offered on Northwind (its own email is connected)",
    ).toBe(true);
    const was = row?.on ?? true;
    const set = async (on: boolean) => {
        await nw.patch("/customer-notices/settings", {
            kind: "BACK_IN_STOCK",
            on,
        });
    };
    return { set, restore: () => set(was) };
}

interface Setup {
    nw: Nw;
    siteId: string;
    storeId: string;
    productId: string;
    slug: string;
    name: string;
    teamPage: Page;
    soldOut: (on: boolean) => Promise<void>;
    switchOn: (on: boolean) => Promise<void>;
    teardown: () => Promise<void>;
}

/**
 * The team's side: the shop on, the switch on, and this test's product,
 * untracked and sold out by hand at the site's storefront.
 */
async function setUp(
    browser: Browser,
    testInfo: TestInfo,
    name: string,
): Promise<Setup> {
    const shop = await overrideNorthwindFlag(browser, "SITE_SHOP", testInfo);
    const team = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const teamPage = await team.newPage();
    await useSession(teamPage);
    const nw = northwind(teamPage.request);
    const sells = await sellsFrom(nw);
    const at = { organizationId: NORTHWIND_ORG, storeId: sells.storeId };
    const sw = await backInStockSwitch(nw);
    await sw.set(true);
    const productId = await takeProduct(teamPage.request, at, name, {
        price: "1200.00",
        status: "PUBLISHED",
    });
    const base = `/stores/${sells.storeId}/products/${productId}`;
    // Sold out by hand is for a product that counts no stock (#515).
    await nw.put(`${base}/stock-tracking`, { tracked: false });
    const soldOut = async (on: boolean) => {
        await nw.put(`${base}/sold-out`, { soldOut: on });
    };
    await soldOut(true);
    const product = await nw.get<{
        slug?: string;
        product?: { slug: string };
    } | null>(base);
    const slug = product?.slug ?? product?.product?.slug ?? "";
    expect(slug, `${name} has an address on the shop`).not.toBe("");
    return {
        nw,
        siteId: sells.siteId,
        storeId: sells.storeId,
        productId,
        slug,
        name,
        teamPage,
        soldOut,
        switchOn: sw.set,
        teardown: async () => {
            await sw.restore();
            await removeProducts(teamPage.request, at, name);
            await sells.restore();
            await team.close();
            await shop.restore();
        },
    };
}

/** "Tell me" straight to the API, for the stop page's token. */
async function watchByApi(
    request: APIRequestContext,
    s: Setup,
    email: string,
): Promise<string> {
    const res = await request.post(
        `${urls.API_URL}/public/sites/${s.siteId}/products/${s.productId}/watch`,
        {
            headers: { origin: SITE },
            data: { email, consent: true },
        },
    );
    expect(res.status(), await res.text()).toBe(201);
    const body = (await res.json()) as { stopToken: string | null };
    expect(
        body.stopToken,
        "a new watch hands back its stop token",
    ).toBeTruthy();
    return body.stopToken ?? "";
}

/**
 * The product's page. Sold out, it waits until the page has asked whether
 * "Tell me" is offered (a server action), so a form's absence means no.
 */
async function openProduct(
    page: Page,
    s: Setup,
    { asks = true }: { asks?: boolean } = {},
): Promise<void> {
    const asked = asks
        ? page.waitForResponse(
              (r) =>
                  r.request().method() === "POST" &&
                  r.url().includes(`/shop/${s.slug}`),
              { timeout: 15_000 },
          )
        : null;
    await page.goto(`${SITE}/shop/${s.slug}`);
    await expect(page.getByRole("heading", { name: s.name })).toBeVisible();
    if (asked) await asked;
}

/** Never sideways, at the width the project set. */
async function noSideways(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
}

/** Type an address and press "Tell me when it's back". */
async function tellMe(page: Page, email: string) {
    const field = page.getByLabel("Your email");
    await field.fill(email);
    await page.getByRole("button", { name: "Tell me when it's back" }).click();
}

const unique = (testInfo: TestInfo, what: string) =>
    `bis-${what}-${testInfo.project.name}-${Date.now()}@example.com`;

test.describe("Tell me when it's back", { tag: "@serial" }, () => {
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("classic: the form on a sold-out product, the count in the workspace, Stop waiting, and none when switched off or in stock", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(180_000);
        const s = await setUp(
            browser,
            testInfo,
            `E2E Back In Stock Shirt ${testInfo.project.name}`,
        );
        try {
            // The form, under "Sold out", with the opt-in.
            await openProduct(page, s);
            const form = page.locator('[data-back-in-stock="form"]');
            await expect(form).toBeVisible();
            await expect(form).toContainText(
                "will email you now and when it's back. Nothing else.",
            );
            const field = page.getByLabel("Your email");
            await expectNoZoomOnFocus(field);
            await noSideways(page);

            // A typo is said under the field.
            await tellMe(page, "asha@example");
            await expect(
                form.getByText("Enter an email like name@example.com."),
            ).toBeVisible();
            await expect(field).toHaveAttribute("aria-invalid", "true");

            // An address is taken.
            const email = unique(testInfo, "page");
            await tellMe(page, email);
            const waiting = page.locator('[data-back-in-stock="waiting"]');
            await expect(waiting).toContainText(`We'll email you at ${email}.`);
            await noSideways(page);

            // The workspace says how many wait: counts, never an address.
            const count = await s.nw.get<{ waiting: number }>(
                `/stock-watches?productId=${s.productId}`,
            );
            expect(count.waiting).toBeGreaterThanOrEqual(1);
            await s.teamPage.goto(`/open/${NORTHWIND_ORG}`);
            await s.teamPage.goto(
                `/commerce/products/${s.productId}?tab=stock&storefront=${s.storeId}`,
            );
            await expect(
                s.teamPage.locator("[data-waiting-line]"),
            ).toContainText(/\d+ (person|people) waiting for it/);
            await expect(s.teamPage.locator("body")).not.toContainText(email);

            // Stop waiting, right after.
            await waiting.getByRole("button", { name: "Stop waiting" }).click();
            await expect(
                page.getByText("You won't be emailed about it."),
            ).toBeVisible();

            // The stop page: opening it stops nothing; the press does.
            const token = await watchByApi(
                page.request,
                s,
                unique(testInfo, "link"),
            );
            const stopPage = await page.goto(
                `${SITE}/shop/stop-waiting/${encodeURIComponent(token)}`,
            );
            expect(stopPage?.headers()["x-robots-tag"]).toContain("noindex");
            await expect(
                page.getByRole("heading", {
                    name: `Stop waiting for ${s.name}?`,
                }),
            ).toBeVisible();
            await page.reload();
            await expect(
                page.getByRole("heading", {
                    name: `Stop waiting for ${s.name}?`,
                }),
            ).toBeVisible();
            await page.getByRole("button", { name: "Stop waiting" }).click();
            await expect(
                page.getByRole("heading", { name: "You've stopped waiting" }),
            ).toBeVisible();
            await noSideways(page);

            // Switched off: no form.
            await s.switchOn(false);
            await openProduct(page, s);
            await expect(page.locator("[data-back-in-stock]")).toHaveCount(0);
            await s.switchOn(true);

            // In stock: no form (every watch above is stopped first).
            await s.soldOut(false);
            // Nothing is asked of a product that can be bought.
            await openProduct(page, s, { asks: false });
            await expect(
                page.getByRole("button", { name: /Add to bag/ }).first(),
            ).toBeVisible();
            await expect(page.locator("[data-back-in-stock]")).toHaveCount(0);
        } finally {
            await s.teardown();
        }
    });

    for (const id of LOOKS) {
        test(`${id}: the form in the look's own shapes, and an address taken`, async ({
            page,
            browser,
        }, testInfo) => {
            test.setTimeout(180_000);
            const s = await setUp(
                browser,
                testInfo,
                `E2E Back In Stock ${id} ${testInfo.project.name}`,
            );
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();
                await openProduct(page, s);
                const form = page.locator('[data-back-in-stock="form"]');
                await expect(form).toBeVisible();
                // The look's field and its one filled button, never Saroh's.
                await expect(page.getByLabel("Your email")).toHaveClass(
                    /rounded-site-s/,
                );
                await expect(
                    page.getByRole("button", {
                        name: "Tell me when it's back",
                    }),
                ).toHaveClass(/bg-site-accent/);
                // Ask about it and the way back still follow it.
                await expect(
                    page.getByRole("link", { name: "Back to the shop" }),
                ).toBeVisible();
                await noSideways(page);

                await tellMe(page, unique(testInfo, id));
                const waiting = page.locator('[data-back-in-stock="waiting"]');
                await expect(waiting).toContainText("We'll email you at");
                await waiting
                    .getByRole("button", { name: "Stop waiting" })
                    .click();
                await expect(
                    page.getByText("You won't be emailed about it."),
                ).toBeVisible();
            } finally {
                await look.restore();
                await s.teardown();
            }
        });
    }
});
