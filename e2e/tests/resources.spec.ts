// @covers web:/changelog web:/privacy web:/api/waitlist api:waitlist
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { urls } from "../playwright.config";

/**
 * The Resources frame on saroh.in (plan U1, U4): what only a running site
 * shows.
 *
 * - Every Resources link (the nav's Resources menu, the footer's Resources
 *   and legal links, the sitemap's Resources pages, and every link inside
 *   a Resources page) answers 200: no 404, no link to a page that isn't
 *   published or built (R2, R8 as a class).
 * - No Resources page links to itself in its own content (R8).
 * - No Resources page scrolls sideways at 390.
 * - The changelog's email field joins the list (`source=changelog`) and
 *   confirms; the same address again is not an error.
 *
 * Which pages exist depends on the day (publish by date, KTD-2) and on
 * which routes have landed, so the spec reads them from the site itself:
 * the sitemap and the footer. Read-only but for its own stamped joins.
 */

const WEB = urls.WEB_URL;

const isDesk = (testInfo: TestInfo) => testInfo.project.name.startsWith("desk");

const RESOURCE_PREFIXES = [
    "/changelog",
    "/help",
    "/integrations",
    "/tools/",
    "/privacy",
];
const isResource = (path: string) =>
    RESOURCE_PREFIXES.some((r) => path === r || path.startsWith(r));

/** The Resources pages the sitemap lists today. */
async function resourcePages(request: APIRequestContext): Promise<string[]> {
    const xml = await (await request.get(`${WEB}/sitemap.xml`)).text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => new URL(m[1]).pathname)
        .filter(isResource);
}

/** A link resolves: 200, or a single 301/308 to a 200. */
async function resolves(request: APIRequestContext, url: string) {
    const first = await request.get(url, { maxRedirects: 0 });
    if (first.status() === 200) return "200";
    if (![301, 308].includes(first.status())) return String(first.status());
    const to = new URL(first.headers().location, url).toString();
    const second = await request.get(to, { maxRedirects: 0 });
    return second.status() === 200 ? "200" : `→ ${second.status()}`;
}

/** Same-site paths of the links matching `selector`. */
async function sitePaths(page: Page, selector: string): Promise<string[]> {
    const hrefs = await page
        .locator(selector)
        .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href));
    return [
        ...new Set(
            hrefs
                .map((h) => new URL(h))
                .filter((u) => u.origin === new URL(WEB).origin)
                .map((u) => u.pathname),
        ),
    ];
}

test("the changelog is listed, and every Resources page in the sitemap answers", async ({
    request,
}, testInfo) => {
    test.skip(!isDesk(testInfo), "HTTP only; once is enough");
    const pages = await resourcePages(request);
    // The changelog page is live before launch, in its pre-launch state.
    expect(pages).toContain("/changelog");
    for (const path of pages) {
        expect(await resolves(request, `${WEB}${path}`), path).toBe("200");
    }
});

test("every Resources link resolves, and no page links to itself", async ({
    page,
    request,
}, testInfo) => {
    test.skip(!isDesk(testInfo), "the links are the same on the phone");
    const pages = await resourcePages(request);
    const checked = new Set<string>();
    for (const path of pages) {
        await page.goto(`${WEB}${path}`);
        await expect(page.locator("main")).toBeVisible();

        const own = await sitePaths(page, "main a[href]");
        expect(
            own.filter((p) => p === path),
            `${path} links to itself`,
        ).toEqual([]);

        const footer = await sitePaths(page, "footer a[href]");
        const links = [...own, ...footer.filter(isResource)];
        for (const link of links) {
            if (checked.has(link)) continue;
            checked.add(link);
            expect(
                await resolves(request, `${WEB}${link}`),
                `${link} (from ${path})`,
            ).toBe("200");
        }
    }

    // The nav's Resources menu: every item answers.
    await page.goto(`${WEB}/`);
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("button", { name: "Resources" }).click();
    const items = await sitePaths(page, "#nav-menu-resources a[href]");
    expect(items).toContain("/changelog");
    for (const item of items) {
        expect(await resolves(request, `${WEB}${item}`), item).toBe("200");
    }
    await page.keyboard.press("Escape");
    await expect(nav.getByRole("menu")).toHaveCount(0);
});

test("no Resources page scrolls sideways at 390", async ({ page, request }) => {
    for (const path of await resourcePages(request)) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${WEB}${path}`);
        await expect(page.locator("main")).toBeVisible();
        // Against the width set: a phone viewport widens innerWidth to fit.
        await expect
            .poll(
                () =>
                    page.evaluate(() => ({
                        inner: window.innerWidth,
                        scroll: document.documentElement.scrollWidth,
                    })),
                { message: `${path} at 390` },
            )
            .toEqual({ inner: 390, scroll: 390 });
    }
});

test("the changelog's email joins the list, and the same address again is fine", async ({
    page,
}, testInfo) => {
    const address = `${stamp(testInfo).toLowerCase()}@example.com`;
    for (const attempt of ["first", "again"]) {
        await page.goto(`${WEB}/changelog`);
        await page.getByLabel("Email").fill(address);
        const joined = page.waitForResponse(
            (r) =>
                r.url().endsWith("/api/waitlist") &&
                r.request().method() === "POST",
        );
        await page
            .getByRole("button", { name: "Get one email when something ships" })
            .click();
        const res = await joined;
        expect(res.request().postDataJSON(), attempt).toEqual({
            email: address,
            src: "changelog",
        });
        expect(res.status(), attempt).toBe(200);
        await expect(
            page.locator("main").getByRole("status"),
            attempt,
        ).toHaveText("Done. We'll email you when something ships.");
        await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    }
});
