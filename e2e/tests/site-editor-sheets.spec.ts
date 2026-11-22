// @covers app:/open app:/sites api:sites pkg:site-blocks
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    brandTab,
    editPill,
    openFromPill,
    phoneSheet,
    writeField,
} from "../fixtures/phone-editor";
import { pressUntil } from "../fixtures/press";
import { openPhoneMenu, openReviewedSite } from "../fixtures/reviewer-editor";
import { useSession } from "../fixtures/sessions";
import { websiteAreaOn } from "../fixtures/website-area";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The site editor's sheets (DEC-185): Publish as one sheet on a desk (from
 * the right) and a phone (from the foot), and the phone editor without
 * bottom tabs — ⋯ More, the pill's Blocks, + and Brand, the page's own
 * sheet, and a tapped block's toolbar.
 *
 * On Northwind, the store tests may write to. What changes the draft or
 * the live site is `@serial` (Northwind has one site, which site-versions
 * publishes and site-review reads) and is put back before it ends: a move
 * or a remove by its Undo, a line by typing the old one back.
 */

const onPhone = (testInfo: TestInfo) =>
    testInfo.project.name.startsWith("phone");

/** Northwind's site, opened in the editor. */
async function openEditor(page: Page) {
    await useSession(page);
    await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
    // The business's one site, in its editor (Website area on or off).
    await openReviewedSite(page);
}

const publishSheet = (page: Page) => page.locator("[data-publish-sheet]");

/** The bar's Publish, pressed until its sheet opens. */
async function openPublish(page: Page) {
    const publish = page
        .getByRole("button", { name: /^Publish/ })
        .filter({ visible: true })
        .first();
    await expect(publish).toBeEnabled({ timeout: 30_000 });
    await pressUntil(publish, publishSheet(page));
    return publishSheet(page);
}

/**
 * A tapped block's actions: its toolbar, or with the Website area its
 * section sheet's Move · Duplicate · Hide here · Delete (U49).
 */
const blockActions = (page: Page) =>
    page
        .getByRole("toolbar", { name: "Block actions" })
        .or(page.getByRole("group", { name: "Section actions" }));

const heroChip = (page: Page) =>
    page
        .getByRole("button", { name: /^Top of the page section, \d+ of \d+/ })
        .first();

test.describe("Publish is a sheet", { tag: "@serial" }, () => {
    test("says what goes live, then turns into the result", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        await openEditor(page);
        const sheet = await openPublish(page);

        // From the right on a desk, over the inspector; from the foot on a
        // phone. Either way the page is still there behind it. Read once
        // it has slid in.
        const view = page.viewportSize();
        if (!view) throw new Error("No viewport");
        const phone = onPhone(testInfo);
        await expect
            .poll(async () => {
                const box = await sheet.boundingBox();
                if (!box) return null;
                return phone
                    ? [Math.round(box.y + box.height), Math.round(box.width)]
                    : [
                          Math.round(box.x + box.width),
                          Math.min(Math.round(box.width), 440),
                      ];
            })
            .toEqual(phone ? [view.height, view.width] : [view.width, 440]);
        // What goes live: one line, or with the Website area its list of
        // changes, each with its own tick.
        await expect(
            sheet.locator("[data-going-live], [data-publish-changes]").first(),
        ).toBeVisible();

        await sheet
            .getByRole("button", {
                name: /^Publish (changes|site|without approval|\d+ (of \d+ )?changes? now)$/,
            })
            .click();
        const live = sheet.locator("[role=status]");
        await expect(live).toContainText(" is live", { timeout: 30_000 });
        await expect(live).toContainText("Anyone can open it now.");
        await expect(
            sheet.getByRole("link", { name: "Open site" }),
        ).toBeVisible();
        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(publishSheet(page)).toHaveCount(0);
        // Still editing, and nothing is waiting to go live: the bar's
        // status, or with the Website area the desk's chip ("Live · 2
        // changes waiting") and the phone Publish's count.
        if (!(await websiteAreaOn(page))) {
            await expect(
                page.locator("[data-editor-bar] [role=status]"),
            ).not.toContainText("Not published", { timeout: 30_000 });
        } else if (phone) {
            await expect(
                page.locator("[data-phone-bar] [data-publish-count]"),
            ).toHaveCount(0, { timeout: 30_000 });
        } else {
            await expect(page.locator("[data-status-chip]")).toHaveText(
                /^Live$/,
                { timeout: 30_000 },
            );
        }
    });

    test("holds Publish while something must be fixed, and its fix goes to the block", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await openEditor(page);

        // A hero still carrying the template's note to the owner blocks
        // publishing (DEC-141).
        // The field itself: not "Subheading on phone", nor the Website
        // area's full-screen sheet a long one opens on a phone.
        const line = page
            .getByRole("textbox", { name: "Subheading", exact: true })
            .filter({ visible: true });
        await pressUntil(heroChip(page), line);
        const before = await line.inputValue();
        try {
            await writeField(
                page,
                line,
                "Say what you do and where, in one line.",
            );
            const sheet = await openPublish(page);
            await expect(sheet.getByText(/^Fix first/)).toBeVisible({
                timeout: 30_000,
            });
            await expect(
                sheet.getByRole("button", {
                    name: /^Publish (changes|site|without approval|\d+ (of \d+ )?changes? now)$/,
                }),
            ).toBeDisabled();
            await expect(sheet.locator("[data-publish-waits]")).toHaveText(
                "Fix what's marked first",
            );

            // The fix is on the page: the sheet goes, the hero is chosen.
            await sheet
                .locator("[data-flag-tone=block]")
                .getByRole("button", { name: "Edit" })
                .click();
            await expect(publishSheet(page)).toHaveCount(0);
            await expect(line).toBeVisible();
        } finally {
            await writeField(page, line, before);
            await expect(
                page
                    .getByRole("button", { name: /^Publish/ })
                    .filter({ visible: true })
                    .first(),
            ).toBeEnabled({ timeout: 30_000 });
        }
    });
});

test.describe("the phone editor without bottom tabs", () => {
    test.beforeEach(({ page: _page }, testInfo) => {
        test.skip(!onPhone(testInfo), "A phone's own layout.");
    });

    test("⋯ More holds Preview, Feedback and Share; the pill makes way", async ({
        page,
    }) => {
        await openEditor(page);
        await expect(
            page.getByRole("navigation", { name: "Edit this page" }),
        ).toHaveCount(0);
        await expect(editPill(page)).toBeVisible();

        // ⋯ More, or with the Website area the page picker's Pages sheet.
        const more = await openPhoneMenu(page);
        await expect(
            more.getByRole("button", { name: /^Preview/ }),
        ).toBeVisible();
        await expect(
            more.getByRole("button", { name: /^Feedback/ }),
        ).toBeVisible();
        await expect(
            more.getByRole("button", {
                name: /^(Ask a teammate to review|Withdraw the review request)/,
            }),
        ).toBeVisible();
        await expect(
            more.getByRole("button", { name: /^Share a preview link/ }),
        ).toBeVisible();
        await expect(editPill(page)).toHaveCount(0);

        // Every row a thumb's size.
        for (const b of await more.locator("li > button").all()) {
            const box = await b.boundingBox();
            if (box) expect(box.height).toBeGreaterThanOrEqual(44);
        }
        await more
            .getByRole("button", { name: /^Close (More|pages)$/ })
            .click();
        await expect(editPill(page)).toBeVisible();
    });

    test("the page's sheet ticks the page open and switches to another", async ({
        page,
    }) => {
        await openEditor(page);
        const sheet = phoneSheet(page, "Pages");
        await pressUntil(
            page.getByRole("button", { name: /^Page: .*Choose another page/ }),
            sheet,
        );
        const current = sheet.getByRole("option", { selected: true });
        await expect(current).toHaveCount(1);
        const other = sheet.getByRole("option", { selected: false }).first();
        await other.click();
        await page.waitForURL(/\?page=/, { timeout: 30_000 });
    });

    test("Brand is one sheet with its tabs", async ({ page }) => {
        await openEditor(page);
        // One group at a time (U24b, WXBBrandPhone); no sliders.
        const sheet = await brandTab(page, "Buttons and shapes");
        await expect(sheet.locator("input[type=range]")).toHaveCount(0);
        await brandTab(page, "Colours");
        await expect(
            sheet.getByRole("radiogroup", { name: "Colour" }),
        ).toBeVisible();
        await expect(
            sheet.getByRole("button", { name: "More: Reset style" }),
        ).toBeVisible();
    });
});

test.describe("the phone editor's changes", { tag: "@serial" }, () => {
    test.beforeEach(({ page: _page }, testInfo) => {
        test.skip(!onPhone(testInfo), "A phone's own layout.");
    });

    test("Blocks reorders from the grip, with Undo", async ({ page }) => {
        await openEditor(page);
        const sheet = await openFromPill(page, "Blocks");
        // "Move …: drag", or with the Website area "Drag to move …".
        const grip = sheet.getByRole("button", {
            name: /^(Move .*: drag|Drag to move )/,
        });
        await expect(grip.first()).toBeVisible();
        await grip.first().focus();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByText(/ moved down$/).first()).toBeVisible();
        await page.getByRole("button", { name: "Undo" }).last().click();
        await expect(page.getByText(/ moved down$/)).toHaveCount(0);
    });

    test("a tapped block's toolbar moves it at once, with Undo", async ({
        page,
    }) => {
        await openEditor(page);
        const tools = blockActions(page);
        await pressUntil(heroChip(page), tools);
        // No scrim under its settings: the toolbar is in reach.
        await expect(page.locator("[data-editor-scrim]")).toHaveCount(0);
        let down = tools.getByRole("button", { name: "Move down" });
        if (await websiteAreaOn(page)) {
            // The section sheet's Move opens the Sections sheet, where the
            // tapped section steps down a place (U49).
            await tools
                .getByRole("button", { name: "Move", exact: true })
                .click();
            down = phoneSheet(page, "Sections on this page")
                .locator('li[data-row-index="0"]')
                .getByRole("button", { name: /^Move .* down$/ });
        }
        await expect(down).toBeEnabled();
        await down.click();
        await expect(
            page.getByText("Top of the page moved down").first(),
        ).toBeVisible();
        await page.getByRole("button", { name: "Undo" }).last().click();
        await expect(page.getByText(/ moved down$/)).toHaveCount(0);
        await expect(heroChip(page)).toBeVisible();
    });

    test("+ finds a block, adds it with its settings open, and Remove takes it off with Undo", async ({
        page,
    }) => {
        await openEditor(page);
        const before = await page.locator("[data-block-index]").count();
        const sheet = await openFromPill(page, "Add a block");
        // "Search blocks", or with the Website area one search over pages
        // and sections.
        await sheet
            .getByLabel(/^Search (blocks|pages and sections)$/)
            .fill("contact");
        // By its name: the list filters a beat after typing, and the first
        // row before it does is Hero.
        // Contact is now Visit us's Talk to us layout, found by its old name (KD5).
        await sheet
            .getByRole("button", { name: "Add Visit us · Talk to us" })
            .click();
        // Its settings rise; the toolbar is on the new block.
        const tools = blockActions(page);
        await expect(tools).toBeVisible({ timeout: 15_000 });
        await expect(page.locator("[data-block-index]")).toHaveCount(
            before + 1,
        );
        await tools.getByRole("button", { name: /^(Remove|Delete)$/ }).click();
        await expect(
            page.getByText(/taken off this page$/).first(),
        ).toBeVisible();
        await expect(page.locator("[data-block-index]")).toHaveCount(before);
    });
});
