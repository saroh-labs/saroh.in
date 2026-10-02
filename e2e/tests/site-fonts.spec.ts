// @covers accounts:/login app:/open app:/sites site:/ site:/book api:sites pkg:site-blocks
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A merchant's site is never set in Saroh's typography (H1).
 *
 * `saroh.app` used to load Geist and Bricolage Grotesque for every request,
 * and the booking flow set its headings in Saroh's `font-display`, so a dental
 * clinic's booking page wore Saroh's type. Gate G7 in `check-blocks.mjs` stops
 * the code coming back; this checks what a visitor's browser actually fetches
 * and draws.
 *
 * Read-only, on Pulse Fitness (kept camera-ready): it opens pages and books
 * nothing. The Style panel check opens Northwind's editor and saves nothing.
 */

const PULSE = (() => {
    const renderer = new URL(urls.RENDERER_URL);
    return `${renderer.protocol}//pulse-fitness.${renderer.host}`;
})();

/** Saroh's own faces, by file name, as `packages/ui/fonts` ships them. */
const SAROH_FACE = /Geist|Bricolage|SpaceGrotesk|Space_Grotesk|JetBrainsMono/i;
/** Where Saroh's font files live, and where Next serves a `localFont` from. */
const SAROH_FONT_PATH = /packages\/ui\/fonts|\/_next\/static\/media\//;

/** Every font request the page makes while `visit` runs. */
async function fontRequests(
    page: Page,
    visit: () => Promise<void>,
): Promise<string[]> {
    const fonts: string[] = [];
    page.on("request", (request) => {
        const url = request.url();
        if (
            request.resourceType() === "font" ||
            /\.(woff2?|ttf|otf)(\?|$)/.test(url)
        ) {
            fonts.push(url);
        }
    });
    await visit();
    await page.waitForLoadState("networkidle");
    return fonts;
}

async function fontFamily(locator: Locator): Promise<string> {
    return locator.evaluate((el) => getComputedStyle(el).fontFamily);
}

function expectNoSarohFont(fonts: string[]) {
    for (const url of fonts) {
        expect(url, `a Saroh font was requested: ${url}`).not.toMatch(
            SAROH_FACE,
        );
        expect(url, `a Saroh font was requested: ${url}`).not.toMatch(
            SAROH_FONT_PATH,
        );
    }
}

test.describe("merchant sites load no Saroh font", () => {
    test("the home page fetches no Saroh face, and its heading is the system stack", async ({
        page,
    }) => {
        const fonts = await fontRequests(page, async () => {
            await page.goto(PULSE);
        });
        expectNoSarohFont(fonts);

        const heading = page.locator("h1").first();
        await expect(heading).toBeVisible();
        const family = await fontFamily(heading);
        expect(family).not.toMatch(SAROH_FACE);
        expect(family).toContain("system-ui");

        // The body is the merchant's too, not the browser's default serif.
        const body = await fontFamily(page.locator("body"));
        expect(body).not.toMatch(SAROH_FACE);
        expect(body).toContain("system-ui");
    });

    test("the booking page fetches no Saroh face, and its step heading is the system stack", async ({
        page,
    }) => {
        const fonts = await fontRequests(page, async () => {
            await page.goto(`${PULSE}/book`);
        });
        expectNoSarohFont(fonts);

        const title = page.getByRole("heading", {
            name: "Book your next session",
        });
        await expect(title).toBeVisible();
        expect(await fontFamily(title)).not.toMatch(SAROH_FACE);

        const step = page.getByRole("heading", {
            name: "What would you like?",
        });
        await expect(step).toBeVisible();
        const family = await fontFamily(step);
        expect(family).not.toMatch(SAROH_FACE);
        expect(family).toContain("system-ui");
    });

    test("the Style panel says the site's text is a plain system font", async ({
        page,
    }, testInfo) => {
        test.skip(
            testInfo.project.name.startsWith("phone"),
            "The site editor is a desk screen; one run is enough.",
        );
        await useSession(page);

        await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
        await page.goto(`${urls.APP_URL}/sites`);
        // Website sends the owner straight to the business's one site
        // (ADR-006), so its id is in the address; the editor is its root.
        await page.waitForURL(/\/sites\/[^/]+\/pages/, { timeout: 30_000 });
        const id = /\/sites\/([^/]+)\//.exec(page.url())?.[1];
        if (id === undefined) {
            throw new Error(`no site id in the address: ${page.url()}`);
        }
        await page.goto(`${urls.APP_URL}/sites/${id}`);

        // The Style panel is the rail's Brand tab since G2.
        const brand = page.getByRole("tab", { name: "Brand" });
        await expect(brand).toBeVisible({ timeout: 30_000 });
        if ((await brand.getAttribute("aria-selected")) !== "true") {
            await brand.click();
        }
        await expect(
            page.getByText(
                "Your site's text now uses a plain system font. Font choices aren't available yet.",
            ),
        ).toBeVisible();
    });
});
