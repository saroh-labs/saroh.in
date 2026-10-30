import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { urls } from "../playwright.config";
import { openMore, phoneSheet } from "./phone-editor";
import { pressUntil } from "./press";

/**
 * A Reviewer in the site editor, read-only (DEC-200): the steps the review
 * specs share. On a desk the verdict is in the top bar; on a phone it is
 * the bar's Review button and its "Your review" sheet (U5).
 */

/** Below 760px the editor draws its phone layout (`use-editor-layout.ts`). */
export const onPhone = (page: Page): boolean =>
    (page.viewportSize()?.width ?? 1440) < 760;

/**
 * The reviewer's one site, opened from Website: `/sites` → the site →
 * the editor, read-only. Returns the site's id.
 */
export async function openReviewedSite(page: Page): Promise<string> {
    await page.goto(`${urls.APP_URL}/sites`);
    await page.waitForURL(/\/sites\/[^/?]+(\?.*)?$/, { timeout: 30_000 });
    await expect(page.locator("[data-layout]")).toBeVisible({
        timeout: 30_000,
    });
    const id = /\/sites\/([^/?]+)/.exec(page.url())?.[1];
    if (id === undefined) throw new Error(`no site id in ${page.url()}`);
    return id;
}

/** The first block drawn on the canvas, by its "Hero block, 1 of 4" name. */
export const firstBlock = (page: Page): Locator =>
    page.getByRole("button", { name: /block, 1 of \d+$/ }).first();

/**
 * The note box for the first block on the canvas. A Reviewer's inspector
 * opens on Feedback; on a phone a tapped block opens its Feedback sheet.
 */
export async function noteBoxForFirstBlock(page: Page): Promise<Locator> {
    const box = page
        .getByLabel(/^Add a note on /)
        .filter({ visible: true })
        .first();
    await pressUntil(firstBlock(page), box, { timeout: 30_000 });
    return box;
}

/** The phone's "Your review" sheet, opened from the bar's Review. */
async function reviewSheet(page: Page): Promise<Locator> {
    const sheet = phoneSheet(page, "Your review");
    await pressUntil(
        page.getByRole("button", { name: "Review", exact: true }),
        sheet,
    );
    return sheet;
}

/** Ask for changes, with a reason, at either width. */
export async function askForChanges(page: Page, reason: string) {
    if (onPhone(page)) {
        const sheet = await reviewSheet(page);
        await sheet.getByRole("radio", { name: /^Ask for changes/ }).click();
        await sheet.getByLabel("What needs changing?").fill(reason);
        await sheet.getByRole("button", { name: /^Send to / }).click();
    } else {
        const reasonBox = page
            .getByLabel("What needs changing?")
            .filter({ visible: true });
        await pressUntil(
            page
                .getByRole("button", { name: "Ask for changes" })
                .filter({ visible: true }),
            reasonBox,
        );
        await reasonBox.fill(reason);
        await page
            .getByRole("button", { name: /^Send to / })
            .filter({ visible: true })
            .click();
    }
    await expect(
        page.getByText("Recorded that you asked for changes.").first(),
    ).toBeVisible({ timeout: 30_000 });
}

/** Approve, at either width. */
export async function approve(page: Page) {
    if (onPhone(page)) {
        const sheet = await reviewSheet(page);
        await sheet.getByRole("radio", { name: /^Approve/ }).click();
        await sheet.getByRole("button", { name: /^Send to / }).click();
    } else {
        await page
            .getByRole("button", { name: "Approve", exact: true })
            .filter({ visible: true })
            .click();
    }
    await expect(page.getByText("Marked as approved.").first()).toBeVisible({
        timeout: 30_000,
    });
}

/**
 * "Change your review", where the verdict was: the bar on a desk, the
 * Review sheet on a phone. Present once you have approved.
 */
export async function changeYourReview(page: Page): Promise<Locator> {
    const button = (within: Page | Locator) =>
        within
            .getByRole("button", { name: "Change your review" })
            .filter({ visible: true });
    if (onPhone(page)) return button(await reviewSheet(page));
    return button(page);
}

/** The editor's Test releases panel, from the bar or a phone's ⋯ More. */
export async function openTestReleases(page: Page): Promise<Locator> {
    const panel = page.getByRole("dialog", { name: "Test releases" });
    const trigger = onPhone(page)
        ? (await openMore(page)).getByRole("button", { name: /^Test releases/ })
        : page
              .getByRole("button", { name: /^Test releases/ })
              .filter({ visible: true })
              .first();
    await pressUntil(trigger, panel, { timeout: 30_000 });
    return panel;
}

/**
 * The owner's controls a Reviewer must never be offered (R2), by name.
 * Each is asserted absent, not disabled.
 */
export const WRITE_CONTROLS: readonly (string | RegExp)[] = [
    /^Publish/,
    /^Share/,
    "Add a block",
    "Make a test release",
    "Move block up",
    "Move block down",
    "Remove",
    "Save draft",
];

/** None of {@link WRITE_CONTROLS} on screen. */
export async function expectNoWriteControl(page: Page) {
    for (const name of WRITE_CONTROLS) {
        await expect(
            page
                .getByRole("button", {
                    name,
                    exact: typeof name === "string",
                })
                .filter({ visible: true }),
            String(name),
        ).toHaveCount(0);
    }
}
