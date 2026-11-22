// @covers accounts:/login app:/open app:/sites app:/sites/[siteId] api:sites pkg:site-blocks
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { openFromPill } from "../fixtures/phone-editor";
import { pressUntil } from "../fixtures/press";
import { askForChanges, openReviewedSite } from "../fixtures/reviewer-editor";
import { useSession } from "../fixtures/sessions";
import { websiteAreaOn } from "../fixtures/website-area";
import {
    demoReviewer,
    demoUser,
    ignoreHTTPSErrors,
    NORTHWIND_ORG,
    REVIEWED_SITE,
    urls,
} from "../playwright.config";

/**
 * Publishing past a change request, and taking a version back (#287).
 *
 * The epic's whole argument is that a review is advice, not a gate: an owner
 * can always publish, and what the product owes everyone is a RECORD that they
 * did (#199). That record spans two people in two sessions — a reviewer asks
 * for changes, an owner publishes anyway — and one browser context cannot tell
 * that story, which is why nothing had told it before.
 *
 * Restore is the other half. Since 20 Nov 2026 it puts an older version
 * back as the DRAFT: nothing goes live until Publish, which asks for any
 * approval as every publish does.
 *
 * These run against the seeded stack and CHANGE it: they publish, and they
 * restore. Written to survive that — nothing asserts a count of versions or
 * which one is live at the start, only the difference the actions make.
 *
 * `@serial`, every one: Northwind has one site (ADR-006), and publishing,
 * restoring or hiding its first block changes what the reviewer, the
 * phone editor and a second copy of this file would be reading.
 */

async function signIn(page: Page, who: { email: string; password: string }) {
    await useSession(page, who);
}

/** A second, independent session — a different person, not a second tab. */
async function asReviewer(browser: Browser): Promise<Page> {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    const page = await context.newPage();
    await signIn(page, demoReviewer);
    return page;
}

/**
 * The seeded site's id: Website sends the owner straight to the business's
 * one site (ADR-006), so it is in the address.
 */
async function siteId(page: Page): Promise<string> {
    // The owner is in several businesses; Website is the OPEN one's.
    await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
    // Website: the site's editor, through All sites and Open editor
    // while the Website area is on, straight there while it is off.
    const id = await openReviewedSite(page);
    await expect(page.locator("body")).toContainText(REVIEWED_SITE, {
        timeout: 30_000,
    });
    return id;
}

/** The editor at a phone's width (G4), where the bar folds into a menu. */
const onPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 760;

/** The editor's Publish: on the bar, a phone's too (DEC-185). */
async function publishButton(page: Page) {
    const publish = page
        .getByRole("button", { name: /^Publish/ })
        .filter({ visible: true })
        .first();
    await expect(publish).toBeVisible({ timeout: 30_000 });
    return publish;
}

/**
 * Show or hide the first block, from where its Visible/Hidden lives;
 * returns whether it was hidden before. Chosen from the block list, not
 * the page: a hidden block is left off the page, so "1 of N" there after
 * hiding the first would pick the next one, and put back the wrong block.
 *
 * Today: the inspector's toggle (pressed is "Hidden"), a sheet on a phone
 * opened from the Blocks list. The Website area (DEC-240): the inspector's
 * Visibility tab, "Shown on the site" or "Hidden when published", from the
 * Pages list's first section on a desk and the Sections sheet on a phone.
 */
async function setFirstBlockHidden(
    page: Page,
    hidden: boolean,
): Promise<boolean> {
    if (!(await websiteAreaOn(page))) {
        const toggle = page
            .getByRole("complementary", { name: "Inspector" })
            .getByRole("button", { name: /^(Visible|Hidden)$/ })
            .first();
        if (onPhone(page) && !(await toggle.isVisible())) {
            const sheet = await openFromPill(page, "Blocks");
            // The list has every block, hidden or not: the header, then the
            // page's own blocks.
            await sheet
                .getByRole("listitem")
                .nth(1)
                .getByRole("button")
                .first()
                .click();
        }
        await expect(toggle).toBeVisible({ timeout: 30_000 });
        const was = (await toggle.getAttribute("aria-pressed")) === "true";
        if (was !== hidden) await toggle.click();
        return was;
    }
    let tab: Locator;
    if (onPhone(page)) {
        const sheet = await openFromPill(page, "Blocks");
        // The row's grip comes first, then the row itself.
        await sheet
            .locator('li[data-row-index="0"]')
            .getByRole("button")
            .nth(1)
            .click();
        tab = page
            .getByRole("tablist", { name: "Section" })
            .getByRole("tab", { name: "Visibility" });
    } else {
        await page
            .getByRole("list", { name: /^Sections on / })
            .getByRole("button")
            .first()
            .click();
        tab = page
            .getByRole("complementary", { name: "Inspector" })
            .getByRole("tab", { name: "Visibility" });
    }
    await pressUntil(
        tab,
        async () => (await tab.getAttribute("aria-selected")) === "true",
        { timeout: 30_000 },
    );
    const hide = page
        .getByRole("radio", { name: /^Hidden when published/ })
        .filter({ visible: true });
    const show = page
        .getByRole("radio", { name: /^Shown on the site/ })
        .filter({ visible: true });
    await expect(hide).toBeVisible();
    const was = (await hide.getAttribute("aria-checked")) === "true";
    if (was !== hidden) {
        const want = hidden ? hide : show;
        await want.click();
        await expect(want).toHaveAttribute("aria-checked", "true");
    }
    return was;
}

/** Put the phone's sheet or menu away, so the page is reachable again. */
async function closeOverlays(page: Page) {
    if (!onPhone(page)) return;
    if (await page.getByRole("dialog").count()) {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
    }
}

/**
 * Publish from the editor, through the Publish sheet, and wait until it
 * has happened. Returns what the sheet's result said.
 *
 * Waited for, not counted: the check opens a beat after the click, so the
 * `if (await confirm.count())` this replaces read 0, skipped the publish, and
 * the test went looking for a record of something that never happened.
 * Pressed until the check opens, too: a press before hydration does nothing.
 */
async function publishFromEditor(page: Page): Promise<string> {
    const confirm = page
        .getByRole("button", {
            name: /^Publish (changes|site|without approval|\d+ (of \d+ )?changes? now)$/,
        })
        // The check's own button, drawn after the editor's "Publish".
        .last();
    await closeOverlays(page);
    await expect(async () => {
        await (await publishButton(page)).click();
        await expect(confirm).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await confirm.click();
    // The Publish sheet turns into its result (DEC-185): the site is live,
    // and what was recorded, if anything.
    const live = page.locator("[data-publish-sheet] [role=status]");
    await expect(live).toContainText(" is live", { timeout: 30_000 });
    const said = await live.innerText();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("[data-publish-sheet]")).toHaveCount(0);
    return said;
}

test.describe("publishing past a change request", { tag: "@serial" }, () => {
    test("is recorded in version history, with who did it", async ({
        page,
        browser,
    }) => {
        await signIn(page, demoUser);
        const id = await siteId(page);

        // 1. The reviewer asks for changes.
        const reviewer = await asReviewer(browser);
        // In the editor, read-only (DEC-200); a change request says what
        // (UX-043).
        await reviewer.goto(`${urls.APP_URL}/sites/${id}`);
        await askForChanges(reviewer, "The hero heading is last season's.");

        // 2. The owner publishes anyway. Never prevented — that is the design.
        await page.goto(`${urls.APP_URL}/sites/${id}`);
        // The pre-publish check says what is outstanding, and publishes anyway.
        const toast = await publishFromEditor(page);
        expect(toast).toMatch(/Recorded as published without approval/);

        // 3. The record, on the page a merchant would look at.
        await page.goto(`${urls.APP_URL}/sites/${id}/versions`);
        await expect(
            page
                .getByText(
                    /Published without approval by .+ a reviewer had asked for changes/i,
                )
                .first(),
        ).toBeVisible({ timeout: 30_000 });

        await reviewer.context().close();
    });
});

test.describe("taking a version back", { tag: "@serial" }, () => {
    /*
     * Restore copies a version into the DRAFT (owner, 20 Nov 2026): nothing
     * goes live until Publish, so a change request is not gone past and
     * the confirm says only that the draft is replaced.
     */
    test("asks first, and says it goes live only when you publish", async ({
        page,
    }) => {
        await signIn(page, demoUser);
        const id = await siteId(page);

        // A second version to restore — the seed publishes once, so without
        // this there is nothing but the live one and no Restore to press.
        await page.goto(`${urls.APP_URL}/sites/${id}`);
        await publishFromEditor(page);

        await page.goto(`${urls.APP_URL}/sites/${id}/versions`);
        const restore = page
            .getByRole("button", { name: /^Restore .+ as the draft$/ })
            .first();
        await expect(restore).toBeVisible({ timeout: 30_000 });
        await restore.click();
        await expect(
            page.getByText(
                "This replaces your draft with this version. It goes live only when you publish.",
            ),
        ).toBeVisible();

        // Cancelling leaves the draft where it was.
        await page.getByRole("button", { name: "Cancel" }).first().click();
        await expect(
            page.getByRole("button", { name: "Restore as the draft" }),
        ).toHaveCount(0);
    });

    test("puts the older version in the draft and leaves the live one live", async ({
        page,
    }) => {
        await signIn(page, demoUser);
        const id = await siteId(page);

        await page.goto(`${urls.APP_URL}/sites/${id}`);
        await publishFromEditor(page);

        await page.goto(`${urls.APP_URL}/sites/${id}/versions`);
        const main = page.getByRole("main");
        const liveBefore = await main
            .locator("div", { has: page.getByText("Live", { exact: true }) })
            .last()
            .textContent();

        const restore = page
            .getByRole("button", { name: /^Restore .+ as the draft$/ })
            .first();
        await expect(restore).toBeVisible({ timeout: 30_000 });
        await restore.click();
        await page
            .getByRole("button", { name: "Restore as the draft" })
            .click();

        // `.first()`: the shell mounts a toaster per breakpoint.
        await expect(
            page.getByText(/That version is your draft now/i).first(),
        ).toBeVisible({ timeout: 30_000 });

        // Nothing went live: the same one version is marked live.
        await expect(main.getByText("Live", { exact: true })).toHaveCount(1);
        await expect(
            main
                .locator("div", {
                    has: page.getByText("Live", { exact: true }),
                })
                .last(),
        ).toHaveText(liveBefore ?? "");
    });
});

test.describe(
    "the editor's status after a reload (G2)",
    { tag: "@serial" },
    () => {
        test("says what is not published yet, and nothing once it is", async ({
            page,
        }) => {
            await signIn(page, demoUser);
            const id = await siteId(page);
            await page.goto(`${urls.APP_URL}/sites/${id}`);

            /*
             * Read through Publish's title rather than the pill: another test in
             * this file can leave a change request open, and a review outranks
             * "Not published" in the pill. The title always says what goes live.
             */
            // Publish's title: on the bar on a phone too (DEC-185).
            const publishTitle = async () => {
                const publish = await publishButton(page);
                // Its hint is its description (`Tip`), not a `title`.
                // The Website area's phone bar says it in its name instead:
                // "Publish: 1 change waiting", or "Publish".
                return (
                    (await publish.getAttribute("aria-description")) ??
                    (await publish.getAttribute("aria-label"))
                );
            };
            const NOTHING =
                /^(Nothing has changed since the last publish|Publish)$/;
            // "Put live: 1 block …" today; the Website area counts changes.
            const WAITING =
                /^(Put live: .*block|Publish: \d+ changes? waiting)/;

            /*
             * Start from a draft that matches what is live, with the first block
             * showing. A run that stopped half way leaves that block hidden in
             * the draft, and a retry that flipped it again would only put it
             * back — "Nothing has changed", correctly — and fail for the first
             * run's reason, not its own.
             */
            await setFirstBlockHidden(page, false);
            await closeOverlays(page);
            await expect
                .poll(publishTitle, { timeout: 30_000 })
                .not.toMatch(/^Saving/);
            if (!NOTHING.test((await publishTitle()) ?? "")) {
                await publishFromEditor(page);
                await expect
                    .poll(publishTitle, { timeout: 30_000 })
                    .toMatch(NOTHING);
            }

            // One block's visibility flips; the autosave counts it.
            expect(await setFirstBlockHidden(page, true)).toBe(false);
            await closeOverlays(page);
            await expect
                .poll(publishTitle, { timeout: 30_000 })
                .toMatch(WAITING);

            // The count is the server's, so a reload says the same.
            await page.reload();
            await expect
                .poll(publishTitle, { timeout: 30_000 })
                .toMatch(WAITING);

            // Put it back, publish, and nothing is waiting.
            expect(await setFirstBlockHidden(page, false)).toBe(true);
            await closeOverlays(page);
            await expect(await publishButton(page)).toBeEnabled({
                timeout: 30_000,
            });
            await publishFromEditor(page);
            await expect
                .poll(publishTitle, { timeout: 30_000 })
                .toMatch(NOTHING);
        });
    },
);
