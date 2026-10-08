// @covers site:/ site:/[slug] api:sites
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Verification codes on a live site (DEC-108, #894). The owner saves codes
 * through the API; the live site carries them at once, with no publish,
 * inside `<head>` for the crawlers that verify (Search Console, Bingbot,
 * Pinterest). Meta's and Pinterest's verify the whole registrable domain,
 * so on a Saroh address they are left off.
 *
 * Writes only Northwind's verification codes, which no other spec reads,
 * and takes them away again.
 */
const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;

const GOOGLE = `e2e${Date.now()}abcdefghijKLMNOP`;
const BING = "0123456789ABCDEF0123456789ABCDEF";
const META = "abcdefghij0123456789klmnopqrst";

const CRAWLERS = {
    google: "Google-Site-Verification/1.0",
    googlebot:
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    bing: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    pinterest:
        "Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)",
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

/** The `<head>` of a live page as a crawler fetches it. */
async function headAs(
    request: APIRequestContext,
    path: string,
    userAgent: string,
): Promise<string> {
    const res = await request.get(`${LIVE}${path}`, {
        headers: { "user-agent": userAgent },
    });
    expect(res.status(), path).toBe(200);
    const html = await res.text();
    const end = html.indexOf("</head>");
    expect(end, "the page has a head").toBeGreaterThan(0);
    return html.slice(0, end);
}

test("saved codes are in a live page's head at once, for the crawlers that verify", async ({
    page,
}) => {
    await useSession(page);
    const siteId = await northwindSite(page.request);
    const section = `/sites/${siteId}/search-and-tracking`;
    const nw = northwind(page.request);
    try {
        await nw.patch(section, {
            verifications: { google: GOOGLE, bing: BING, meta: META },
        });

        for (const ua of Object.values(CRAWLERS)) {
            const head = await headAs(page.request, "/", ua);
            expect(head, ua).toContain(
                `<meta name="google-site-verification" content="${GOOGLE}"`,
            );
            expect(head, ua).toContain(
                `<meta name="msvalidate.01" content="${BING}"`,
            );
            // Not on a Saroh address: it would claim Saroh's own domain.
            expect(head, ua).not.toContain("facebook-domain-verification");
        }
    } finally {
        await nw.patch(section, {
            verifications: { google: null, bing: null, meta: null },
        });
    }

    const after = await headAs(page.request, "/", CRAWLERS.google);
    expect(after).not.toContain("google-site-verification");
});

test("a secret is refused and never echoed", async ({ page }) => {
    await useSession(page);
    const siteId = await northwindSite(page.request);
    const secret = "phx_privatepersonalkey0123456789abcdef";
    const res = await page.request.patch(
        `${urls.API_URL}/organizations/${northwind(page.request).headers["x-organization-id"]}/sites/${siteId}/search-and-tracking`,
        {
            headers: northwind(page.request).headers,
            data: { trackers: { posthog: { id: secret, region: "eu" } } },
        },
    );
    expect(res.status()).toBe(400);
    expect(await res.text()).not.toContain(secret);
});
