// @covers app:/sites/[siteId]/posts app:/sites/[siteId]/posts/new api:content
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * A new post survives its first save.
 *
 * The first autosave moves a new post to its own address, and the remount
 * has the rich-text editor's `useEditor` destroy its editor and make another.
 * The surface's sync effect ran first against the destroyed one and threw
 * (`Cannot read properties of null (reading 'commands')`), so 2.5 seconds
 * after a merchant stopped typing the post editor became "Couldn't load your
 * website". Reached the way a merchant reaches it: from the posts list, by
 * its New post link.
 *
 * Owns its post: a stamped title, deleted at the end.
 */

interface SiteRow {
    id: string;
}

test("a new post keeps its editor through the first save", async ({
    page,
}, testInfo) => {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    const api = northwind(page.request);
    const [site] = await api.get<SiteRow[]>("/sites");
    test.skip(!site, "Northwind has no website.");
    if (!site) return;

    const title = `Autosave ${stamp(testInfo)}`;
    let postId: string | undefined;
    try {
        await page.goto(`/sites/${site.id}/posts`);
        await page.getByRole("link", { name: "New post" }).click();

        const titleBox = page.getByRole("textbox", { name: "Post title" });
        await titleBox.fill(title);
        const body = page.locator('[contenteditable="true"]').first();
        await body.click();
        await page.keyboard.type("The first words.");

        // The first save moves the post to its own address.
        await expect(page).toHaveURL(/\/posts\/(?!new\b)[^/?#]+$/, {
            timeout: 15_000,
        });
        postId = new URL(page.url()).pathname.split("/").pop();

        await expect(
            page.getByRole("heading", { name: "Couldn't load your website" }),
        ).toHaveCount(0);
        await expect(titleBox).toHaveValue(title);
        await expect(body).toContainText("The first words.");

        // And the remade editor still takes typing.
        await body.click();
        await page.keyboard.press("End");
        await page.keyboard.type(" And more.");
        await expect(body).toContainText("The first words. And more.");
    } finally {
        if (postId) await api.delete(`/sites/${site.id}/posts/${postId}`);
    }
});
