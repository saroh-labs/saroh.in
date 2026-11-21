// @covers web:/website-library web:/library-preview/[type]
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { urls } from "../playwright.config";

/**
 * The website library on saroh.in (DEC-228, plan 2026-11-18-001 U11): what
 * only a running site shows.
 *
 * - every block's name is in the page's HTML before any script runs, and
 *   Subscribe is tagged Coming with no form;
 * - a toolbar choice changes the address and the previews, and a reload
 *   keeps it;
 * - a preview draws its block in the frame, and its own page carries no
 *   Saroh tokens, fonts or tags and says noindex;
 * - nothing hides sideways.
 *
 * Read-only. The page is behind `NEXT_PUBLIC_WEBSITE_LIBRARY` (on in CI and
 * `pnpm prepush --e2e`): the spec skips when it isn't there.
 */

const WEB = urls.WEB_URL;

test.beforeEach(async ({ request }) => {
    const res = await request.get(`${WEB}/website-library`);
    test.skip(res.status() !== 200, "the website library is switched off");
});

test("every block is in the page's HTML, and Subscribe is Coming", async ({
    request,
}) => {
    const html = await (await request.get(`${WEB}/website-library`)).text();
    for (const name of [
        "Top of the page",
        "Services",
        "Timetable",
        "Visit us",
        "Plans",
        "Highlights",
        "Subscribe",
    ]) {
        expect(html).toContain(`>${name}</h4>`);
    }
    expect(html).toContain("Coming");
});

test("a toolbar choice moves the previews and the address, and a reload keeps it", async ({
    page,
}) => {
    await page.goto(`${WEB}/website-library`);
    const hero = page.getByTitle(/^Top of the page, /);
    await expect(hero).toHaveAttribute("src", /variant=centered/);
    await page
        .getByRole("radiogroup", { name: "Look" })
        .getByRole("radio", { name: "Live" })
        .click();
    await expect(hero).toHaveAttribute("src", /look=live/);
    await expect(page).toHaveURL(/look=live/);
    await page.reload();
    await expect(page.getByTitle(/^Top of the page, /)).toHaveAttribute(
        "src",
        /look=live/,
    );
    // The preview drew: its frame is measured, with no failure note.
    await page.getByTitle(/^Top of the page, /).scrollIntoViewIfNeeded();
    const frame = page.frameLocator('iframe[title^="Top of the page, "]');
    await expect(
        frame.locator("[data-library-preview] *").first(),
    ).toBeVisible();
    await expect(page.getByText("Preview could not load")).toHaveCount(0);
});

test("a preview is a merchant's bare page, kept out of search", async ({
    request,
}) => {
    const res = await request.get(
        `${WEB}/library-preview/servicesList?look=folio&palette=tide`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
    const html = await res.text();
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain("data-library-preview");
    expect(html).not.toMatch(/googletagmanager|connect\.facebook\.net/);
    expect(html).not.toContain("Skip to content");
});

for (const width of [320, 390, 1440]) {
    test(`nothing hides sideways at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${WEB}/website-library`);
        await expectNothingHiddenSideways(page);
    });
}
