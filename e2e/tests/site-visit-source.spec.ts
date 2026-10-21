// @covers site:/shop site:/checkout site:/account api:analytics api:orders pkg:site-blocks
import type { Page, Request } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { overrideNorthwindFlag, setNorthwindLook } from "../fixtures/site-look";
import { takeProduct } from "../fixtures/throwaway-products";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import { asNewVisitor, readSiteCode } from "./site-codes";

/**
 * Where a visit came from, followed to a paid order (U15, #1099), on
 * Northwind's own site, desk and phone (the `desk-serial` and
 * `phone-serial` projects).
 *
 * A new visitor arrives from Instagram on a product page by the merchant's
 * own link (`?ref=<this run's label>`), with more in the address than may
 * be kept. The site's own beacon:
 *
 * - sends the visit once, with its group and label only: never the query,
 *   the email in it, or an id;
 * - sends "looked" once on the product page and "started" once at the
 *   checkout, and no page view for the checkout or the order's page;
 * - writes nothing to cookies or browser storage for it.
 *
 * The visitor orders, paying at pick-up; the team records it as paid, and
 * the order says where its visit came from. The daily rollup that counts it
 * runs hourly and is pinned by `visit-sources.db.spec.ts`; this spec proves
 * the real site, checkout and API carry the source to the paid order.
 *
 * Signed in, the account area sends nothing at all.
 *
 * What it owns: `SITE_SHOP` and `SITE_LOOKS` turned on for Northwind alone
 * (per-business overrides, put back after), Northwind's site style (Quiet,
 * put back and published again), the storefront's Pick-up and "Pay when you
 * collect" (put back), the site's storefront when the seed left it
 * unanswered (cleared again), and one product called "E2E Visit Source
 * Loaf", brought back the same each run. It leaves one paid pick-up order
 * per project on Northwind.
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const PRODUCT = "E2E Visit Source Loaf";

interface Storefront {
    id: string;
    kind: "SHOP" | "ONLINE";
    address: string | null;
    fulfilmentTypes: string[];
    offerPayOnHandover: boolean;
}

interface Beacon {
    type: string;
    properties: Record<string, unknown>;
}

/** Every body the site's beacon posts, as the visitor's browser sent it. */
function watchBeacon(page: Page): Beacon[] {
    const sent: Beacon[] = [];
    page.on("request", (req: Request) => {
        if (req.method() !== "POST") return;
        if (!/\/public\/sites\/[^/]+\/analytics\/events$/.test(req.url())) {
            return;
        }
        const body = req.postDataJSON() as Beacon | null;
        if (body) sent.push(body);
    });
    return sent;
}

const ofType = (sent: Beacon[], type: string) =>
    sent.filter((b) => b.type === type);

/** The storefront Northwind's site sells from, given one if unanswered. */
async function sellsFrom(
    nw: ReturnType<typeof northwind>,
): Promise<{ storeId: string; restore: () => Promise<void> }> {
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
    if (chosen) return { storeId: chosen, restore: () => Promise.resolve() };
    const first = read.sellsFrom?.choices.at(0)?.id;
    expect(first, "Northwind has a storefront to sell from").toBeTruthy();
    await nw.patch(`/sites/${siteId}/settings`, { storefrontId: first });
    return {
        storeId: first ?? "",
        restore: async () => {
            await nw.patch(`/sites/${siteId}/settings`, {
                storefrontId: null,
            });
        },
    };
}

const visible = (page: Page, selector: string) =>
    page.locator(selector).filter({ visible: true }).first();

test.describe("where a visit came from", { tag: "@serial" }, () => {
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("a visit from Instagram by the merchant's own link is followed to its paid order", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(180_000);
        // This run's own label: lower-case letters and hyphens, as allowed.
        // Its digits are spelled as letters: a label with seven digits in
        // all is refused as a possible phone number (U15 privacy review).
        const ref = `e2e-${testInfo.project.name}-${Date.now().toString(36)}`
            .toLowerCase()
            .replace(/\d/g, (d) => "abcdefghij"[Number(d)] ?? "x")
            .replace(/[^a-z-]/g, "-")
            .slice(0, 32)
            .replace(/-+$/, "");

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
        const sells = await sellsFrom(nw);
        const { storeId } = sells;
        const was = await nw.get<Storefront>(`/storefronts/${storeId}`);
        await nw.patch(`/storefronts/${storeId}`, {
            kind: "SHOP",
            address: was.address ?? "Plot 12, Peenya Industrial Area",
            offerPayOnHandover: true,
            fulfilmentTypes: was.fulfilmentTypes.includes("PICKUP")
                ? was.fulfilmentTypes
                : ["PICKUP", ...was.fulfilmentTypes],
        });
        const look = await setNorthwindLook(browser, "quiet", testInfo);
        try {
            const productId = await takeProduct(
                teamPage.request,
                { organizationId: NORTHWIND_ORG, storeId },
                PRODUCT,
                { price: "240.00", status: "PUBLISHED" },
            );
            const product = await nw.get<{
                slug?: string;
                product?: { slug: string };
            } | null>(`/stores/${storeId}/products/${productId}`);
            const slug = product?.slug ?? product?.product?.slug ?? "";
            expect(slug, `${PRODUCT} has an address on the shop`).not.toBe("");
            await look.publish();

            // From Instagram, by the merchant's own link, with more in the
            // address than may be kept.
            const sent = watchBeacon(page);
            await page.goto(
                `${SITE}/shop/${slug}?ref=${ref}&utm_source=instagram&email=someone%40example.com&fbclid=abc123`,
                { referer: "https://l.instagram.com/" },
            );
            await expect(
                page.getByRole("heading", { name: PRODUCT }),
            ).toBeVisible();

            await expect.poll(() => ofType(sent, "site.visit").length).toBe(1);
            await expect.poll(() => ofType(sent, "site.looked").length).toBe(1);
            expect(ofType(sent, "site.visit")[0]?.properties).toEqual({
                source: "instagram",
                ref,
            });
            expect(ofType(sent, "site.looked")[0]?.properties).toEqual({
                source: "instagram",
                ref,
            });
            // The page view keeps its path, never the query.
            await expect
                .poll(() =>
                    ofType(sent, "site.view").map((b) => b.properties.path),
                )
                .toEqual([`/shop/${slug}`]);
            const everything = JSON.stringify(sent);
            for (const kept of ["example.com", "fbclid", "abc123", "utm_"]) {
                expect(everything).not.toContain(kept);
            }

            // Nothing about the visit is stored in the browser.
            const stored = await page.evaluate(() => ({
                cookie: document.cookie,
                local: JSON.stringify(Object.entries(localStorage)),
                session: JSON.stringify(Object.entries(sessionStorage)),
            }));
            for (const where of Object.values(stored)) {
                expect(where).not.toContain(ref);
                expect(where).not.toContain("instagram");
            }

            // Into the bag, and on to the checkout by the site's own link.
            const add = page
                .getByRole("button", { name: /Add to bag/ })
                .filter({ visible: true })
                .first();
            const stepper = page
                .getByRole("button", {
                    name: `Take ${PRODUCT} out of your bag`,
                })
                .filter({ visible: true })
                .first();
            await pressUntil(add, stepper);
            await page
                .getByRole("button", { name: "Your bag, 1 item" })
                .filter({ visible: true })
                .first()
                .click();
            await page
                .getByRole("dialog")
                .getByRole("link", { name: /Check out/ })
                .filter({ visible: true })
                .first()
                .click();
            await expect(page).toHaveURL(/\/checkout$/);
            await expect
                .poll(() => ofType(sent, "site.started").length)
                .toBe(1);
            expect(ofType(sent, "site.started")[0]?.properties).toEqual({
                source: "instagram",
                ref,
            });

            // Pick-up, the email's code, pay at pick-up, place it.
            const ways = page.getByRole("radiogroup", {
                name: "1 · Pick-up or delivery",
            });
            await expect(ways).toHaveCount(1, { timeout: 15_000 });
            await ways.getByRole("radio", { name: /Pick-up/ }).click();
            const email = `visit-${testInfo.project.name}-${Date.now()}@example.com`;
            const emailField = page.getByLabel("Email");
            await emailField.fill(email);
            await emailField.press("Tab");
            const code = await readSiteCode(email);
            await page.getByLabel("Code", { exact: true }).fill(code);
            await expect(page.getByText(/^Ordering as/)).toBeVisible({
                timeout: 15_000,
            });
            const collect = page
                .getByRole("radiogroup", { name: "3 · How you'll pay" })
                .getByRole("radio", { name: /Pay at pick-up/ });
            await collect.click();
            await page.route("https://checkout.razorpay.com/**", (r) =>
                r.abort(),
            );
            await visible(page, "[data-place-order]").click();
            await expect(page).toHaveURL(/\/shop\/order\//, {
                timeout: 30_000,
            });
            const orderId =
                new URL(page.url()).pathname.split("/").at(-1) ?? "";
            expect(orderId).not.toBe("");

            // Each step once a visit; no page view for the checkout or the
            // order's page, whose paths name one customer's order.
            expect(ofType(sent, "site.visit")).toHaveLength(1);
            expect(ofType(sent, "site.started")).toHaveLength(1);
            for (const view of ofType(sent, "site.view")) {
                expect(String(view.properties.path)).not.toMatch(
                    /^\/(checkout|shop\/order)(\/|$)/,
                );
            }

            // The team records it as paid; the order says where it came from
            // to the owner, who reads Insights (`analytics:read`).
            await nw.patch(`/stores/${storeId}/orders/${orderId}`, {
                paymentStatus: "PAID",
                paidHow: "UPI",
            });
            const detail = await nw.get<{
                paymentStatus: string;
                cameFrom: { source: string; ref: string | null } | null;
            }>(`/stores/${storeId}/orders/${orderId}`);
            expect(detail.paymentStatus).toBe("PAID");
            expect(detail.cameFrom).toEqual({ source: "instagram", ref });

            // Signed in now, the account area sends nothing at all.
            const before = sent.length;
            await page.goto(`${SITE}/account`);
            await page.waitForLoadState("networkidle");
            expect(sent.slice(before)).toEqual([]);
        } finally {
            await look.restore();
            await nw.patch(`/storefronts/${storeId}`, {
                kind: was.kind,
                address: was.address,
                offerPayOnHandover: was.offerPayOnHandover,
                fulfilmentTypes: was.fulfilmentTypes,
            });
            await sells.restore();
            await team.close();
            await shop.restore();
        }
    });
});
