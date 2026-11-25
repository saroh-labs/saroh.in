// @covers app:/sites/[siteId]/posts app:/sites/[siteId]/posts/new app:/sites/[siteId]/write/new app:/sites/[siteId]/write/[postId] api:content
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { websiteAreaOn } from "../fixtures/website-area";
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
    const site = (await api.get<SiteRow[]>("/sites")).at(0);
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

        // The first save moves the post to its own address (the desk
        // editor's `/write/<id>` with the Website area on).
        await expect(page).toHaveURL(/\/(posts|write)\/(?!new\b)[^/?#]+$/, {
            timeout: 15_000,
        });
        postId = new URL(page.url()).pathname.split("/").pop();

        await expect(
            // The Website boundary's title.
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

/**
 * The desk post editor (plan 2026-11-20-002 U15, `blogdesk/WXWWrite`,
 * `WXWSearch`, `WXWStates`), behind the api's `WEBSITE_AREA`: today's
 * New post forwards to `/write/new`; a post needs a title before it saves
 * or publishes; it autosaves and says so; its page link lives in Search
 * and sharing. Owns its post: a stamped title, deleted at the end.
 */
for (const size of [
    { name: "1920", viewport: { width: 1920, height: 1080 } },
    { name: "1440", viewport: { width: 1440, height: 900 } },
]) {
    test.describe(`the desk post editor at ${size.name}`, () => {
        test.use({ viewport: size.viewport });

        test("title first, autosave, and the page link in Search and sharing", async ({
            page,
        }, testInfo) => {
            test.skip(
                testInfo.project.name.startsWith("phone"),
                "A desk board; the phone post editor is U16's.",
            );
            await useSession(page);
            await page.goto(`/open/${NORTHWIND_ORG}`);
            const api = northwind(page.request);
            const site = (await api.get<SiteRow[]>("/sites")).at(0);
            test.skip(!site, "Northwind has no website.");
            if (!site) return;

            await page.goto(`/sites/${site.id}/posts/new`);
            test.skip(
                !(await websiteAreaOn(page)),
                "The Website area is off: today's post editor",
            );
            // A streamed redirect (a loading boundary above): it can land after load.
            await page.waitForURL((u) => u.href.includes("/write/new"));
            const bar = page.locator("[data-post-bar]");
            await expect(
                bar.getByRole("link", { name: "Back to Website" }),
            ).toBeVisible();

            // Publish post with no title asks for one and sends nothing.
            await bar
                .getByRole("button", { name: "Publish post", exact: true })
                .click();
            await expect(page.getByRole("alert")).toContainText(
                "A post needs a title.",
            );

            const title = `Desk post ${stamp(testInfo)}`;
            let postId: string | undefined;
            try {
                await page
                    .getByRole("textbox", { name: "Post title" })
                    .fill(title);
                await page.locator('[contenteditable="true"]').first().click();
                await page.keyboard.type("Written at the desk.");
                await expect(page).toHaveURL(/\/write\/(?!new\b)[^/?#]+$/, {
                    timeout: 15_000,
                });
                postId = new URL(page.url()).pathname.split("/").pop();
                await expect(page.locator("[data-saved-line]")).toContainText(
                    "Saved",
                    { timeout: 15_000 },
                );
                await expect(page.locator("[data-status-chip]")).toHaveText(
                    "Not live yet",
                );

                // The left panel is this post only (`EBPostLeftPanel`);
                // posts switch from the top picker, each with its state.
                const panel = page.getByRole("complementary", {
                    name: "In this post",
                });
                await expect(
                    panel.getByRole("list", { name: "Outline of this post" }),
                ).toBeVisible();
                await expect(panel.locator('a[href*="/write/"]')).toHaveCount(
                    0,
                );
                await bar
                    .getByRole("button", { name: /Open another post$/ })
                    .click();
                const picked = page
                    .getByRole("navigation", { name: "Posts" })
                    .locator('a[aria-current="page"]');
                await expect(picked).toContainText(title);
                await expect(picked).toContainText("Not live yet");
                await page.keyboard.press("Escape");

                // The page link is in Search and sharing (RULES §1).
                await page
                    .getByRole("tab", { name: "Search and sharing" })
                    .click();
                // Changed in place, beside the post (W8), with the previews.
                await expect(page.getByLabel("Page link")).toBeVisible();
                await expect(
                    page.getByText("when someone shares the link"),
                ).toBeVisible();
                await expect(
                    page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <=
                            window.innerWidth,
                    ),
                ).resolves.toBe(true);
            } finally {
                if (postId)
                    await api.delete(`/sites/${site.id}/posts/${postId}`);
            }
        });
    });
}
