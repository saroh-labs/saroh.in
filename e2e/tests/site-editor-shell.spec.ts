// @covers app:/sites/[siteId] pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The desk editor's shell (plan 2026-11-20-002 U46, `fix/WXKRest` at 1920,
 * `fix/WXEEditor` at 1440), behind the api's `WEBSITE_AREA`: the trimmed
 * bar, everything else in More, the rail of five tabs, the Pages tree and
 * the canvas bar; the status chip opens Publish.
 *
 * Read-only: it opens Northwind's editor, changes how the page is shown
 * (a per-browser preference) and closes the Publish sheet without
 * publishing. Nothing is saved.
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
    return (await page.locator("[data-editor-trail]").count()) > 0;
}

const noSideScroll = (page: Page) =>
    page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
    );

for (const size of SIZES) {
    test.describe(`the editor shell at ${size.name}`, () => {
        test.use({ viewport: size.viewport });
        test.beforeEach(({ page: _page }, testInfo) => {
            test.skip(
                testInfo.project.name.startsWith("phone"),
                "A desk board; the phone editor is U49's.",
            );
        });

        test("the bar, More, the rail and the chip's Publish", async ({
            page,
        }) => {
            test.skip(
                !(await openEditor(page)),
                "The Website area is off: today's chrome",
            );
            const bar = page.locator("[data-editor-bar]");
            await expect(
                bar.getByRole("link", { name: "Back to Website" }),
            ).toBeVisible();
            await expect(
                bar.getByRole("button", { name: /^Page: .+\. Choose/ }),
            ).toBeVisible();
            await expect(
                bar.getByRole("button", { name: "Undo" }),
            ).toBeDisabled();
            await expect(
                bar.getByRole("button", { name: "Preview", exact: true }),
            ).toBeVisible();
            await expect(
                bar.getByRole("button", { name: /^(Publish|Needs approval)$/ }),
            ).toBeVisible();
            // The old bar's controls are gone from it.
            for (const gone of [/^Share$/, /^Test link$/, /^Zoom$/]) {
                await expect(
                    bar.getByRole("button", { name: gone }),
                ).toHaveCount(0);
            }
            const chip = bar.locator("[data-status-chip]");
            await expect(chip).toHaveText(
                /^(Live|Live · \d+ changes? waiting|Live · changes waiting|Not live yet)$/,
            );

            // The rail: Pages · Add · Brand · History · Feedback.
            const trail = page.locator("[data-editor-trail]");
            for (const tab of [
                "Pages",
                "Add",
                "Brand",
                "History",
                "Feedback",
            ]) {
                await expect(
                    trail.getByRole("button", { name: new RegExp(`^${tab}`) }),
                ).toBeVisible();
            }
            await expect(page.locator("[data-pages-tree]")).toContainText(
                "On every page",
            );

            // Undo and Redo side by side; no Ask AI on the desk bar (it is
            // the right column's tab).
            await expect(
                bar.getByRole("button", { name: "Redo" }),
            ).toBeDisabled();
            await expect(
                bar.getByRole("button", { name: "Ask AI" }),
            ).toHaveCount(0);

            // The canvas bar's width switch and zoom (owner, 21 Nov).
            const canvasBar = page.locator("[data-canvas-bar]");
            const width = canvasBar.getByRole("radiogroup", {
                name: "Preview width",
            });
            await expect(
                width.getByRole("radio", { name: "Desk" }),
            ).toBeChecked();
            await width.getByRole("radio", { name: "Tablet" }).click();
            await expect(
                width.getByRole("radio", { name: "Tablet" }),
            ).toBeChecked();
            await width.getByRole("radio", { name: "Desk" }).click();
            await canvasBar.getByRole("button", { name: "Zoom out" }).click();
            await expect(
                canvasBar.getByRole("button", { name: /^Zoom: 75%/ }),
            ).toBeVisible();
            await canvasBar.getByRole("button", { name: "Zoom in" }).click();
            // One line, whatever the window.
            expect(
                await canvasBar.evaluate((el) => el.clientHeight),
            ).toBeLessThanOrEqual(48);

            // The chip opens the Publish sheet; Escape puts it away.
            await chip.click();
            await expect(page.getByRole("dialog").first()).toBeVisible();
            await page.keyboard.press("Escape");

            expect(await noSideScroll(page)).toBe(true);
        });
    });
}
