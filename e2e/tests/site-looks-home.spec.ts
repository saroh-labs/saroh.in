// @covers site:/ site:/[slug] pkg:site-blocks api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";

/**
 * The home and About blocks under each look in a browser (DEC-172, plan
 * U6, #1094): the hero, services, people, proof and the closing band.
 *
 * Each look is set on Northwind's site and published through the shared
 * helper (`fixtures/site-look.ts`), then put back. Desk and phone run
 * through the `desk-serial` and `phone-serial` projects; the phone checks
 * its first screen at 390×844, the size the fix rules name.
 *
 * Northwind's seeded home has a hero with no photo, a text block and a
 * closing band, so it is the no-photo case on a live site:
 *
 * - The first screen holds the type-led hero (its `h1`) and, when the site
 *   books or sells, the way in beside it, inside the viewport.
 * - No empty frame: the hero draws no `<img>` and no placeholder.
 * - A customer never reads "No photo yet", on the page or in the HTML a
 *   cache keeps (fetched with no scripts).
 * - The cached HTML carries no live time in the next booking's slot.
 * - One `h1` on the home and on About, at 1440 and at 390.
 * - The hero's own button is the page's main action, and nothing on a row
 *   is filled.
 *
 * @serial: it changes and publishes Northwind's site style.
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

/** A section as the draft's PUT takes it. */
const asSent = (s: DraftSection): DraftSection => ({
    type: s.type,
    contractVersion: s.contractVersion,
    content: s.content,
    ...(s.hidden === undefined ? {} : { hidden: s.hidden }),
    ...(s.key ? { key: s.key } : {}),
});

/** A hero photo that never loads: its box is what is measured. */
const PHOTO = {
    src: "https://images.example.com/e2e/northwind-look-hero.jpg",
    alt: "Cartons stacked in the Peenya warehouse",
    width: 1600,
    height: 1000,
};

/** A fresh address for the published page, past any cache in between. */
const fresh = (path = "/") =>
    `${SITE}${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;

/** The look's hero is drawn. */
async function heroDrawn(page: Page, look: string) {
    await expect(page.locator(`[data-site-look-hero="${look}"]`)).toBeVisible({
        timeout: 30_000,
    });
}

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

test.describe("each look's home and About", { tag: "@serial" }, () => {
    for (const id of LOOKS) {
        test(`${id}: the first screen, no photo, one h1`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(180_000);
            const phone = testInfo.project.name.startsWith("phone");
            if (phone) await page.setViewportSize({ width: 390, height: 844 });
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();
                await page.goto(fresh());
                await heroDrawn(page, id);
                const hero = page.locator(`[data-site-look-hero="${id}"]`);

                // One h1, the hero's headline, in the first screen.
                await expect(page.locator("h1")).toHaveCount(1);
                await expect(hero.locator("h1")).toBeVisible();
                expect(
                    await inFirstView(page, "[data-site-look-hero] h1"),
                ).toBe(true);

                // No photo on Northwind: led by type, no frame, no owner's note.
                await expect(hero.locator("img")).toHaveCount(0);
                await expect(
                    page.locator("[data-owner-photo-note]"),
                ).toHaveCount(0);
                await expect(page.getByText("No photo yet")).toHaveCount(0);

                // The way in beside the button, when the site books or sells.
                const door = hero.locator("[data-site-front-door]");
                if ((await door.count()) > 0) {
                    expect(
                        await inFirstView(
                            page,
                            "[data-site-look-hero] [data-site-front-door]",
                        ),
                    ).toBe(true);
                    const kind = await door.getAttribute(
                        "data-site-front-door",
                    );
                    // The booking page's slot holds "See times" until the
                    // live read answers, then the next free time's own link
                    // (U8, #1042): Folio's is the board's sentence (VA01).
                    await expect(
                        door.getByRole("link", {
                            name:
                                kind === "shop"
                                    ? "See the shop"
                                    : /^(See times|Book this (class|time)|Next free: .+|I’d like an? .+ at .+\.)$/,
                        }),
                    ).toBeVisible();
                }

                // The hero's own button is the page's main action, in view.
                const primary = hero.locator("[data-site-primary]");
                await expect(primary).toHaveCount(1);
                expect(
                    await inFirstView(
                        page,
                        "[data-site-look-hero] [data-site-primary]",
                    ),
                ).toBe(true);
                // Nothing on a service row is filled.
                await expect(
                    page.locator("[data-service-row] .bg-site-accent"),
                ).toHaveCount(0);

                // Nothing sticks out past the screen's right edge.
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth -
                            window.innerWidth,
                    ),
                ).toBeLessThanOrEqual(0);

                // About: still one h1, still no owner's words.
                await page.goto(fresh("/about"));
                await heroDrawn(page, id);
                await expect(page.locator("h1")).toHaveCount(1);
                await expect(page.getByText("No photo yet")).toHaveCount(0);
            } finally {
                await look.restore();
            }
        });
    }

    /*
     * The fix rule for a phone (D-04, VA-01): at 390×844 the photo, the next
     * booking's slot and one proof line all sit in the first screen. Northwind
     * has no hero photo and no testimonials, so this gives its home draft
     * both, publishes, measures and puts the draft back before `restore()`
     * publishes again. Northwind takes bookings, so its way in is the
     * booking page's slot.
     */
    for (const id of LOOKS) {
        test(`${id}: on a phone, photo, next booking and proof in the first screen`, async ({
            browser,
            page,
        }, testInfo) => {
            test.skip(
                !testInfo.project.name.startsWith("phone"),
                "the first-screen rule is a phone's",
            );
            test.setTimeout(180_000);
            await page.setViewportSize({ width: 390, height: 844 });
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
            const heroAt = before.sections.findIndex((s) => s.type === "hero");
            expect(heroAt, "Northwind's home opens on a hero").toBe(0);
            try {
                await nw.put(`${draftPath}/sections`, {
                    revision: before.revision,
                    sections: [
                        ...before.sections.map((s, i) =>
                            i === heroAt
                                ? asSent({
                                      ...s,
                                      content: { ...s.content, image: PHOTO },
                                  })
                                : asSent(s),
                        ),
                        {
                            type: "testimonials",
                            contractVersion: 1,
                            content: {
                                heading: "What customers say",
                                items: [
                                    {
                                        quote: "On site by three, as promised.",
                                        name: "Asha Rao",
                                    },
                                ],
                            },
                        },
                    ],
                });
                await look.publish();
                await page.goto(fresh());
                await heroDrawn(page, id);
                const hero = page.locator(`[data-site-look-hero="${id}"]`);
                await expect(hero.locator("img")).toHaveCount(1);
                await expect(hero.locator("[data-site-next-free]")).toHaveCount(
                    1,
                );
                await expect(hero.locator("[data-site-proof]")).toContainText(
                    "On site by three",
                );
                for (const part of [
                    "img",
                    "[data-site-next-free]",
                    "[data-site-proof]",
                    "[data-site-primary]",
                ]) {
                    expect(
                        await inFirstView(
                            page,
                            `[data-site-look-hero] ${part}`,
                        ),
                        `${part} in the first screen`,
                    ).toBe(true);
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

    test("the page a cache keeps says nothing to the owner and no live time", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const look = await setNorthwindLook(browser, "quiet", testInfo);
        try {
            await look.publish();
            // As fetched with no scripts: the server's HTML alone.
            await expect
                .poll(
                    async () =>
                        (
                            await (await page.request.get(fresh())).text()
                        ).includes('data-site-look-hero="quiet"'),
                    { timeout: 30_000 },
                )
                .toBe(true);
            const html = await (await page.request.get(fresh())).text();
            expect(html).not.toContain("No photo yet");
            expect(html).not.toContain("data-owner-photo-note");
            // The next booking's slot carries only the plain way in.
            const slot = /data-site-next-free=""[^>]*>([\s\S]*?)<\/div>/.exec(
                html,
            );
            if (slot)
                expect(slot[1].replace(/<[^>]+>/g, " ")).not.toMatch(/\d/);
            for (const path of ["/", "/about"]) {
                const page_ = await (
                    await page.request.get(fresh(path))
                ).text();
                expect(page_.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
            }
        } finally {
            await look.restore();
        }
    });
});
