import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    demoReviewer,
    demoUser,
    ignoreHTTPSErrors,
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

/** The seeded site's id, read from the owner's list. */
async function siteId(page: Page): Promise<string> {
    await page.goto(`${urls.APP_URL}/sites`);
    const href = await page
        .getByRole("main")
        .getByRole("link", { name: REVIEWED_SITE })
        .first()
        .getAttribute("href");
    const id = href?.split("/sites/")[1];
    // Asserted rather than defaulted: an empty id would send every step below
    // to a different, wrong URL and fail somewhere that says nothing.
    if (id === undefined || id === "") {
        throw new Error(`no site id in the list link: ${href ?? "(no link)"}`);
    }
    return id;
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
        await page
            .getByRole("button", { name: /^Publish/ })
            .first()
            .click();
        // The pre-publish check says what is outstanding and publishes anyway.
        const confirm = page.getByRole("button", {
            name: /Publish (anyway|without approval)/i,
        });
        if (await confirm.count()) await confirm.first().click();

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
        await page
            .getByRole("button", { name: /^Publish/ })
            .first()
            .click();
        const publishAnyway = page.getByRole("button", {
            name: /Publish (anyway|without approval)/i,
        });
        if (await publishAnyway.count()) await publishAnyway.first().click();

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
        await page
            .getByRole("button", { name: /^Publish/ })
            .first()
            .click();
        const publishAnyway = page.getByRole("button", {
            name: /Publish (anyway|without approval)/i,
        });
        if (await publishAnyway.count()) await publishAnyway.first().click();

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
