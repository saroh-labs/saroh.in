// @covers admin:/search-pages api:admin api:search-pages
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Search pages' deploy bar on the operator console (plan 2026-10-31-002,
 * R13): Publish only stages a page, the bar counts it and the row says it
 * isn't deployed yet; Unpublish before deploying takes it out of the count.
 *
 * Signed in as Sam (staff), a Platform owner, who holds
 * `search-pages:publish`. Deploy changes is never pressed: it would queue
 * a real rebuild job. Search pages are one list every console reader sees,
 * and the bar counts every staged page, so this is @serial; it ends with
 * nothing staged (the page reads Unpublished, which the site never saw).
 */
const ADMIN = urls.ADMIN_URL;
const PATH = "/for/tattoo-studios";
const NAME = "Tattoo studios";

interface StagedRecord {
    path: string;
    status: string;
    releasedStatus: string;
}

/** Takes the page back off if a failed run left it staged to go live. */
async function unstage(page: Page) {
    const res = await page.request.get(`${urls.API_URL}/admin/search-pages`);
    const pages = ((await res.json()) as { pages: StagedRecord[] }).pages;
    const r = pages.find((p) => p.path === PATH);
    if (r?.status !== "LIVE" || r.releasedStatus === "LIVE") return;
    const off = await page.request.post(
        `${urls.API_URL}/admin/search-pages/actions`,
        {
            headers: { origin: urls.APP_URL },
            data: { action: "unpublish", paths: [PATH] },
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
        "publishing stages a page for the bar; unpublishing it empties the bar",
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
                row.getByText("Published · not deployed yet", { exact: true }),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: "Deploy changes" }),
            ).toBeEnabled();

            // Unpublish before deploying: nothing is left to deploy.
            await actions.click();
            await page.getByRole("menuitem", { name: "Unpublish" }).click();
            await dialog
                .getByRole("button", { name: "Unpublish page" })
                .click();
            await expect(dialog).toHaveCount(0);

            await expect(
                page.getByText("No changes waiting to deploy", { exact: true }),
            ).toBeVisible();
            await expect(row.getByText(/not deployed yet/)).toHaveCount(0);
            await expect(
                page.getByRole("button", { name: "Deploy changes" }),
            ).toBeDisabled();
        },
    );
});
