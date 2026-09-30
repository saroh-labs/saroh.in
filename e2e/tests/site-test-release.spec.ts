// @covers site:/ site:/shop site:/book site:/account site:/test-release-gate api:sites pkg:site-blocks
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * A test release on its own host (DEC-071, T5).
 *
 * The owner freezes Northwind's draft into a release through the API, with a
 * stamped name, and a visitor opens its link on
 * `test--northwind.<renderer>`. The link's token moves into a cookie for that
 * host and leaves the address; every page carries the Test release bar and
 * `noindex`; a browser without the link sees the gate; a link taken back
 * says so; and the live site never shows the bar.
 *
 * Each test makes its own release, so any two run side by side: making one
 * changes nothing the live site or another test reads. `SITE_TEST_RELEASES`
 * is on for Northwind in the seed.
 */

const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;
const TEST = `${renderer.protocol}//test--northwind.${renderer.host}`;

interface Made {
    release: { id: string; name: string };
    link: { id: string; url: string | null };
}

/** Northwind's one site (ADR-006). */
async function northwindSite(request: APIRequestContext): Promise<string> {
    const sites =
        await northwind(request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    return site?.id ?? "";
}

/** A release of Northwind's draft, made for this test, and its token. */
async function makeRelease(
    page: Page,
    name: string,
): Promise<{ siteId: string; made: Made; token: string }> {
    await useSession(page);
    const siteId = await northwindSite(page.request);
    const made = await northwind(page.request).post<Made>(
        `/sites/${siteId}/test-releases`,
        { name },
    );
    expect(made.release.name).toBe(name);
    // The link as the API wrote it names the host it runs on in production;
    // the token opens the same release on whichever host this run serves.
    const token = new URL(made.link.url ?? "").searchParams.get("release");
    expect(token, "the new release's link carries its token").toBeTruthy();
    return { siteId, made, token: token ?? "" };
}

const bar = (page: Page) => page.getByRole("region", { name: "Test release" });

test.describe("a test release on its own host (T5)", () => {
    test("opens behind its link, with the bar and noindex on every page", async ({
        page,
    }, testInfo) => {
        const name = `E2E release ${stamp(testInfo)}`;
        const { token } = await makeRelease(page, name);

        const opened = await page.goto(`${TEST}/?release=${token}`);
        // The token leaves the address once it is in the host's cookie.
        await expect.poll(() => page.url()).toBe(`${TEST}/`);
        expect(opened?.headers()["x-robots-tag"]).toContain("noindex");
        expect(opened?.headers()["referrer-policy"]).toBe("no-referrer");
        await expect(bar(page)).toContainText(name);
        await expect(bar(page)).toContainText(
            "Nothing here takes a real order, booking or payment.",
        );
        // No share card on a test host.
        await expect(page.locator('meta[property="og:title"]')).toHaveCount(0);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
            "content",
            /noindex/,
        );

        // "What's live" lists what the release doesn't freeze (R6).
        await bar(page).getByText("What’s live").click();
        await expect(bar(page)).toContainText("Products, prices and stock");
        await expect(bar(page)).toContainText("Opening hours");

        // The whole site: each page answers on the test host as it does on
        // the live one (the shop and the account area may be switched off
        // on this stack, and then both are "not found"), and every page the
        // live site draws in its chrome is drawn under the bar.
        for (const path of ["/shop", "/book", "/account"]) {
            const live = await page.goto(`${LIVE}${path}`);
            const drawn = await page.locator("header.sticky").count();
            const res = await page.goto(`${TEST}${path}`);
            expect(res?.status(), `${path} on the test host`).toBe(
                live?.status(),
            );
            expect(res?.headers()["x-robots-tag"]).toContain("noindex");
            await expect(page.locator("header.sticky")).toHaveCount(drawn);
            if (drawn > 0) await expect(bar(page)).toContainText(name);
        }
        // Northwind takes bookings, so /book at least is drawn.
        await page.goto(`${TEST}/book`);
        await expect(bar(page)).toContainText(name);
    });

    test("without the link, the host shows the gate; the live site has no bar", async ({
        browser,
        page,
    }, testInfo) => {
        await makeRelease(page, `E2E release ${stamp(testInfo)}`);

        const stranger = await browser.newContext({ ignoreHTTPSErrors });
        try {
            const visitor = await stranger.newPage();
            const res = await visitor.goto(`${TEST}/`);
            expect(res?.headers()["x-robots-tag"]).toContain("noindex");
            await expect(
                visitor.getByRole("heading", {
                    name: "Open this test release from its link.",
                }),
            ).toBeVisible();
            await expect(bar(visitor)).toHaveCount(0);

            const live = await visitor.goto(`${LIVE}/`);
            expect(live?.headers()["x-robots-tag"]).toBeUndefined();
            await expect(visitor.locator("header").first()).toBeVisible();
            await expect(bar(visitor)).toHaveCount(0);
        } finally {
            await stranger.close();
        }
    });

    test("a link taken back says so", async ({ page }, testInfo) => {
        const name = `E2E release ${stamp(testInfo)}`;
        const { siteId, made, token } = await makeRelease(page, name);

        await page.goto(`${TEST}/?release=${token}`);
        await expect(bar(page)).toContainText(name);

        await northwind(page.request).post(
            `/sites/${siteId}/test-releases/links/${made.link.id}/revoke`,
        );
        await page.reload();
        await expect(
            page.getByRole("heading", {
                name: "This test release link was taken back.",
            }),
        ).toBeVisible();
        await expect(bar(page)).toHaveCount(0);
    });

    test("the bar wraps at 320px, and the site's header sticks below it", async ({
        page,
    }, testInfo) => {
        const name = `E2E release ${stamp(testInfo)}`;
        const { token } = await makeRelease(page, name);
        await page.setViewportSize({ width: 320, height: 700 });
        await page.goto(`${TEST}/?release=${token}`);
        await expect(bar(page)).toContainText(name);

        // No sideways scroll: measured against the width set, since a phone
        // viewport widens innerWidth to fit content that overflows.
        await expect
            .poll(() =>
                page.evaluate(() => ({
                    scroll: document.documentElement.scrollWidth,
                    inner: window.innerWidth,
                })),
            )
            .toEqual({ scroll: 320, inner: 320 });

        // The header's sticky top is the bar's height, so it is never under it.
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const barBox = document
                        .querySelector("[data-test-release-bar]")
                        ?.getBoundingClientRect();
                    const header = document.querySelector("header.sticky");
                    if (!barBox || !header) return null;
                    return (
                        Math.round(parseFloat(getComputedStyle(header).top)) ===
                        Math.round(barBox.height)
                    );
                }),
            )
            .toBe(true);
    });
});
