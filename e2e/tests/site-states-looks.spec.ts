// @covers site:/ site:/[...missing] site:/book pkg:site-blocks api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";

/**
 * Every state page wears the look (DEC-172, plan U15, #1108).
 *
 * For Folio, Quiet and Live in turn, set on Northwind's site and published
 * through the shared helper (`fixtures/site-look.ts`), then put back:
 *
 * - A missing address answers 404, drawn in the look: its own heading, one
 *   filled button (home) and the large 404 hidden from screen readers.
 * - With a tracker that asks first (Google Analytics, a test id; every
 *   Google host is stubbed, nothing leaves), a new visitor sees the look's
 *   banner: Reject and Accept the same size, side by side. On a phone it
 *   never covers the hero's main button, which can still be pressed while
 *   the banner shows, and it is the one fixed bar at the foot.
 * - Reject closes it, and the page's lift goes with it.
 *
 * Desk and phone run through the `desk-serial` and `phone-serial`
 * projects. `@serial`: it changes and publishes Northwind's site style and
 * connects a tracker (every Northwind page then shows a banner, which
 * other specs mustn't meet); both are put back in `finally`.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;
const GA4 = "G-E2ESTATES1";

/** A fresh address for the published page, past any cache in between. */
const fresh = (path = "/") =>
    `${SITE}${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;

/** Google's tag host stubbed: nothing leaves for Google. */
async function stubGoogle(page: Page) {
    await page.route(/googletagmanager\.com|google-analytics\.com/, (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/javascript",
            body: "",
        }),
    );
}

/** Whether two on-screen boxes share any area. */
function overlapping(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
): boolean {
    return (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
    );
}

test.describe("each look's state pages", { tag: "@serial" }, () => {
    for (const id of LOOKS) {
        test(`${id}: a missing page is a 404 in the look, and the banner leaves the hero's button free`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(180_000);
            const phone = testInfo.project.name.startsWith("phone");
            const look = await setNorthwindLook(browser, id, testInfo);
            const section = `/sites/${look.siteId}/search-and-tracking`;
            let connected = false;
            const visitor = await browser.newContext({
                ignoreHTTPSErrors: true,
                viewport: phone
                    ? { width: 390, height: 844 }
                    : { width: 1440, height: 900 },
            });
            try {
                await look.publish();

                // A missing address: a real 404, in the look.
                const missing = await page.goto(
                    fresh(`/no-such-page-${Date.now()}`),
                );
                expect(missing?.status()).toBe(404);
                const main = page.locator(`[data-site-state-look="${id}"]`);
                await expect(main).toBeVisible();
                await expect(
                    page.getByRole("heading", {
                        level: 1,
                        name: "This page isn’t here",
                    }),
                ).toBeVisible();
                const home = main.getByRole("link", {
                    name: "Go to the home page",
                });
                await expect(home).toHaveAttribute("href", "/");
                await expect(main.getByText("404")).toHaveAttribute(
                    "aria-hidden",
                    "true",
                );
                // Inside the site's own frame: its look's mark is on the page.
                await expect(
                    page.locator(`[data-site-look="${id}"]`).first(),
                ).toBeAttached();

                // A tracker that asks first, so the banner shows.
                await look.owner.patch(section, {
                    trackers: { ga4: { id: GA4 } },
                });
                connected = true;

                const site = await visitor.newPage();
                await stubGoogle(site);
                await site.goto(fresh());
                const banner = site.getByRole("region", {
                    name: "Cookies on this site",
                });
                await expect(banner).toBeVisible();
                await expect(banner).toHaveAttribute(
                    "data-site-consent-dock",
                    /^(bottom|top)$/,
                );

                // Reject and Accept: the same size, side by side.
                const reject = banner.getByRole("button", { name: "Reject" });
                const accept = banner.getByRole("button", { name: "Accept" });
                const r = await reject.boundingBox();
                const a = await accept.boundingBox();
                expect(r && a).toBeTruthy();
                if (r && a) {
                    expect(Math.abs(r.width - a.width)).toBeLessThanOrEqual(1);
                    expect(Math.abs(r.height - a.height)).toBeLessThanOrEqual(
                        1,
                    );
                    expect(Math.abs(r.y - a.y)).toBeLessThanOrEqual(1);
                }
                expect(
                    await reject.evaluate(
                        (el) => getComputedStyle(el).fontWeight,
                    ),
                ).toBe(
                    await accept.evaluate(
                        (el) => getComputedStyle(el).fontWeight,
                    ),
                );

                // The hero's main button stays free, and can be pressed.
                const heroAction = site
                    .locator(
                        "[data-site-look-hero] a[href], [data-site-look-hero] button",
                    )
                    .first();
                if ((await heroAction.count()) > 0) {
                    await heroAction.scrollIntoViewIfNeeded();
                    // Let the banner look again after the scroll.
                    await site.waitForTimeout(250);
                    const b = await banner.boundingBox();
                    const h = await heroAction.boundingBox();
                    if (b && h) expect(overlapping(b, h)).toBe(false);
                    await heroAction.click({ trial: true });
                }

                if (phone) {
                    // The banner is the one fixed bar: the Book bar and
                    // Live's dock wait for it.
                    const bars = await site.evaluate(
                        () =>
                            Array.from(
                                document.querySelectorAll<HTMLElement>(
                                    "body *",
                                ),
                            ).filter((el) => {
                                const s = getComputedStyle(el);
                                if (s.position !== "fixed") return false;
                                if (s.display === "none") return false;
                                if (s.visibility === "hidden") return false;
                                const box = el.getBoundingClientRect();
                                return (
                                    box.height >= 40 &&
                                    box.bottom > 0 &&
                                    box.top < window.innerHeight
                                );
                            }).length,
                    );
                    expect(bars).toBeLessThanOrEqual(1);
                }

                // Reject is as easy as Accept: one press, and it's gone.
                await reject.click();
                await expect(banner).toBeHidden();
                expect(
                    await site.evaluate(() =>
                        document.documentElement.style.getPropertyValue(
                            "--site-consent-offset",
                        ),
                    ),
                ).toBe("");
            } finally {
                await visitor.close();
                if (connected) {
                    await look.owner.patch(section, {
                        trackers: { ga4: null },
                    });
                }
                await look.restore();
            }
        });
    }
});
