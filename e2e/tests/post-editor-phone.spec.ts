// @covers app:/sites/[siteId]/posts/new app:/sites/[siteId]/write/new app:/sites/[siteId]/write/[postId] api:content
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { websiteAreaOn } from "../fixtures/website-area";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The post editor on a phone (plan 2026-11-20-002 U16, `blogphone/WXYWrite`,
 * `WXYDetails`, `WXYMore`, `WXYStates`), behind the api's `WEBSITE_AREA`:
 * at 390 and the 320 floor the bar and the writing tools fit with 44px
 * targets and nothing scrolls sideways; a post needs a title; Details'
 * Save writes its fields in one save; Delete asks in today's words.
 * Owns its post: a stamped title, deleted by the test itself (or at the
 * end if a step fails).
 */

interface SiteRow {
    id: string;
}
interface PostRow {
    excerpt: string | null;
}

const SIZES = [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
];

/** Every control in `scope` narrower or shorter than a thumb. */
async function short(scope: Locator): Promise<string[]> {
    return scope.evaluate((root) =>
        Array.from(root.querySelectorAll("button, a"))
            .filter((b) => {
                const r = b.getBoundingClientRect();
                return r.width > 0 && (r.width < 44 || r.height < 44);
            })
            .map((b) => b.getAttribute("aria-label") ?? b.textContent.trim()),
    );
}

const fits = (page: Page) =>
    page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
    );

for (const size of SIZES) {
    test.describe(`the phone post editor at ${size.width}`, () => {
        test.use({ viewport: size });

        test("fits, needs a title, saves Details once, and deletes asking first", async ({
            page,
        }, testInfo) => {
            test.skip(
                !testInfo.project.name.startsWith("phone"),
                "A phone board; the desk post editor is post-editor.spec.ts.",
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
            const editor = page.locator("[data-phone-post-editor]");
            const bar = editor.locator("[data-post-bar]");
            const tools = editor.getByRole("toolbar", {
                name: "Writing tools",
            });
            await expect(bar).toBeVisible();
            await expect(tools).toBeVisible();
            await expect(bar.locator("[data-saved-line]")).toHaveText(
                "New post",
            );

            // Publish with no title asks for one and sends nothing.
            await bar.getByRole("button", { name: "Publish" }).click();
            await expect(editor.getByRole("alert")).toContainText(
                "A post needs a title.",
            );

            const title = `Phone post ${stamp(testInfo)}`;
            let postId: string | undefined;
            try {
                await editor
                    .getByRole("textbox", { name: "Post title" })
                    .fill(title);
                await editor
                    .locator('[contenteditable="true"]')
                    .first()
                    .click();
                await page.keyboard.type("Written on a phone.");
                await expect(page).toHaveURL(/\/write\/(?!new\b)[^/?#]+$/, {
                    timeout: 15_000,
                });
                postId = new URL(page.url()).pathname.split("/").pop();
                await expect(bar.locator("[data-saved-line]")).toHaveText(
                    "Saved",
                    { timeout: 15_000 },
                );
                await expect(bar.locator("[data-status-chip]")).toHaveText(
                    "Not live yet",
                );

                // A thumb's height everywhere, the tools in view, nothing
                // sideways.
                expect(await short(bar)).toEqual([]);
                expect(await short(tools)).toEqual([]);
                const box = await tools.boundingBox();
                expect(box && box.y + box.height).toBeLessThanOrEqual(
                    size.height,
                );
                await expect(fits(page)).resolves.toBe(true);

                // Format swaps in the panel, with More formatting kept (C10).
                await tools.getByRole("button", { name: "Format" }).click();
                const panel = editor.getByRole("group", { name: "Format" });
                await expect(panel).toBeVisible();
                await expect(
                    panel.getByRole("button", { name: /More formatting/ }),
                ).toBeVisible();
                await tools.getByRole("button", { name: "Format" }).click();

                // Details: every field, one Save.
                await bar.getByRole("button", { name: "Details" }).click();
                const details = page.getByRole("dialog", { name: "Details" });
                await expect(details).toContainText(
                    "Saved · goes live when you publish",
                );
                await expect(details).toContainText("Search and sharing");
                const words = "Ninety minutes, two weeks before.";
                await details.getByLabel("Short description").fill(words);
                await details.getByRole("button", { name: "Save" }).click();
                await expect(details).toHaveCount(0);
                await expect
                    .poll(
                        async () =>
                            (
                                await api.get<PostRow>(
                                    `/sites/${site.id}/posts/${postId}`,
                                )
                            ).excerpt,
                        { timeout: 15_000 },
                    )
                    .toBe(words);

                // More › Delete this post… asks in today's words, then goes.
                await bar.getByRole("button", { name: /^More:/ }).click();
                const more = page.getByRole("dialog", { name: "This post" });
                await more
                    .getByRole("button", { name: /Delete this post/ })
                    .click();
                await expect(more).toContainText(
                    "It has never been published, so nobody outside your team has seen it. This cannot be undone.",
                );
                await more.getByRole("button", { name: "Delete post" }).click();
                await expect(page).toHaveURL(/\/writing$/, {
                    timeout: 15_000,
                });
                postId = undefined;
            } finally {
                if (postId)
                    await api.delete(`/sites/${site.id}/posts/${postId}`);
            }
        });
    });
}
