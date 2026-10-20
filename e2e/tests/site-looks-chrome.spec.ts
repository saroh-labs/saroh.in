// @covers site:/ site:/shop site:/account pkg:site-blocks api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { phone as aPhone } from "../fixtures/own-data";
import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

/**
 * Each look's chrome in a browser (DEC-172, plan U5, #1092): the header,
 * the phone menu, the one fixed bar, the footer and Live's dock.
 *
 * Each look is set on Northwind's site and published through the shared
 * helper (`fixtures/site-look.ts`), then put back. Desk and phone run
 * through the `desk-serial` and `phone-serial` projects. What it proves,
 * for Folio, Quiet and Live:
 *
 * - The first view holds exactly one filled button (in the site's accent).
 * - On a phone, at most one fixed bar shows, at the top of the page and at
 *   its foot.
 * - On a phone the menu is a dialog: it takes focus, Escape closes it and
 *   focus goes back to the menu button. "Visit us" is in it (and in the
 *   header's row on a desk). The seed gives Northwind no public phone,
 *   place or link, and "Visit us" lands on the footer's facts, so it is
 *   drawn only while there are some (`withVisitUs`): the test gives
 *   Northwind a public phone for its run and puts it back.
 * - Every control in the header, the footer and the bar or dock is at
 *   least 44×44 on a phone.
 * - Nothing is hidden off to the side: the page is no wider than the screen.
 * - The page as a cache would keep it (fetched with no scripts) holds no
 *   account links and no customer's name.
 * - The footer follows the session: signed in, it offers Your account and
 *   never Sign in (only on a stack with `SITE_ACCOUNT_AREA=on`).
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;
const areaOn = process.env.SITE_ACCOUNT_AREA === "on";

/** A fresh address for the published page, past any cache in between. */
const fresh = (path = "/") =>
    `${SITE}${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;

/** The page has loaded and the chrome has looked at it. */
async function settled(page: Page, look: string) {
    await expect(
        page.locator(`[data-site-look-header="${look}"]`),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
        "data-site-primary",
        /^(shown|gone)$/,
    );
    await expect(page.locator("html")).toHaveAttribute(
        "data-site-bar",
        /^(book|dock|none)$/,
    );
}

/** The visible buttons in the first view filled in the site's accent. */
function filledInView(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.background = "hsl(var(--site-accent))";
        document.body.append(probe);
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return Array.from(
            document.querySelectorAll<HTMLElement>("a[href], button"),
        )
            .filter((el) => {
                const box = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return (
                    box.width > 0 &&
                    box.height > 0 &&
                    box.bottom > 0 &&
                    box.top < window.innerHeight &&
                    style.visibility !== "hidden" &&
                    style.backgroundColor === accent
                );
            })
            .map((el) => el.textContent.trim() || el.tagName);
    });
}

/**
 * Fixed bars a visitor can see now: a band 40px or taller on screen. The
 * open menu is a dialog over the whole page, not a bar.
 */
function fixedBars(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("body *"))
            .filter((el) => {
                if (el.closest("nextjs-portal, [role='dialog']")) return false;
                const style = getComputedStyle(el);
                if (style.position !== "fixed") return false;
                if (style.display === "none" || style.visibility === "hidden")
                    return false;
                const box = el.getBoundingClientRect();
                return (
                    box.height >= 40 &&
                    box.width > 0 &&
                    box.bottom > 0 &&
                    box.top < window.innerHeight
                );
            })
            .map(
                (el) =>
                    el.getAttribute("data-site-chrome-bar") ??
                    el.getAttribute("data-site-consent") ??
                    el.tagName,
            ),
    );
}

/** Controls in the chrome smaller than 44×44, as "name WxH". */
function smallTargets(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(
            document.querySelectorAll<HTMLElement>(
                [
                    "[data-site-header] a[href]",
                    "[data-site-header] button",
                    "[data-site-footer] a[href]",
                    "[data-site-footer] button",
                    "[data-site-chrome-bar] a[href]",
                ].join(", "),
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
    );
}

/** Whether anything sticks out past the screen's right edge. */
function sideways(page: Page): Promise<number> {
    return page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
    );
}

test.describe("each look's chrome", { tag: "@serial" }, () => {
    for (const id of LOOKS) {
        test(`${id}: one filled button, one fixed bar, a real menu and 44px targets`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(180_000);
            const phone = testInfo.project.name.startsWith("phone");
            const look = await setNorthwindLook(browser, id, testInfo);
            // "Visit us" opens the footer's facts, so the footer needs one:
            // a public phone, read live (no publish), put back after.
            const { profile } = await look.owner.get<{
                profile: { phone?: string | null } | null;
            }>("/settings");
            const phoneBefore = profile?.phone ?? null;
            try {
                await look.owner.patch("", { profile: { phone: aPhone() } });
                await look.publish();
                await page.goto(fresh());
                await settled(page, id);

                // One filled button in the first view.
                expect(await filledInView(page)).toHaveLength(1);
                expect(await sideways(page)).toBeLessThanOrEqual(0);

                if (!phone) {
                    // Visit us in the header's row, landing on the footer.
                    const row = page
                        .getByRole("banner")
                        .getByRole("navigation", { name: "Site" });
                    await expect(
                        row.getByRole("link", { name: "Visit us" }),
                    ).toBeVisible();
                    return;
                }

                // A phone: one fixed bar at most, at the top and at the foot.
                expect((await fixedBars(page)).length).toBeLessThanOrEqual(1);
                expect(await smallTargets(page)).toEqual([]);

                // The menu is a real dialog.
                const menu = page
                    .getByRole("banner")
                    .getByRole("button", { name: "Menu" });
                await menu.click();
                const dialog = page.getByRole("dialog", {
                    name: /Northwind/i,
                });
                await expect(dialog).toBeVisible();
                await expect(dialog).toHaveAttribute("aria-modal", "true");
                await expect(
                    dialog.getByRole("button", { name: "Close menu" }),
                ).toBeFocused();
                await expect(
                    dialog.getByRole("link", { name: "Visit us" }),
                ).toBeVisible();
                // While it is open, no bar stands over it.
                expect(await fixedBars(page)).toEqual([]);
                await page.keyboard.press("Tab");
                await expect(dialog.locator(":focus")).toHaveCount(1);
                await page.keyboard.press("Escape");
                await expect(dialog).toBeHidden();
                await expect(menu).toBeFocused();

                // At the foot of the page: still one fixed bar at most, and
                // the footer's last line clears it.
                await page.evaluate(() =>
                    window.scrollTo(0, document.documentElement.scrollHeight),
                );
                await expect(page.locator("html")).toHaveAttribute(
                    "data-site-primary",
                    /^(shown|gone)$/,
                );
                expect((await fixedBars(page)).length).toBeLessThanOrEqual(1);
                expect((await filledInView(page)).length).toBeLessThanOrEqual(
                    1,
                );
                expect(await smallTargets(page)).toEqual([]);
                expect(await sideways(page)).toBeLessThanOrEqual(0);
            } finally {
                await look.owner.patch("", {
                    profile: { phone: phoneBefore ?? "" },
                });
                await look.restore();
            }
        });
    }

    test("the page a cache keeps holds no account links and no name", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const look = await setNorthwindLook(browser, "quiet", testInfo);
        try {
            await look.publish();
            // As fetched with no scripts: the server's HTML alone.
            const res = await page.request.get(fresh());
            expect(res.ok()).toBe(true);
            const html = await res.text();
            expect(html).toContain('data-site-look-header="quiet"');
            expect(html).not.toMatch(/href="\/account/);
            expect(html).not.toContain(">Your account<");
            expect(html).not.toContain("data-site-footer-account");
        } finally {
            await look.restore();
        }
    });

    test("the footer follows the session: never Sign in to someone signed in", async ({
        browser,
        page,
    }, testInfo) => {
        test.skip(!areaOn, "SITE_ACCOUNT_AREA is off on this stack");
        test.setTimeout(180_000);
        await asNewVisitor(page);
        const look = await setNorthwindLook(browser, "folio", testInfo);
        try {
            await look.publish();
            await page.goto(fresh());
            await settled(page, "folio");
            const footer = page.getByRole("contentinfo");
            const account = footer.getByRole("navigation", {
                name: "Your account",
            });
            await expect(
                account.getByRole("link", { name: "Sign in" }),
            ).toBeVisible();

            await page.goto(`${SITE}/account`);
            await page.getByRole("button", { name: "Sign in" }).first().click();
            await signInOnSheet(page, `u5-${Date.now()}@example.com`);
            await expect(page).toHaveURL(/\/account$/);

            await page.goto(fresh());
            await settled(page, "folio");
            await expect(
                account.getByRole("link", { name: "Your account" }),
            ).toBeVisible();
            await expect(
                account.getByRole("link", { name: "Sign in" }),
            ).toHaveCount(0);
        } finally {
            await look.restore();
        }
    });
});
