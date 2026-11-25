// @covers app:/sites/[siteId]/write/[postId] api:content
import { expect, test } from "@playwright/test";
import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { websiteAreaOn } from "../fixtures/website-area";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The post editor's inserts and Find (W1, W2, W6, W8; editor missing
 * features, 22 Nov), behind the api's `WEBSITE_AREA`: "/" on an empty line
 * opens the add menu with the new blocks (no Video or Instagram), a
 * highlight box and contents go in and save in the sanitizer's shape, ⌘K
 * opens Find, and Search and sharing is changed in the right column.
 * Owns its post: a stamped title, deleted at the end.
 */

interface SiteRow {
    id: string;
}

test("Add: the / menu's new blocks save, Find opens, search and sharing in the column", async ({
    page,
}, testInfo) => {
    const phone = testInfo.project.name.startsWith("phone");
    test.skip(phone, "Desk menus; the phone Add sheet is unit-tested (Y1).");
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    const api = northwind(page.request);
    const site = (await api.get<SiteRow[]>("/sites")).at(0);
    test.skip(!site, "Northwind has no website.");
    if (!site) return;

    const title = `Inserts ${stamp(testInfo)}`;
    const made = await api.post<{ id: string }>(`/sites/${site.id}/posts`, {
        title,
        content: "<h2>Before you come</h2><p>Bring photos.</p><p></p>",
    });
    try {
        await page.goto(`/sites/${site.id}/posts/${made.id}`);
        test.skip(
            !(await websiteAreaOn(page)),
            "The Website area is off: today's post editor",
        );
        // A streamed redirect (a loading boundary above): it can land after load.
        await page.waitForURL((u) => u.href.includes(`/write/${made.id}`));

        // W1: "/" on the empty last line opens the menu, and filters.
        const body = page.locator("[data-writing-surface] .ProseMirror");
        await body.locator("p").last().click();
        await page.keyboard.press("/");
        const filter = page.getByRole("textbox", { name: "Type to filter" });
        await expect(filter).toBeVisible();
        const menu = page.getByRole("listbox", { name: "Add to the post" });
        for (const name of [
            "Offer",
            "Book now button",
            "Highlight box",
            "Contents",
            "Gallery",
            "Button",
        ]) {
            await expect(menu.getByRole("option", { name })).toBeVisible();
        }
        await expect(menu.getByRole("option", { name: /Video/ })).toHaveCount(
            0,
        );
        await filter.fill("contents");
        await page.keyboard.press("Enter");
        await expect(body.locator("[data-post-block=contents]")).toContainText(
            "Before you come",
        );

        // Saved in the shape the sanitizer keeps.
        await expect
            .poll(
                async () =>
                    (
                        await api.get<{ content: string }>(
                            `/sites/${site.id}/posts/${made.id}`,
                        )
                    ).content,
                { timeout: 15_000 },
            )
            .toContain('<div data-contents="headings"></div>');

        // W6: ⌘K opens Find, which opens Search and sharing (W8: in the column).
        await page.keyboard.press("ControlOrMeta+k");
        const find = page.getByRole("dialog", { name: "Find or do anything" });
        await find.getByRole("combobox").fill("google");
        await page.keyboard.press("Enter");
        // Search and sharing opens in place (W8): its fields, no dialog.
        await expect(page.getByLabel("Title in search")).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
        await api.delete(`/sites/${site.id}/posts/${made.id}`);
    }
});
