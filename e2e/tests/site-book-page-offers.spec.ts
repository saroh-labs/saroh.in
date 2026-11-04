// @covers site:/book pkg:site-blocks
import { expect, test } from "@playwright/test";

import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * A published Book page offers what the booking flow offers. A merchant's
 * `/book` once came up empty while `/book?service=` opened: the page's
 * snapshot froze a list of ids, the flow read what is offered now. The page
 * now draws its list from the flow's own read, so every service the flow
 * offers is on the plain `/book`, or one "See all services" away from it, in
 * the first HTML (nothing waits on a read in the browser).
 *
 * Read only, on Kavi Dental: nothing is booked.
 */

function siteFor(subdomain: string): string {
    const renderer = new URL(urls.RENDERER_URL);
    return `${renderer.protocol}//${subdomain}.${renderer.host}`;
}
const KAVI = siteFor("kavi-dental");

test.use({ ignoreHTTPSErrors });

test("every service the flow offers is reachable from a plain /book", async ({
    page,
    request,
}) => {
    const site = await request.get(
        `${urls.API_URL}/public/sites/by-subdomain/kavi-dental`,
    );
    const { siteId } = (await site.json()) as { siteId: string };
    const read = await request.get(
        `${urls.API_URL}/public/sites/${siteId}/booking`,
    );
    const { services } = (await read.json()) as {
        services: { id: string; name: string }[];
    };
    expect(services.length).toBeGreaterThan(0);

    await page.goto(`${KAVI}/book`);
    const seeAll = page.getByRole("link", { name: "See all services" });
    const links = await page
        .locator('a[href*="/book?service="]')
        .evaluateAll((rows) => rows.map((a) => a.getAttribute("href") ?? ""));
    const listed = services.filter((s) =>
        links.some((href) => href.includes(`service=${s.id}`)),
    );
    if (listed.length < services.length) {
        await expect(seeAll).toBeVisible();
        await seeAll.click();
        await expect(page).toHaveURL(/step=what/);
        for (const service of services) {
            await expect(
                page.getByRole("radio", { name: new RegExp(service.name) }),
            ).toBeVisible();
        }
    }
});

test("the list is in the page itself, not left to a read in the browser", async ({
    request,
}) => {
    const res = await request.get(`${KAVI}/book`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("/book?service=");
});
