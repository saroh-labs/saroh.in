// @covers admin:/search-pages api:admin api:search-pages
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Search pages' deploy bar on the operator console (plan 2026-10-31-002,
 * R13): Publish only stages a page, the bar counts it and the row says it
 * waits to deploy; Cancel this change before deploying (DEC-201
 * amendment, 1 Nov) puts it back as a draft and empties the bar.
 *
 * Signed in as Sam (staff), a Platform owner, who holds
 * `search-pages:publish`. Deploy changes is never pressed: it would queue
 * a real rebuild job. Search pages are one list every console reader sees,
 * and the bar counts every staged page, so this is @serial; it ends with
 * nothing staged (the page is back to what the site has).
 */
const ADMIN = urls.ADMIN_URL;
const PATH = "/for/tattoo-studios";
const NAME = "Tattoo studios";

interface StagedRecord {
    path: string;
    status: string;
    releasedStatus: string;
}

/** Cancels the change if a failed run left the page staged to go live. */
async function unstage(page: Page) {
    const res = await page.request.get(`${urls.API_URL}/admin/search-pages`);
    const pages = ((await res.json()) as { pages: StagedRecord[] }).pages;
    const r = pages.find((p) => p.path === PATH);
    if (r?.status !== "LIVE" || r.releasedStatus === "LIVE") return;
    const off = await page.request.post(
        `${urls.API_URL}/admin/search-pages/actions`,
        {
            headers: { origin: urls.APP_URL },
            data: { action: "cancel", paths: [PATH] },
        },
    );
    expect(off.ok()).toBe(true);
}

test.describe("Search pages: publish, then deploy", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page, "staff");
        await unstage(page);
    });
    test.afterEach(async ({ page }) => {
        await unstage(page);
    });

    test(
        "publishing stages a page for the bar; cancelling the change empties the bar",
        { tag: "@serial" },
        async ({ page }) => {
            await page.goto(`${ADMIN}/search-pages`);
            await expect(
                page.getByRole("heading", { level: 1, name: "Search pages" }),
            ).toBeVisible();
            await expect(
                page.getByText("No changes waiting to deploy", { exact: true }),
            ).toBeVisible();

            // The table's list; a dialog's list of pages has the same name.
            const row = page
                .getByRole("list", { name: "Pages" })
                .first()
                .getByRole("listitem")
                .filter({ hasText: PATH });
            const actions = row.getByRole("button", {
                name: `Actions for ${NAME}`,
            });
            const dialog = page.getByRole("dialog");

            // Publish: it asks that the page was read first.
            const publish = page.getByRole("menuitem", {
                name: /^Publish on /,
            });
            await pressUntil(actions, publish);
            await publish.click();
            await dialog.getByRole("checkbox").check();
            await dialog.getByRole("button", { name: "Publish page" }).click();
            await expect(dialog).toHaveCount(0);

            await expect(
                page.getByText("1 change waiting to deploy", { exact: true }),
            ).toBeVisible();
            await expect(
                page.getByRole("list", { name: "Changes waiting" }),
            ).toContainText(PATH);
            await expect(
                row.getByText("Waiting to deploy", { exact: true }),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: "Deploy changes" }),
            ).toBeEnabled();

            // Cancel this change before deploying: nothing is left to deploy.
            await actions.click();
            await page
                .getByRole("menuitem", { name: "Cancel this change" })
                .click();
            await dialog
                .getByRole("button", { name: "Cancel the change" })
                .click();
            await expect(dialog).toHaveCount(0);

            await expect(
                page.getByText("No changes waiting to deploy", { exact: true }),
            ).toBeVisible();
            await expect(row.getByText("Waiting to deploy")).toHaveCount(0);
            await expect(
                page.getByRole("button", { name: "Deploy changes" }),
            ).toBeDisabled();
        },
    );
});
