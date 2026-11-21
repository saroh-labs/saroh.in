// @covers app:/sites/[siteId]
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The editor's inspector (plan 2026-11-20-002 U47, `fix/WXKRest`,
 * `fix/WXKSelected`, `fix/WXKStyle`, `fix/WXMGlobal`), behind
 * the api's `WEBSITE_AREA`: the page at rest, a section with its four
 * tabs and its canvas toolbar, and the header on every page.
 *
 * Read-only: it selects, switches tabs and closes. Nothing is pressed that
 * changes the draft, so it shares Northwind with every other spec.
 */
const SIZES = [
    { name: "1920", viewport: { width: 1920, height: 1080 } },
    { name: "1440", viewport: { width: 1440, height: 900 } },
];

async function openEditor(page: Page): Promise<boolean> {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    const sites = await northwind(page.request).get<
        { id: string; subdomain: string | null }[]
    >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    await page.goto(`/sites/${site?.id ?? ""}`);
    await expect(page.locator("[data-layout]")).toBeVisible({
        timeout: 30_000,
    });
    return (await page.locator("[data-site-inspector]").count()) > 0;
}

for (const size of SIZES) {
    test.describe(`the inspector at ${size.name}`, () => {
        test.use({ viewport: size.viewport });
        test.beforeEach(({ page: _page }, testInfo) => {
            test.skip(
                testInfo.project.name.startsWith("phone"),
                "A desk board; the phone's section sheet is U49's.",
            );
        });

        test("at rest, a section's tabs and toolbar, and the header", async ({
            page,
        }) => {
            test.skip(
                !(await openEditor(page)),
                "The Website area is off: today's inspector",
            );
            const inspector = page.getByRole("complementary", {
                name: "Inspector",
            });

            // At rest: the page, its checks and its settings card.
            const close = inspector.getByRole("button", {
                name: "Close, nothing selected",
            });
            if (await close.count()) await close.click();
            await expect(inspector).toContainText("Page · Nothing selected");
            await expect(inspector).toContainText("Who can see it");

            // A section: name, kind and place; Content first.
            await page
                .locator("[data-pages-tree] [data-section-row]")
                .first()
                .click();
            await expect(inspector).toContainText(/section · 1 of \d+/);
            const tab = (name: string | RegExp) =>
                inspector.getByRole("tab", { name });
            await expect(tab("Content")).toHaveAttribute(
                "aria-selected",
                "true",
            );
            await tab("Style").click();
            await expect(inspector).toContainText("Uses the site look");
            await expect(inspector).toContainText("Background");
            await tab("Visibility").click();
            await expect(inspector).toContainText("Hide on phone");
            await tab(/^Feedback/).click();

            // The canvas toolbar holds the section's actions.
            const tools = page.locator("[data-section-toolbar]");
            for (const name of [
                "Move",
                "Duplicate",
                "Hide on phone",
                "Delete",
            ]) {
                await expect(tools.getByRole("button", { name })).toBeVisible();
            }
            expect(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth,
                ),
            ).toBe(true);

            // The header: on every page, the banner over the canvas.
            await page
                .locator("[data-pages-tree]")
                .getByRole("button", { name: /^Header/ })
                .first()
                .click();
            await expect(inspector).toContainText(/On every page · \d+ pages?/);
            const banner = page.locator("[data-everywhere-banner]");
            await expect(banner).toContainText("Changes here show on all");
            await banner
                .getByRole("button", { name: "Back to this page's sections" })
                .click();
            await expect(banner).toHaveCount(0);
        });
    });
}
