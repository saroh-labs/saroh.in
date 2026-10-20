// @covers site:/ site:/[slug] pkg:site-blocks api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";

/**
 * The content blocks under each look in a browser (DEC-172, plan U7,
 * #1096): the gallery and its lightbox, the timetable with prices, and
 * Visit us.
 *
 * Each look is set on Northwind's site through the shared helper
 * (`fixtures/site-look.ts`); a gallery, a timetable and Visit us are
 * added to its home's draft and published, and all of it is put back
 * after. Desk and phone run through the `desk-serial` and `phone-serial`
 * projects; the phone at 390×844.
 *
 * Northwind sells and takes one-to-one bookings, so it has no classes:
 * the week the timetable reads in the browser is answered here
 * (`page.route`), with a priced class, one nearly full, one full and one
 * with no price. The photos are answered here too, so every tile has its
 * size. The page a cache keeps is fetched as it is, with no scripts.
 *
 * - The lightbox opens by keyboard, is a named modal dialog, moves with
 *   the arrow keys, and Escape closes it with focus back on the photo.
 * - The timetable shows prices; every Book and Join the waitlist is at
 *   least 44×44 and never filled; the cached page carries no rows and no
 *   pack words.
 * - Nothing on the page sticks out sideways.
 * - No block here adds a filled button: the page keeps one in view.
 *
 * @serial: it changes and publishes Northwind's site style and home.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;

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

const fresh = (path = "/") =>
    `${SITE}${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;

const PHOTOS = [
    { name: "racks", caption: "The Peenya racks, morning", w: 1600, h: 1067 },
    { name: "cartons", caption: "Cartons ready to go", w: 1200, h: 1500 },
    { name: "dock", caption: "The loading dock", w: 1200, h: 1200 },
];

const photoUrl = (name: string) =>
    `https://images.example.com/e2e/u7-${name}.svg`;

/** A plain picture of the photo's own size, for every photo asked for. */
async function answerPhotos(page: Page) {
    await page.route("https://images.example.com/e2e/u7-*", (route) => {
        const name = /u7-([a-z]+)\.svg/.exec(route.request().url())?.[1];
        const photo = PHOTOS.find((p) => p.name === name) ?? PHOTOS[0];
        return route.fulfill({
            contentType: "image/svg+xml",
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.w}" height="${photo.h}"><rect width="100%" height="100%" fill="#8a8f88"/></svg>`,
        });
    });
}

/** `YYYY-MM-DD`, `days` from today, as a calendar date. */
function day(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** The week the timetable reads, answered in the browser. */
async function answerWeek(page: Page) {
    const days = Array.from({ length: 7 }, (_, i) => day(i));
    const session = (over: Record<string, unknown>) => ({
        serviceId: "svc_u7_strength",
        serviceName: "Strength basics",
        durationMinutes: 60,
        startAt: `${days[1]}T01:30:00.000Z`,
        date: days[1],
        time: "07:00",
        staffName: "Meera",
        placesLeft: 9,
        capacity: 12,
        priceCents: 60_000,
        currency: "INR",
        gst: null,
        ...over,
    });
    const week = {
        timezone: "Asia/Kolkata",
        days,
        sessions: [
            session({}),
            session({
                serviceId: "svc_u7_mobility",
                serviceName: "Mobility",
                startAt: `${days[1]}T12:30:00.000Z`,
                time: "18:00",
                placesLeft: 3,
                priceCents: 70_000,
            }),
            session({
                serviceId: "svc_u7_mobility",
                serviceName: "Mobility",
                startAt: `${days[2]}T12:30:00.000Z`,
                date: days[2],
                time: "18:00",
                placesLeft: 0,
                priceCents: 70_000,
            }),
            session({
                serviceId: "svc_u7_open",
                serviceName: "Open floor",
                startAt: `${days[2]}T14:00:00.000Z`,
                date: days[2],
                time: "19:30",
                placesLeft: 1,
                priceCents: null,
                currency: null,
            }),
        ],
    };
    await page.route(/\/public\/sites\/[^/]+\/timetable/, (route) =>
        route.fulfill({ json: week }),
    );
    return days;
}

/** Controls under `scope` smaller than 44×44, as "name WxH". */
function smallTargets(page: Page, scope: string): Promise<string[]> {
    return page.evaluate(
        (sel) =>
            Array.from(
                document.querySelectorAll<HTMLElement>(
                    `${sel} a[href], ${sel} button`,
                ),
            )
                .filter((el) => {
                    const style = getComputedStyle(el);
                    const box = el.getBoundingClientRect();
                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        box.width > 0 &&
                        (box.width < 43.5 || box.height < 43.5)
                    );
                })
                .map((el) => {
                    const box = el.getBoundingClientRect();
                    const name =
                        el.getAttribute("aria-label") ?? el.textContent.trim();
                    return `${name} ${Math.round(box.width)}x${Math.round(box.height)}`;
                }),
        scope,
    );
}

/** Buttons under `scope` filled in the site's accent. */
function filledIn(page: Page, scope: string): Promise<string[]> {
    return page.evaluate((sel) => {
        const probe = document.createElement("div");
        probe.style.background = "hsl(var(--site-accent))";
        document.body.append(probe);
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return Array.from(
            document.querySelectorAll<HTMLElement>(
                `${sel} a[href], ${sel} button`,
            ),
        )
            .filter((el) => {
                const box = el.getBoundingClientRect();
                return (
                    box.width > 0 &&
                    getComputedStyle(el).backgroundColor === accent
                );
            })
            .map((el) => el.textContent.trim() || el.tagName);
    }, scope);
}

/** Whether anything sticks out past the screen's right edge. */
function sideways(page: Page): Promise<number> {
    return page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
    );
}

test.describe("each look's content blocks", { tag: "@serial" }, () => {
    for (const id of LOOKS) {
        test(`${id}: the lightbox by keyboard, the timetable's prices, 44px and one filled button`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(240_000);
            const phone = testInfo.project.name.startsWith("phone");
            if (phone) await page.setViewportSize({ width: 390, height: 844 });
            const look = await setNorthwindLook(browser, id, testInfo);
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
            try {
                await nw.put(`${draftPath}/sections`, {
                    revision: before.revision,
                    sections: [
                        ...before.sections.map(asSent),
                        {
                            type: "gallery",
                            contractVersion: 2,
                            content: {
                                variant: "grid",
                                images: PHOTOS.map((p) => ({
                                    src: photoUrl(p.name),
                                    alt: p.caption,
                                    caption: p.caption,
                                    width: p.w,
                                    height: p.h,
                                })),
                            },
                        },
                        {
                            type: "timetable",
                            contractVersion: 1,
                            content: { title: "This week" },
                        },
                        {
                            type: "visitUs",
                            contractVersion: 1,
                            content: { title: "Visit us" },
                        },
                    ],
                });
                await look.publish();

                // The page a cache keeps: no rows, no pack words, and the
                // gallery's photos as buttons already.
                await expect
                    .poll(
                        async () =>
                            (
                                await (await page.request.get(fresh())).text()
                            ).includes(`data-site-look-gallery="${id}"`),
                        { timeout: 30_000 },
                    )
                    .toBe(true);
                const html = await (await page.request.get(fresh())).text();
                expect(html).not.toContain("data-timetable-row");
                expect(html).not.toMatch(/pack class|In your membership/);

                await answerPhotos(page);
                await answerWeek(page);
                await page.goto(fresh());
                const gallery = page.locator(
                    `[data-site-look-gallery="${id}"]`,
                );
                await expect(gallery).toBeVisible({ timeout: 30_000 });

                // The lightbox, by keyboard.
                const first = gallery.getByRole("button", {
                    name: /^Open photo 1 of 3/,
                });
                await first.focus();
                await page.keyboard.press("Enter");
                const dialog = page.getByRole("dialog", {
                    name: "Photo 1 of 3",
                });
                await expect(dialog).toBeVisible();
                await expect(dialog).toHaveAttribute("aria-modal", "true");
                await expect(
                    dialog.getByRole("button", { name: "Close" }),
                ).toBeFocused();
                expect(await smallTargets(page, "[role='dialog']")).toEqual([]);
                await page.keyboard.press("ArrowRight");
                await expect(
                    page.getByRole("dialog", { name: "Photo 2 of 3" }),
                ).toBeVisible();
                await page.keyboard.press("Tab");
                await page.keyboard.press("Tab");
                await page.keyboard.press("Tab");
                // Still inside after going round its three buttons.
                expect(
                    await page.evaluate(() =>
                        Boolean(
                            document.activeElement?.closest("[role='dialog']"),
                        ),
                    ),
                ).toBe(true);
                await page.keyboard.press("Escape");
                await expect(page.getByRole("dialog")).toHaveCount(0);
                await expect(
                    gallery.getByRole("button", { name: /^Open photo 2 of 3/ }),
                ).toBeFocused();

                // The timetable: prices, the full class's waitlist.
                const week = page.locator(`[data-site-look-timetable="${id}"]`);
                await week.scrollIntoViewIfNeeded();
                const shown = week.locator(
                    phone ? "[role='tabpanel']" : ".grid-cols-7",
                );
                if (phone) {
                    // Tomorrow's tab holds the priced classes.
                    await week.getByRole("tab").nth(1).click();
                }
                await expect(shown.getByText("₹600").first()).toBeVisible();
                await expect(shown.getByText("₹700").first()).toBeVisible();
                await expect(shown.getByText("3 places left")).toBeVisible();
                // A live fact (U8): counts only while fresh, and when.
                await expect(
                    week.locator("[data-timetable-checked]"),
                ).toContainText("Places checked");
                await expect(shown).not.toContainText("₹0");
                if (phone) await week.getByRole("tab").nth(2).click();
                await expect(
                    shown.getByRole("link", { name: /^Join the waitlist/ }),
                ).toBeVisible();
                await expect(shown.getByText("Last place")).toBeVisible();

                // 44px targets, no filled button, nothing sideways.
                for (const scope of [
                    `[data-site-look-gallery="${id}"]`,
                    `[data-site-look-timetable="${id}"]`,
                    `[data-site-look-visit="${id}"]`,
                ]) {
                    expect(await smallTargets(page, scope), scope).toEqual([]);
                    expect(await filledIn(page, scope), scope).toEqual([]);
                }
                expect(await sideways(page)).toBeLessThanOrEqual(0);

                // Visit us: Get directions stays a link, and no map.
                const visit = page.locator(`[data-site-look-visit="${id}"]`);
                if ((await visit.count()) > 0) {
                    await expect(
                        visit.getByRole("link", { name: "Get directions" }),
                    ).toHaveAttribute("href", /maps/);
                    await expect(visit.locator("iframe")).toHaveCount(0);
                }
            } finally {
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
