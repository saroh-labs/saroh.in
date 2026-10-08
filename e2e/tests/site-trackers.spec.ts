// @covers site:/ site:/[slug] site:/checkout/[orderId] site:/cookie-notice api:sites pkg:site-blocks
import type { APIRequestContext, Page, Request } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * A merchant's own trackers on their live site (DEC-108, #896, #898).
 *
 * The owner connects Google Analytics (asks first) and Plausible (no
 * cookies) through the API. On the live site, a new visitor:
 * - gets Plausible at once, and nothing from Google before accepting;
 * - sees the banner, accepts, and only then Google's gtag.js loads with
 *   the saved id;
 * - loads nothing at all on a checkout page, even having accepted.
 *
 * Every third-party host is stubbed at the network layer: no request ever
 * leaves for Google or Plausible. `@serial`: while trackers are connected,
 * every Northwind page shows the banner, which other specs mustn't meet.
 * They are removed again in `finally`.
 */
const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;
const GA4 = "G-E2ETEST01";
const PLAUSIBLE = "pa-e2etest_northwind";

const THIRD_PARTY =
    /googletagmanager\.com|connect\.facebook\.net|posthog\.com|clarity\.ms|plausible\.io|umami\.is/;

/** A requested URL's host and path, parsed, never matched as a substring. */
function parsed(u: string): URL | null {
    try {
        return new URL(u);
    } catch {
        return null;
    }
}

/** Google's tag host itself or a subdomain of it, never a look-alike. */
const isGoogleTagHost = (u: string) => {
    const host = parsed(u)?.hostname;
    return (
        host === "googletagmanager.com" ||
        host?.endsWith(".googletagmanager.com") === true
    );
};

async function northwindSite(request: APIRequestContext): Promise<string> {
    const sites =
        await northwind(request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    return site?.id ?? "";
}

/** Stub every tracker host, and keep a list of what the page asked for. */
async function watchTrackers(page: Page): Promise<string[]> {
    const asked: string[] = [];
    await page.route(THIRD_PARTY, async (route) => {
        asked.push(route.request().url());
        await route.fulfill({
            status: 200,
            contentType: "application/javascript",
            body: "",
        });
    });
    page.on("request", (r: Request) => {
        if (THIRD_PARTY.test(r.url()) && !asked.includes(r.url())) {
            asked.push(r.url());
        }
    });
    return asked;
}

test.describe("a merchant's own trackers (DEC-108)", { tag: "@serial" }, () => {
    test("ask first, load after Accept, never on checkout", async ({
        page,
        browser,
    }) => {
        test.setTimeout(90_000);
        await useSession(page);
        const siteId = await northwindSite(page.request);
        const section = `/sites/${siteId}/search-and-tracking`;
        const nw = northwind(page.request);
        await nw.patch(section, {
            trackers: { ga4: { id: GA4 }, plausible: { id: PLAUSIBLE } },
        });

        // A new visitor: no session, no stored answer.
        const visitor = await browser.newContext({ ignoreHTTPSErrors: true });
        const site = await visitor.newPage();
        try {
            const asked = await watchTrackers(site);
            await site.goto(`${LIVE}/`);

            const banner = site.getByRole("region", {
                name: /This site uses Google Analytics/,
            });
            await expect(banner).toBeVisible();
            await expect
                .poll(() =>
                    asked.some((u) => {
                        const url = parsed(u);
                        return (
                            url?.hostname === "plausible.io" &&
                            url.pathname === `/js/${PLAUSIBLE}.js`
                        );
                    }),
                )
                .toBe(true);
            expect(
                asked.filter(isGoogleTagHost),
                "nothing from Google before Accept",
            ).toEqual([]);
            // The notice it links to lists the tools.
            await expect(
                banner.getByRole("link", { name: "What they do" }),
            ).toHaveAttribute("href", "/cookie-notice");

            await banner.getByRole("button", { name: "Accept" }).click();
            await expect(banner).toBeHidden();
            await expect
                .poll(() =>
                    asked.some(
                        (u) =>
                            isGoogleTagHost(u) &&
                            parsed(u)?.pathname === "/gtag/js" &&
                            parsed(u)?.searchParams.get("id") === GA4,
                    ),
                )
                .toBe(true);

            // A checkout page loads nothing, even having accepted.
            const before = asked.length;
            await site.goto(`${LIVE}/checkout/e2e-no-such-order`);
            await site.waitForLoadState("networkidle");
            expect(asked.slice(before), "no tracker on checkout").toEqual([]);

            // The generated notice lists exactly what runs.
            await site.goto(`${LIVE}/cookie-notice`);
            await expect(site.getByText("Google Analytics")).toBeVisible();
            await expect(site.getByText("Plausible")).toBeVisible();
        } finally {
            await visitor.close();
            await nw.patch(section, {
                trackers: { ga4: null, plausible: null },
            });
        }
    });

    test("Reject loads nothing that asks, and the choice can be changed", async ({
        page,
        browser,
    }) => {
        test.setTimeout(90_000);
        await useSession(page);
        const siteId = await northwindSite(page.request);
        const section = `/sites/${siteId}/search-and-tracking`;
        const nw = northwind(page.request);
        await nw.patch(section, { trackers: { ga4: { id: GA4 } } });

        const visitor = await browser.newContext({ ignoreHTTPSErrors: true });
        const site = await visitor.newPage();
        try {
            const asked = await watchTrackers(site);
            await site.goto(`${LIVE}/`);
            const banner = site.getByRole("region", {
                name: /This site uses Google Analytics/,
            });
            await banner.getByRole("button", { name: "Reject" }).click();
            await expect(banner).toBeHidden();
            await site.reload();
            await expect(banner).toBeHidden();
            expect(asked).toEqual([]);

            // "Cookie choices" in the footer asks again.
            await site.getByRole("button", { name: "Cookie choices" }).click();
            await expect(banner).toBeVisible();
        } finally {
            await visitor.close();
            await nw.patch(section, { trackers: { ga4: null } });
        }
    });
});
