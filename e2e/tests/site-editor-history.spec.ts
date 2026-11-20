// @covers app:/sites/[siteId] api:sites pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Rail › History (plan 2026-11-20-002 U46b, `fix/WXEHistory`) and Preview
 * at three sizes (U46f, `fix/WXMPreview`), behind `NEXT_PUBLIC_WEBSITE_AREA`.
 *
 * The first two only look: History's lists and Compare (closed without
 * restoring), and the three frames. The last makes one change on
 * Northwind's draft (Hide on phone) and takes it back with History's Undo,
 * so the draft ends as it started; `@serial`, since Northwind has one site
 * and every editor spec reads its draft.
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

const openHistory = async (page: Page) => {
    await page
        .locator("[data-editor-trail]")
        .getByRole("button", { name: /^History/ })
        .click();
    const panel = page.locator("[data-history-panel]");
    await expect(panel).toBeVisible();
    return panel;
};

for (const size of SIZES) {
    test.describe(`History and Preview at ${size.name}`, () => {
        test.use({ viewport: size.viewport });
        test.beforeEach(({ page: _page }, testInfo) => {
            test.skip(
                testInfo.project.name.startsWith("phone"),
                "Desk boards; the phone reaches Versions from Publish.",
            );
        });

        test("History lists what waits and the versions; a version compares beside the draft", async ({
            page,
        }) => {
            test.skip(
                !(await openEditor(page)),
                "NEXT_PUBLIC_WEBSITE_AREA is off: today's chrome",
            );
            const panel = await openHistory(page);
            await expect(panel).toContainText("Waiting to publish");
            await expect(
                panel.getByRole("button", { name: "Whole site" }),
            ).toBeVisible();
            await expect(
                panel.getByRole("link", { name: "See all versions" }),
            ).toHaveAttribute("href", /\/versions$/);

            const versions = panel.locator("[data-history-versions]");
            await expect(versions).toContainText("Live now");
            await versions
                .getByRole("button", { name: /^Compare .+ with your draft$/ })
                .first()
                .click();
            const compare = page.locator("[data-history-compare]");
            await expect(compare).toContainText("beside your draft now");
            await expect(compare).toContainText(/\d+ differences?/, {
                timeout: 15_000,
            });
            await expect(compare).toContainText("Your draft now");
            await compare
                .getByRole("button", { name: "Close compare" })
                .click();
            await expect(compare).toHaveCount(0);
            expect(await noSideScroll(page)).toBe(true);
        });

        test("Preview draws desktop, tablet and phone, then goes back to editing", async ({
            page,
        }) => {
            test.skip(
                !(await openEditor(page)),
                "NEXT_PUBLIC_WEBSITE_AREA is off: today's chrome",
            );
            await page
                .locator("[data-editor-bar]")
                .getByRole("button", { name: "Preview" })
                .click();
            const frames = page.locator("[data-preview-frame]");
            await expect(frames).toHaveCount(3);
            await expect(page.locator("[data-preview-frames]")).toContainText(
                /· the draft/,
            );
            const together = page.getByRole("switch", {
                name: "Scroll together",
            });
            await expect(together).toBeChecked();
            await together.click();
            await expect(together).not.toBeChecked();
            await page.getByRole("button", { name: "Desktop" }).click();
            await expect(frames).toHaveCount(1);
            await page.getByRole("button", { name: "All three" }).click();
            await expect(frames).toHaveCount(3);
            expect(await noSideScroll(page)).toBe(true);
            await page.getByRole("button", { name: "Back to editing" }).click();
            await expect(page.locator("[data-preview-frames]")).toHaveCount(0);
            await expect(page.locator("[data-pages-tree]")).toBeVisible();
        });
    });
}

test.describe("History's Undo", { tag: "@serial" }, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("a change made, then put back as it is live from History", async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name.startsWith("phone"), "A desk board.");
        test.skip(
            !(await openEditor(page)),
            "NEXT_PUBLIC_WEBSITE_AREA is off: today's chrome",
        );
        // Hide the first section on phone: one change waiting on this page.
        await page
            .locator("[data-pages-tree] [data-section-row]")
            .first()
            .click();
        const tools = page.locator("[data-section-toolbar]");
        await tools.getByRole("button", { name: "Hide on phone" }).click();
        await expect(page.locator("[data-pages-tree]")).toContainText(
            "Hidden on phone",
        );
        const panel = await openHistory(page);
        const undo = panel
            .locator("[data-history-waiting] li")
            // The one just made, not a change already waiting.
            .filter({ hasText: /just now/ })
            .first()
            .getByRole("button", { name: "Undo" });
        // Enabled once the autosave has landed.
        await expect(undo).toBeEnabled({ timeout: 15_000 });
        const before = await panel.locator("[data-history-waiting] li").count();
        await undo.click();
        // The editor restarts on the new draft with History open again.
        await expect(page.locator("[data-history-panel]")).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator("[data-history-panel] [data-history-waiting] li"),
        ).toHaveCount(before - 1, { timeout: 15_000 });
        await page
            .locator("[data-editor-trail]")
            .getByRole("button", { name: /^Pages/ })
            .click();
        await expect(page.locator("[data-pages-tree]")).not.toContainText(
            "Hidden on phone",
        );
    });
});
