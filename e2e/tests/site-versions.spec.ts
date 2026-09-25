import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

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
 * Restore is the other half. It puts an older snapshot live, so it can go past
 * an outstanding change request the same way a publish can, and #279 asks it
 * to say so before it happens rather than after.
 *
 * These run against the seeded stack and CHANGE it: they publish, and they
 * restore. Written to survive that — nothing asserts a count of versions or
 * which one is live at the start, only the difference the actions make.
 */

async function signIn(page: Page, who: { email: string; password: string }) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
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
    await page.goto(`${urls.APP_URL}/sites`);
    await page.waitForURL(/\/sites\/[^/]+\/pages/, { timeout: 30_000 });
    await expect(page.getByRole("main")).toContainText(REVIEWED_SITE, {
        timeout: 30_000,
    });
    const href = page.url();
    const id = /\/sites\/([^/]+)\//.exec(href)?.[1];
    // Asserted rather than defaulted: an empty id would send every step below
    // to a different, wrong URL and fail somewhere that says nothing.
    if (id === undefined) {
        throw new Error(`no site id in the address: ${href}`);
    }
    return id;
}

/**
 * Publish from the editor, through the pre-publish check, and wait until it
 * has happened. Returns what the success toast said.
 *
 * Waited for, not counted: the check opens a beat after the click, so the
 * `if (await confirm.count())` this replaces read 0, skipped the publish, and
 * the test went looking for a record of something that never happened.
 * Pressed until the check opens, too: a press before hydration does nothing.
 */
async function publishFromEditor(page: Page): Promise<string> {
    const confirm = page
        .getByRole("button", {
            name: /^Publish (changes|site|without approval)$/,
        })
        // The check's own button, drawn after the editor's "Publish".
        .last();
    await expect(async () => {
        await page
            .getByRole("button", { name: /^Publish/ })
            .first()
            .click();
        await expect(confirm).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await confirm.click();
    const live = page
        .getByText(/ is live/)
        .locator("visible=true")
        .first();
    await expect(live).toBeVisible({ timeout: 30_000 });
    return live.innerText();
}

test.describe("publishing past a change request", () => {
    test("is recorded in version history, with who did it", async ({
        page,
        browser,
    }) => {
        await signIn(page, demoUser);
        const id = await siteId(page);

        // 1. The reviewer asks for changes.
        const reviewer = await asReviewer(browser);
        await reviewer.goto(`${urls.APP_URL}/sites/${id}/review`);
        await reviewer.getByRole("button", { name: "Ask for changes" }).click();
        await expect(
            reviewer.getByText(/asked for changes/i).first(),
        ).toBeVisible();

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

test.describe("taking a version back", () => {
    test("asks first, and says what restoring would go past", async ({
        page,
        browser,
    }) => {
        await signIn(page, demoUser);
        const id = await siteId(page);

        // A second version to restore TO — the seed publishes once, so without
        // this there is nothing but the live one and no Restore to press.
        await page.goto(`${urls.APP_URL}/sites/${id}`);
        await publishFromEditor(page);

        const reviewer = await asReviewer(browser);
        await reviewer.goto(`${urls.APP_URL}/sites/${id}/review`);
        await reviewer.getByRole("button", { name: "Ask for changes" }).click();
        await expect(
            reviewer.getByText(/asked for changes/i).first(),
        ).toBeVisible();

        await page.goto(`${urls.APP_URL}/sites/${id}/versions`);

        const restore = page.getByRole("button", { name: "Restore" }).first();
        await expect(restore).toBeVisible({ timeout: 30_000 });
        await restore.click();

        /*
         * Never a one-click revert: putting an older snapshot live undoes
         * everything published since, and the confirm is the only place that
         * is said. With a change request outstanding it says MORE than "yes,
         * restore" — restoring would go past it (#279).
         */
        await expect(
            page.getByRole("button", { name: "Restore without approval" }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Cancel" }).first(),
        ).toBeVisible();

        // Cancelling leaves the live version where it was.
        await page.getByRole("button", { name: "Cancel" }).first().click();
        await expect(
            page.getByRole("button", { name: "Restore without approval" }),
        ).toHaveCount(0);

        await reviewer.context().close();
    });

    test("puts the older version live, and says which one is live now", async ({
        page,
    }) => {
        await signIn(page, demoUser);
        const id = await siteId(page);

        await page.goto(`${urls.APP_URL}/sites/${id}`);
        await publishFromEditor(page);

        await page.goto(`${urls.APP_URL}/sites/${id}/versions`);

        /*
         * "Live" is a marked badge, not the top row — after a restore the live
         * version is not the newest by content, and a list that implied
         * otherwise would be lying about what visitors are seeing.
         */
        const live = page.locator("div", { has: page.getByText("Live") });
        await expect(live.first()).toBeVisible();

        const restore = page.getByRole("button", { name: "Restore" }).first();
        await expect(restore).toBeVisible({ timeout: 30_000 });
        await restore.click();
        await page
            .getByRole("button", {
                name: /^(Yes, restore|Restore without approval)$/,
            })
            .click();

        // `.first()`: the shell mounts a toaster per breakpoint, so a toast is
        // in the DOM twice and only one of them is the visible one.
        await expect(
            page.getByText(/That version is live again/i).first(),
        ).toBeVisible({ timeout: 30_000 });

        // Still exactly one version marked live afterwards — a restore moves
        // the badge, it does not add a second.
        await expect(
            page.getByRole("main").getByText("Live", { exact: true }),
        ).toHaveCount(1);
    });
});
