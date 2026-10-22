// @covers site:/ api:sites pkg:site-blocks
import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";

/**
 * Live facts on cached merchant pages (DEC-172, plan U8, #1042), in a
 * browser, on each look, desk and phone (`desk-serial`, `phone-serial`).
 *
 * Northwind takes bookings, so its look hero has the next booking's slot
 * (`data-site-next-free`, U6). The slot's `today` read is routed here, so
 * each state is drawn on purpose, whatever Northwind's diary holds today:
 *
 * - The page as a cache keeps it (fetched with no scripts, and in a
 *   browser with JavaScript off) carries no live value: every live fact is
 *   "loading", with no time and no count, and "See times" is the way in.
 *   Two visitors get the same live regions.
 * - Fresh: "Next free", the time and a count of 5 or fewer.
 * - Couldn't load: the page still renders, "See times" is in the first
 *   screen, there is no "0 places", and nothing shifted (CLS ≤ 0.1).
 * - Slow: the slot keeps its height while it waits; CLS ≤ 0.1.
 * - Older than 75 s (`FRESH_FOR_MS`): the count hides, the time stays
 *   (the page's clock).
 * - A hidden page reads nothing.
 * - On a phone, Folio's and Quiet's Book bar says the next free time.
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;

/** Every live read of the site's `today`. */
const TODAY = "**/public/sites/*/today*";

/** A fresh address for the published page, past any cache in between. */
const fresh = (path = "/") =>
    `${SITE}${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;

/** The cache's own address for the home (no cache-buster). */
const cached = () => `${SITE}/`;

/** A today answer with a class at 6 pm today, 3 places left. */
function todayBody(placesLeft = 3) {
    const date = "2026-10-20";
    return {
        timezone: "Asia/Kolkata",
        date,
        appointments: true,
        classes: true,
        items: [],
        hours: null,
        closedDates: [],
        nextFree: {
            kind: "class",
            serviceId: "svc_e2e_live",
            serviceName: "Warehouse walkthrough",
            durationMinutes: 60,
            startAt: "2026-10-20T12:30:00.000Z",
            date,
            time: "18:00",
            staffName: null,
            placesLeft,
        },
    };
}

function answer(route: Route, body: unknown = todayBody()) {
    return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
    });
}

/** The text of every live fact in some HTML, tags stripped. */
function liveRegions(html: string): string[] {
    const out: string[] = [];
    const re = /<div[^>]*data-live-fact=""[^>]*>([\s\S]*?)<\/div>/g;
    for (let m = re.exec(html); m; m = re.exec(html)) {
        out.push(m[0]);
    }
    return out;
}

async function heroDrawn(page: Page, look: string) {
    await expect(page.locator(`[data-site-look-hero="${look}"]`)).toBeVisible({
        timeout: 30_000,
    });
}

/** Start counting layout shifts before anything paints. */
async function watchShifts(page: Page) {
    await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as {
                value: number;
                hadRecentInput: boolean;
            }[]) {
                if (!entry.hadRecentInput)
                    (window as unknown as { __cls: number }).__cls +=
                        entry.value;
            }
        }).observe({ type: "layout-shift", buffered: true });
    });
}

const cls = (page: Page) =>
    page.evaluate(() => (window as unknown as { __cls: number }).__cls);

/** Whether an element sits wholly inside the first viewport. */
function inFirstView(page: Page, selector: string): Promise<boolean> {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const box = el.getBoundingClientRect();
        return (
            box.width > 0 &&
            box.height > 0 &&
            box.top >= 0 &&
            box.bottom <= window.innerHeight
        );
    }, selector);
}

interface DraftSection {
    type: string;
    contractVersion: number;
    content: Record<string, unknown>;
    hidden?: boolean;
    key?: string;
}

const asSent = (s: DraftSection): DraftSection => ({
    type: s.type,
    contractVersion: s.contractVersion,
    content: s.content,
    ...(s.hidden === undefined ? {} : { hidden: s.hidden }),
    ...(s.key ? { key: s.key } : {}),
});

const slotSelector = "[data-site-look-hero] [data-site-next-free]";
const factSelector = `${slotSelector} [data-live-fact]`;

test.describe("live facts on cached pages", { tag: "@serial" }, () => {
    for (const id of LOOKS) {
        test(`${id}: the cached page carries no live value`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(180_000);
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();
                // The server's HTML alone, as a cache keeps it.
                await expect
                    .poll(
                        async () =>
                            (
                                await (await page.request.get(fresh())).text()
                            ).includes(`data-site-look-hero="${id}"`),
                        { timeout: 30_000 },
                    )
                    .toBe(true);
                const first = await (await page.request.get(cached())).text();
                const second = await (await page.request.get(cached())).text();
                const regions = liveRegions(first);
                expect(
                    regions.length,
                    "the hero's next booking is a live fact",
                ).toBeGreaterThan(0);
                for (const region of regions) {
                    expect(region).toContain('data-live-state="loading"');
                    expect(region.replace(/<[^>]+>/g, " ")).not.toMatch(/\d/);
                }
                // Two visitors, the same live regions.
                expect(liveRegions(second)).toEqual(regions);
                // No live words anywhere in it.
                for (const html of [first, second]) {
                    expect(html).not.toContain("data-live-value");
                    expect(html).not.toContain("data-live-count");
                    expect(html).not.toMatch(/places? left|Last place/);
                    expect(html).not.toMatch(/Checked \d/);
                    expect(html).not.toMatch(/Next free: /);
                }

                // A browser with JavaScript off sees "See times" and no time.
                const noScript = await browser.newContext({
                    javaScriptEnabled: false,
                    ignoreHTTPSErrors: true,
                });
                try {
                    const bare = await noScript.newPage();
                    await bare.goto(fresh());
                    const slot = bare.locator(slotSelector);
                    await expect(slot).toHaveCount(1);
                    await expect(
                        slot.getByRole("link", { name: "See times" }),
                    ).toBeVisible();
                    expect(await slot.innerText()).not.toMatch(/\d/);
                } finally {
                    await noScript.close();
                }
            } finally {
                await look.restore();
            }
        });

        test(`${id}: fresh, couldn't load, slow and older than 60 s`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(240_000);
            const phone = testInfo.project.name.startsWith("phone");
            if (phone) await page.setViewportSize({ width: 390, height: 844 });
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();

                // Couldn't load: the page renders, See times in view, no 0.
                await watchShifts(page);
                await page.route(TODAY, (route) => route.abort());
                await page.goto(fresh());
                await heroDrawn(page, id);
                await expect(page.locator(factSelector)).toHaveAttribute(
                    "data-live-state",
                    "failed",
                    { timeout: 15_000 },
                );
                await expect(
                    page
                        .locator(slotSelector)
                        .getByRole("link", { name: "See times" }),
                ).toBeVisible();
                expect(await inFirstView(page, slotSelector)).toBe(true);
                await expect(page.getByText(/\b0 places\b/)).toHaveCount(0);
                expect(await cls(page)).toBeLessThanOrEqual(0.1);
                await page.unroute(TODAY);

                // Slow, then fresh: nothing moves when it lands.
                let release: (() => void) | undefined;
                const held = new Promise<void>((resolve) => {
                    release = resolve;
                });
                await page.route(TODAY, async (route) => {
                    await held;
                    await answer(route);
                });
                await page.goto(fresh());
                await heroDrawn(page, id);
                const fact = page.locator(factSelector);
                await expect(fact).toHaveAttribute(
                    "data-live-state",
                    "loading",
                );
                const waiting = await fact.boundingBox();
                const heroWaiting = await page
                    .locator(`[data-site-look-hero="${id}"]`)
                    .boundingBox();
                release?.();
                await expect(fact).toHaveAttribute(
                    "data-live-state",
                    /fresh|refreshing/,
                    {
                        timeout: 15_000,
                    },
                );
                const landed = await fact.boundingBox();
                const heroLanded = await page
                    .locator(`[data-site-look-hero="${id}"]`)
                    .boundingBox();
                // To the nearest pixel: a phone's 2.625 scale draws 66 as
                // 66.00003 on one read and 66 on the next.
                const px = (n: number | undefined) => Math.round(n ?? -1);
                expect(px(landed?.height)).toBe(px(waiting?.height));
                expect(px(heroLanded?.height)).toBe(px(heroWaiting?.height));
                expect(await cls(page)).toBeLessThanOrEqual(0.1);

                // Fresh: the time and a small true count.
                const slot = page.locator(slotSelector);
                // Folio says it as the board's sentence (VA01): no "on today".
                await expect(slot).toContainText(
                    id === "live"
                        ? "6:00 pm"
                        : id === "folio"
                          ? "with anyone free today at 6:00 pm."
                          : "today, 6:00 pm",
                );
                await expect(slot).toContainText(
                    id === "live" ? "3 left" : "3 places left",
                );
                // VB01's strip: "Now · checked 5:20 pm".
                if (id === "live")
                    await expect(slot).toContainText(/Now · checked \d/);
                await page.unroute(TODAY);
            } finally {
                await look.restore();
            }
        });

        test(`${id}: a count older than 60 s hides, and a hidden page reads nothing`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(180_000);
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();
                await page.clock.install();
                let reads = 0;
                // The first read answers; later ones never do.
                await page.route(TODAY, async (route) => {
                    reads += 1;
                    if (reads === 1) await answer(route);
                });
                await page.goto(fresh());
                await heroDrawn(page, id);
                const slot = page.locator(slotSelector);
                await expect(slot.locator("[data-live-count]")).toBeVisible({
                    timeout: 15_000,
                });

                // Hidden: no reads, however long. The answer turns stale
                // by the clock alone (older than FRESH_FOR_MS, 75 s), so
                // the count hides and the time stays. (In view, the read
                // at 60 s times out at 68 s, READ_TIMEOUT_MS, and the fact
                // fails back to See times at 75 s: stale is the hidden
                // tab's, as the hook's own test has it.)
                await page.evaluate(() => {
                    Object.defineProperty(document, "visibilityState", {
                        configurable: true,
                        get: () => "hidden",
                    });
                    document.dispatchEvent(new Event("visibilitychange"));
                });
                const before = reads;
                await page.clock.runFor(75_500);
                await expect(slot.locator("[data-live-fact]")).toHaveAttribute(
                    "data-live-state",
                    "stale",
                );
                await expect(slot.locator("[data-live-count]")).toHaveCount(0);
                await expect(slot).toContainText("6:00 pm");
                await page.clock.runFor(5 * 60_000);
                expect(reads).toBe(before);
            } finally {
                await page.unroute(TODAY);
                await look.restore();
            }
        });
    }

    for (const id of ["folio", "quiet"] as const) {
        test(`${id}: on a phone, the Book bar says the next free time`, async ({
            browser,
            page,
        }, testInfo) => {
            test.skip(
                !testInfo.project.name.startsWith("phone"),
                "the Book bar is a phone's",
            );
            test.setTimeout(180_000);
            await page.setViewportSize({ width: 390, height: 844 });
            const look = await setNorthwindLook(browser, id, testInfo);
            // The bar shows only while no button of the page's own is on
            // screen. Northwind's home is short enough that its closing
            // band's button is in view as soon as the hero's leaves, so its
            // text is drawn three times more under the hero, put back after.
            const nw = look.owner;
            const site = await nw.get<{
                pages: { id: string; path: string }[];
            }>(`/sites/${look.siteId}`);
            const home = site.pages.find((p) => p.path === "/");
            expect(home, "Northwind's site has a home page").toBeTruthy();
            const draftPath = `/sites/${look.siteId}/pages/${home?.id ?? ""}/draft`;
            const before = await nw.get<{
                revision: number;
                sections: DraftSection[];
            }>(draftPath);
            const text = before.sections.filter((x) => x.type === "richText");
            expect(text.length, "Northwind's home has text").toBeGreaterThan(0);
            const sent = before.sections.map(asSent);
            try {
                await nw.put(`${draftPath}/sections`, {
                    revision: before.revision,
                    sections: [
                        ...sent.slice(0, 1),
                        ...[1, 2, 3].flatMap(() =>
                            text.map(({ key: _key, ...t }) => asSent(t)),
                        ),
                        ...sent.slice(1),
                    ],
                });
                await look.publish();
                await page.route(TODAY, (route) => answer(route));
                await page.goto(fresh());
                await heroDrawn(page, id);
                // Scroll just past the hero, so its own button is off
                // screen: the bar comes. (Not to the foot: the closing
                // band's own button there sends the bar away again.)
                await page.evaluate(() => {
                    const hero = document.querySelector(
                        "[data-site-look-hero]",
                    );
                    const bottom = hero?.getBoundingClientRect().bottom ?? 0;
                    window.scrollTo(0, window.scrollY + bottom);
                });
                await expect(page.locator("html")).toHaveAttribute(
                    "data-site-primary",
                    "gone",
                );
                const bar = page.locator('[data-site-chrome-bar="book"]');
                await expect(bar).toBeVisible({ timeout: 10_000 });
                await expect(bar).toContainText("Next free: today, 6:00 pm");
                // One fixed bar: nothing else holds the foot.
                await expect(
                    page.locator("[data-site-chrome-bar]"),
                ).toHaveCount(1);
            } finally {
                await page.unroute(TODAY);
                const now = await nw.get<{ revision: number }>(draftPath);
                await nw.put(`${draftPath}/sections`, {
                    revision: now.revision,
                    sections: before.sections.map(asSent),
                });
                await look.restore();
            }
        });
    }
});
