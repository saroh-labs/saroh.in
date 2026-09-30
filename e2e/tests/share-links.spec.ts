// @covers app:/commerce/orders app:/sites/[siteId]/settings api:organizations api:orders api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Share buttons share the link that fits (DEC-069, plan L8).
 *
 * Every link the workspace hands out for the website comes from the API's
 * web-address read (`GET organizations/:id/web-address`): its origin is the
 * verified custom domain when there is one, and each of its links is set
 * only while that page is live. Orders' first run offers "Share your online
 * shop" while `/shop` serves, else "Share your website"; nothing is offered
 * for a page that isn't live.
 *
 * On Northwind, reading only (copying a link writes nothing). A business
 * set up in the test can't be used: its modules sit behind rollout flags
 * this stack turns on for the seeded businesses only. The first run is
 * reached through Northwind's Online location, which the seed gives no
 * orders; the test says so and skips if another run has put one there.
 * Whether the shop is live rests on `SITE_SHOP`, so the button is checked
 * against the read, as `pay-on-site.spec.ts` checks `payUrl`. The booking
 * page's first run needs a business with no bookings at all, and is left
 * to `bookings-view.test.tsx`.
 */

interface WebAddressRead {
    address: string;
    origin: string;
    links: { site: string | null; shop: string | null; book: string | null };
}

/** Northwind's Online location (the seed's `seedOnlineStorefront`). */
const ONLINE = "seed_store_online";

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

function webAddress(page: Page) {
    return northwind(page.request).get<WebAddressRead>("/web-address");
}

test.describe("share buttons share the link that fits (DEC-069)", () => {
    test("Orders' first run shares the online shop, else the website", async ({
        page,
        context,
    }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"], {
            origin: new URL(urls.APP_URL).origin,
        });
        await signIn(page);
        const orders = await northwind(page.request).get<{ rows: unknown[] }>(
            `/orders?v=2&storeId=${ONLINE}`,
        );
        test.skip(
            orders.rows.length > 0,
            "Northwind's Online location has orders, so its list has no first run.",
        );

        const read = await webAddress(page);
        expect(read.links.site).not.toBeNull();
        const want = read.links.shop
            ? {
                  label: "Share your online shop",
                  copied: "Online shop link copied",
                  url: read.links.shop,
              }
            : {
                  label: "Share your website",
                  copied: "Website link copied",
                  url: read.links.site ?? "",
              };
        // On the business's own address, never another host.
        expect(new URL(want.url).hostname.startsWith(`${read.address}.`)).toBe(
            true,
        );

        await page.goto(`/commerce/orders?storefront=${ONLINE}`);
        await expect(
            page.getByText("No orders yet").filter({ visible: true }),
        ).toHaveCount(1);
        const share = page
            .getByRole("button", { name: want.label })
            .filter({ visible: true });
        await expect(share).toHaveCount(1);
        await expect(share).toHaveCSS("cursor", "pointer");
        await share.click();
        await expect(page.getByText(want.copied)).toBeVisible();
        await expect
            .poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toBe(want.url);
    });

    test("the Website screen shows where customers reach the site", async ({
        page,
    }) => {
        await signIn(page);
        const read = await webAddress(page);
        const sites = await northwind(page.request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
        const site = sites.find((s) => s.subdomain === read.address);
        test.skip(!site, "Northwind's website isn't at its web address.");
        const host = new URL(read.origin).host;

        await page.goto(`/sites/${site?.id}/settings`);
        // The header names it, and View opens it, on the read's origin.
        await expect(
            page.getByText(host, { exact: true }).filter({ visible: true }),
        ).not.toHaveCount(0);
        if (read.links.site) {
            await expect(
                page
                    .getByRole("link", { name: "View", exact: true })
                    .filter({ visible: true }),
            ).toHaveAttribute("href", read.origin);
        }
    });
});
