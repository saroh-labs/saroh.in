import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * The four scenes, as tests rather than as a review checklist (§18, #178).
 *
 * Every assertion here is a bug that actually shipped and was found by opening
 * a browser at the right size:
 *
 * - Home scrolled sideways by ~100px at 320, because a grid item defaults to
 *   `min-width: auto` and one `whitespace-nowrap` button set a 396px floor
 *   that propagated to every ancestor.
 * - The header's org switcher rendered ON TOP of the search button, because a
 *   `justify-end` group with no room lays its children over its neighbour
 *   rather than widening the page — so an overflow check reported clean.
 * - Fifteen controls were under 44px on a phone: mouse targets on a surface
 *   whose two touch scenes are a thumb in a hurry, possibly gloved.
 *
 * None of them were visible at desk width, and none could have been caught by
 * a test without a layout engine.
 */

const ROUTES = ["/", "/bookings", "/commerce", "/contacts"] as const;

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

/** Elements that overlap without one containing the other. */
async function overlappingControls(page: Page) {
    return page.evaluate(() => {
        const els = [
            ...document.querySelectorAll<HTMLElement>(
                "button, a[href], [role=button], input",
            ),
        ].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });

        const hits: string[] = [];
        for (let i = 0; i < els.length; i++) {
            for (let j = i + 1; j < els.length; j++) {
                const a = els[i];
                const b = els[j];
                // Containment is the stretched-link pattern, not a collision.
                if (a.contains(b) || b.contains(a)) continue;
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                if (
                    ra.left < rb.right - 1 &&
                    rb.left < ra.right - 1 &&
                    ra.top < rb.bottom - 1 &&
                    rb.top < ra.bottom - 1
                ) {
                    const name = (el: HTMLElement) => {
                        const text = el.textContent.trim();
                        const label =
                            el.getAttribute("aria-label") ??
                            (text.length > 0 ? text : el.tagName);
                        return label.trim().slice(0, 30);
                    };
                    hits.push(`${name(a)} ⟷ ${name(b)}`);
                }
            }
        }
        return hits;
    });
}

test.describe("no scene scrolls sideways", () => {
    for (const route of ROUTES) {
        test(`${route} fits its viewport`, async ({ page }) => {
            await signIn(page);
            await page.goto(route);

            const { scrollWidth, innerWidth } = await page.evaluate(() => ({
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
            }));

            // A single pixel of slack for sub-pixel rounding; 100px of
            // sideways scroll on an action list is how a merchant misses the
            // action.
            expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
        });
    }
});

test.describe("no two controls share the same pixels", () => {
    for (const route of ROUTES) {
        test(`${route} has no overlapping controls`, async ({ page }) => {
            await signIn(page);
            await page.goto(route);

            expect(await overlappingControls(page)).toEqual([]);
        });
    }
});

test.describe("touch targets", () => {
    test("every control is at least 44px tall on a touch pointer", async ({
        page,
    }, testInfo) => {
        test.skip(
            testInfo.project.name !== "phone",
            "Only the phone project has a coarse pointer; the desk keeps its density on purpose.",
        );

        await signIn(page);
        await page.goto("/bookings");

        // Guard the guard: if `pointer: coarse` does not match, every
        // `coarse:` utility is inert and this test would pass vacuously.
        expect(
            await page.evaluate(
                () => window.matchMedia("(pointer: coarse)").matches,
            ),
        ).toBe(true);

        const undersized = await page.evaluate(() =>
            [
                ...document.querySelectorAll<HTMLElement>(
                    "button, [role=button], input",
                ),
            ]
                .map((el) => {
                    const text = el.textContent.trim();
                    const label =
                        el.getAttribute("aria-label") ??
                        (text.length > 0 ? text : el.tagName);
                    return {
                        label: label.trim().slice(0, 30),
                        height: Math.round(el.getBoundingClientRect().height),
                    };
                })
                // Height 0 is a hidden control; nothing to size.
                .filter((c) => c.height > 2 && c.height < 44),
        );

        expect(undersized).toEqual([]);
    });
});

test.describe("dark is a surface, not an inversion", () => {
    test("the workspace paints its own background in dark", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/");
        await page.evaluate(() => {
            document.documentElement.classList.remove("light");
            document.documentElement.classList.add("dark");
        });

        const background = await page.evaluate(
            () => getComputedStyle(document.body).backgroundColor,
        );

        // A transparent body borrows whatever is behind it, which is how a
        // dark surface ends up light in one context and right in another.
        expect(background).not.toBe("rgba(0, 0, 0, 0)");
        expect(background).not.toBe("transparent");
    });
});
