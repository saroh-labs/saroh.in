// @covers site:/ site:/preview pkg:site-blocks api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";

/**
 * The renderer draws a look (DEC-172, plan U4, #1090), in a browser.
 *
 * Each look is set in Northwind's DRAFT through the shared helper
 * (`fixtures/site-look.ts`) and read through a preview link, so the live
 * site never wears it; both are put back. What it proves:
 *
 * - Quiet's buttons are pills and Folio's corners square, from the look's
 *   own tokens, and the page's root says which look it is.
 * - A look's page asks for at most two font families (its display and body
 *   faces), never one of Saroh's (H1, G7).
 * - The ₹ in Quiet's body text comes from a sans face, not its serif
 *   display face and not a missing glyph: Jost has none, so the look's body
 *   stack names a rupee-only face built from the device's sans faces (the
 *   ₹ decision, plan U4 notes).
 * - Every section is visible at rest under a look: nothing waits for a
 *   scroll to appear.
 * - Northwind's live site, with no look, is Classic: no mark, no rupee face.
 *
 * @serial: it changes Northwind's draft style.
 */

const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;

/** Saroh's own faces (packages/ui/fonts): never on a merchant's page. */
const SAROH_FACE = /Geist|Space ?Grotesk|JetBrains ?Mono/i;

/** A preview link to Northwind's draft, and how to take it back. */
async function previewLink(page: Page, siteId: string) {
    await useSession(page);
    const nw = northwind(page.request);
    const link = await nw.post<{ id: string; token: string }>(
        `/sites/${siteId}/preview-links`,
        { expiresInDays: 1 },
    );
    return {
        url: `${urls.RENDERER_URL}/preview/${link.token}`,
        revoke: () => nw.delete(`/sites/${siteId}/preview-links/${link.id}`),
    };
}

/** The families the page has loaded, less next/font's metric fallbacks. */
async function loadedFamilies(page: Page): Promise<string[]> {
    await page.evaluate(() => document.fonts.ready);
    const families = await page.evaluate(() =>
        [...document.fonts]
            .filter((f) => f.status === "loaded")
            .map((f) => f.family.replace(/^["']|["']$/g, "")),
    );
    return [
        ...new Set(
            families
                .filter((f) => !/Fallback/i.test(f) && f !== "Site Rupee")
                // next/font names a face `__Jost_d4c3f2`: one family, however
                // many weight and subset files it loads.
                .map((f) =>
                    f.replace(/^__/, "").replace(/_[0-9a-f]{4,}$/i, ""),
                ),
        ),
    ];
}

/** The root's value for a custom property. */
const rootToken = (page: Page, name: string) =>
    page.evaluate(
        (n) =>
            getComputedStyle(document.documentElement)
                .getPropertyValue(n)
                .trim(),
        name,
    );

test.describe("the renderer draws a look", { tag: "@serial" }, () => {
    test("Quiet: pills, two families at most, a sans ₹, and every section visible at rest", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const look = await setNorthwindLook(browser, "quiet", testInfo);
        const link = await previewLink(page, look.siteId);
        try {
            await page.goto(link.url);
            await expect(page.locator('[data-site-look="quiet"]')).toHaveCount(
                1,
            );
            expect(await rootToken(page, "--site-radius")).toBe("999px");
            expect(await rootToken(page, "--site-radius-photo")).toBe("16px");

            const families = await loadedFamilies(page);
            expect(families.length, families.join(", ")).toBeLessThanOrEqual(2);
            for (const family of families) {
                expect(family).not.toMatch(SAROH_FACE);
                expect(family).toMatch(/Cormorant|Jost/i);
            }

            // A price in the body face: its ₹ is drawn, and by a sans.
            const section = page.locator("[data-site-section]").first();
            await section.evaluate((el) => {
                const p = document.createElement("p");
                p.id = "rupee-probe";
                p.textContent = "₹";
                el.append(p);
            });
            const stack = await page
                .locator("#rupee-probe")
                .evaluate((el) => getComputedStyle(el).fontFamily);
            expect(stack).toMatch(/Jost[^,]*,\s*"?Site Rupee"?/);
            await page.evaluate(() => document.fonts.ready);
            const cdp = await page.context().newCDPSession(page);
            await cdp.send("DOM.enable");
            await cdp.send("CSS.enable");
            const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
            const { nodeId } = await cdp.send("DOM.querySelector", {
                nodeId: root.nodeId,
                selector: "#rupee-probe",
            });
            const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
                nodeId,
            });
            expect(fonts.length).toBeGreaterThan(0);
            for (const font of fonts) {
                expect(font.glyphCount).toBeGreaterThan(0);
                expect(font.familyName).not.toMatch(
                    /Cormorant|Garamond|Jost|serif|Times|Georgia/i,
                );
            }
            await cdp.detach();

            // Nothing hidden waiting for a scroll: the last section's
            // content is fully there before the visitor reaches it.
            const last = page.locator("[data-site-section] > *").last();
            expect(
                await last.evaluate((el) => getComputedStyle(el).opacity),
            ).toBe("1");
        } finally {
            await link.revoke();
            await look.restore();
        }
    });

    test("Folio: square corners", async ({ browser, page }, testInfo) => {
        test.setTimeout(120_000);
        const look = await setNorthwindLook(browser, "folio", testInfo);
        const link = await previewLink(page, look.siteId);
        try {
            await page.goto(link.url);
            await expect(page.locator('[data-site-look="folio"]')).toHaveCount(
                1,
            );
            expect(await rootToken(page, "--site-radius")).toBe("0px");
            expect(await rootToken(page, "--site-radius-photo")).toBe("0px");
            for (const family of await loadedFamilies(page)) {
                expect(family).toMatch(/Newsreader|Hanken/i);
            }
        } finally {
            await link.revoke();
            await look.restore();
        }
    });

    test("Northwind's live site, with no look, is Classic", async ({
        page,
    }) => {
        const res = await page.goto(LIVE);
        expect(res?.ok()).toBe(true);
        await expect(page.locator("[data-site-look]")).toHaveCount(0);
        const html = await page.content();
        expect(html).not.toContain("Site Rupee");
        expect(html).not.toContain("--site-radius-photo");
        expect(html).not.toContain("--site-motion-slow");
    });
});
