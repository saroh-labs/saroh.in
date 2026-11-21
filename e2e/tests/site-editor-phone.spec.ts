// @covers app:/sites/[siteId] pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The one phone editor (plan 2026-11-20-002 U49, `fix/WXNHome`,
 * `fix/WXEEditorPhone`, `fix/WXNSection`, `fix/WXNReorder`), behind
 * `NEXT_PUBLIC_WEBSITE_AREA`: the top bar ← Website · page · Ask AI ·
 * Preview, one bar Sections · Add · Brand · Publish with the chip's count,
 * a tapped section's sheet and the Sections sheet. At 390 and at 320,
 * where no board exists (the four-scenes rules).
 *
 * Read-only: it opens Northwind's editor, opens sheets and closes them
 * with Cancel or Done. Nothing is saved.
 */
const SIZES = [
    { name: "390", viewport: { width: 390, height: 844 } },
    { name: "320", viewport: { width: 320, height: 640 } },
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
    await expect(page.locator("[data-layout=phone]")).toBeVisible({
        timeout: 30_000,
    });
    return (await page.locator("[data-phone-bar]").count()) > 0;
}

const noSideScroll = (page: Page) =>
    page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
    );

for (const size of SIZES) {
    test.describe(`the phone editor at ${size.name}`, () => {
        test.use({ viewport: size.viewport, hasTouch: true, isMobile: true });
        test.beforeEach(({ page: _page }, testInfo) => {
            test.skip(
                !testInfo.project.name.startsWith("phone"),
                "A phone board; the phone project runs it.",
            );
        });

        test("one top bar, one bar of four cells, no pill", async ({
            page,
        }) => {
            test.skip(
                !(await openEditor(page)),
                "NEXT_PUBLIC_WEBSITE_AREA is off: today's phone editor",
            );
            const top = page.locator("[data-editor-bar]");
            await expect(
                top.getByRole("link", { name: "Back to Website" }),
            ).toBeVisible();
            await expect(
                top.getByRole("button", {
                    name: /^Page: .+\. Choose another page or change its settings$/,
                }),
            ).toBeVisible();
            await expect(
                top.getByRole("button", { name: "Preview" }),
            ).toBeVisible();

            const bar = page.locator("[data-phone-bar]");
            const cells = bar.getByRole("button");
            await expect(cells).toHaveCount(4);
            await expect(cells.nth(0)).toHaveText("Sections");
            await expect(cells.nth(1)).toHaveText("Add");
            await expect(cells.nth(2)).toHaveText("Brand");
            await expect(cells.nth(3)).toHaveAccessibleName(/^Publish/);
            // Four equal cells, each a thumb's target.
            for (let i = 0; i < 4; i += 1) {
                const box = await cells.nth(i).boundingBox();
                expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
                expect(box?.width ?? 0).toBeGreaterThanOrEqual(
                    size.viewport.width / 4 - 1,
                );
            }
            await expect(page.locator("[data-edit-pill]")).toHaveCount(0);
            await expect(page.locator("nav[aria-label=Editor]")).toHaveCount(1);
            expect(await noSideScroll(page)).toBe(true);
            await expectNothingHiddenSideways(page);
        });

        test("a tapped section's sheet: actions, tabs, Cancel", async ({
            page,
        }) => {
            test.skip(
                !(await openEditor(page)),
                "NEXT_PUBLIC_WEBSITE_AREA is off: today's phone editor",
            );
            const first = page
                .locator("[data-block-index] > button[aria-pressed]")
                .first();
            await first.click();
            const sheet = page.locator("[data-section-sheet]");
            await expect(sheet).toBeVisible();
            const actions = page.getByRole("group", {
                name: "Section actions",
            });
            for (const name of ["Move", "Duplicate", "Hide here", "Delete"]) {
                const action = actions.getByRole("button", { name });
                await expect(action).toBeVisible();
                const box = await action.boundingBox();
                expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
            }
            for (const tab of ["Content", "Style", "Visibility"]) {
                await expect(
                    page.getByRole("tab", { name: tab }),
                ).toBeVisible();
            }
            await expect(page.locator("[data-save-footer]")).toContainText(
                "Saved · goes live when you publish",
            );
            expect(await noSideScroll(page)).toBe(true);
            await page.getByRole("button", { name: "Cancel" }).click();
            await expect(sheet).toBeHidden();
        });

        test("Sections: the header and footer pinned, Done", async ({
            page,
        }) => {
            test.skip(
                !(await openEditor(page)),
                "NEXT_PUBLIC_WEBSITE_AREA is off: today's phone editor",
            );
            await page
                .locator("[data-phone-bar]")
                .getByRole("button", { name: "Sections" })
                .click();
            const list = page.locator("[data-sections-sheet]");
            await expect(list).toContainText(
                "On every page · stays at the top",
            );
            await expect(list).toContainText(
                "On every page · stays at the bottom",
            );
            await expect(
                page.getByRole("button", { name: "Add a section" }),
            ).toBeVisible();
            expect(await noSideScroll(page)).toBe(true);
            await page.getByRole("button", { name: "Done" }).click();
            await expect(list).toBeHidden();
        });

        test("Publish opens the Publish sheet", async ({ page }) => {
            test.skip(
                !(await openEditor(page)),
                "NEXT_PUBLIC_WEBSITE_AREA is off: today's phone editor",
            );
            await page
                .locator("[data-phone-bar]")
                .getByRole("button", { name: /^Publish/ })
                .click();
            await expect(page.getByRole("dialog").last()).toBeVisible();
        });
    });
}
