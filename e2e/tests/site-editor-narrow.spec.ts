// @covers accounts:/login app:/open app:/sites api:sites pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    demoUser,
    NORTHWIND_ORG,
    REVIEWED_SITE,
    urls,
} from "../playwright.config";

/**
 * The site editor on a phone (round 2, G4): the page fills the screen, the
 * rail is a bar at the foot, and a block's fields open in a sheet that keeps
 * focus until it is closed.
 *
 * Runs on Northwind, the seeded store tests may write to. The one edit is
 * put back before the test ends, so the draft is as it was found.
 */

const PHONE = { width: 390, height: 844 };

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

/** Northwind's site, opened in the editor. */
async function openEditor(page: Page) {
    await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
    await page.goto(`${urls.APP_URL}/sites`);
    await page.waitForURL(/\/sites\/[^/]+\/pages/, { timeout: 30_000 });
    await expect(page.getByRole("main")).toContainText(REVIEWED_SITE, {
        timeout: 30_000,
    });
    const id = /\/sites\/([^/]+)\//.exec(page.url())?.[1];
    if (id === undefined) throw new Error(`no site id in ${page.url()}`);
    await page.goto(`${urls.APP_URL}/sites/${id}`);
    await expect(page.locator("[data-layout=phone]")).toBeVisible({
        timeout: 30_000,
    });
}

/** The first hero's label on the page, which selects it. */
const heroChip = (page: Page) =>
    page.getByRole("button", { name: /^Hero block, \d+ of \d+/ }).first();

test.describe("the site editor on a phone", () => {
    test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

    test("edits the hero's heading in the sheet, and the page shows it", async ({
        page,
    }) => {
        await signIn(page);
        await openEditor(page);

        // Nothing sideways: the page is the width of the phone.
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow).toBe(false);
        await expect(
            page.getByRole("navigation", { name: "Edit this page" }),
        ).toBeVisible();

        await heroChip(page).click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        const heading = sheet.getByLabel("Heading", { exact: true });
        const before = await heading.inputValue();
        const after = `${before} (phone)`;
        await heading.fill(after);

        await sheet
            .getByRole("button", { name: "Close the block panel" })
            .click();
        await expect(sheet).toHaveCount(0);
        await expect(page.getByText(after).first()).toBeVisible();
        // Focus is back on the block it was about.
        await expect(heroChip(page)).toBeFocused();

        // Put it back, and let autosave send it.
        await heroChip(page).click();
        await page
            .getByRole("dialog")
            .getByLabel("Heading", { exact: true })
            .fill(before);
        await page.keyboard.press("Escape");
        await expect(page.getByText(before).first()).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("keeps the selection when the phone turns on its side", async ({
        page,
    }) => {
        await signIn(page);
        await openEditor(page);
        await heroChip(page).click();
        await expect(page.getByRole("dialog")).toBeVisible();

        await page.setViewportSize({
            width: PHONE.height,
            height: PHONE.width,
        });
        await expect(page.locator("[data-layout=narrow]")).toBeVisible();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        await expect(
            sheet.getByRole("heading", { level: 2, name: "Hero" }),
        ).toBeVisible();
        // The modal sheet hides the page from assistive tech, so the chip is
        // found by its label here rather than its role.
        await expect(
            page.locator('button[aria-label^="Hero block,"]').first(),
        ).toHaveAttribute("aria-pressed", "true");
        // And the page is drawn beside the rail, not squeezed into the
        // divider's 1px column (it drew blank there).
        const block = await page
            .locator("[data-block-index]")
            .first()
            .boundingBox();
        expect(block?.width ?? 0).toBeGreaterThan(300);
        await sheet
            .getByRole("button", { name: "Close the block panel" })
            .click();
        await expect(heroChip(page)).toHaveAttribute("aria-pressed", "true");
    });

    test("keeps Tab inside the open sheet, and Escape closes it", async ({
        page,
    }) => {
        await signIn(page);
        await openEditor(page);
        await heroChip(page).click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();

        // Far more presses than the sheet has controls: focus never leaves.
        for (let i = 0; i < 30; i += 1) {
            await page.keyboard.press("Tab");
            const inside = await sheet.evaluate((el) =>
                el.contains(document.activeElement),
            );
            expect(inside).toBe(true);
        }

        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
        await expect(heroChip(page)).toBeFocused();
    });
});
