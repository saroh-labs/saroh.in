// @covers accounts:/login app:/open app:/sites app:/sites/new app:/sites/[siteId] app:/sites/[siteId]/review app:/sites/[siteId]/releases/[releaseId] app:/sites/[siteId]/posts/[postId] site:/preview api:sites api:content pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp as ownStamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import {
    approve,
    askForChanges,
    changeYourReview,
    expectNoWriteControl,
    noteBoxForFirstBlock,
    onPhone,
    openPhoneMenu,
    openReviewedSite,
    openTestReleases,
} from "../fixtures/reviewer-editor";
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
 * Review, as the person it was built for (#287).
 *
 * REVIEWER is the narrowest role in the product and the one nothing could
 * check: it has its own screen, its own list scoping and its own refusals, and
 * until the seed grew a reviewer there was nobody to sign in as. That absence
 * is part of why #274 — every website route, Review included, returning 404 to
 * this role the moment module enforcement came on — survived a green suite.
 *
 * Since DEC-200 a reviewer reads in the site editor itself, read-only, and
 * notes and the verdict are the editor's Feedback and top bar (a phone's
 * Feedback pill and Review sheet). The old reading screen is gone; its
 * address redirects to the editor.
 *
 * These are questions only a browser can answer. Whether the list a reviewer
 * sees holds one site or three is a query the server builds from a session
 * cookie; whether the editor opens read-only is the server's answer to who
 * they are; whether a shared link says "not live" is a page rendered by a
 * different app on a different origin. The unit tests prove the policy. This
 * proves the product.
 */

async function signIn(page: Page, who: { email: string; password: string }) {
    await useSession(page, who);
}

/** Northwind's API at its full address, for a request that may be refused. */
const nwUrl = (path: string) =>
    `${urls.API_URL}/organizations/${NORTHWIND_ORG}${path}`;

test.describe("a reviewer", () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page, demoReviewer);
    });

    test("sees only the site they were invited to", async ({ page }) => {
        await openReviewedSite(page);

        // The reviewer is granted the business's site. With one site and no
        // right to make another, there is nothing to pick. That a reviewer
        // sees only the sites they were granted, when a business has several,
        // is `reviewer-scope.spec.ts` in the API.
        if (!onPhone(page)) {
            await expect(page.locator("[data-editor-bar]")).toContainText(
                REVIEWED_SITE,
            );
        }
        await expect(
            page.getByRole("button", { name: /^Website: .*Change it\.$/ }),
        ).toHaveCount(0);
    });

    test("is offered nothing in the rail that they cannot open", async ({
        page,
    }) => {
        // Home, where the workspace's rail is: the editor is full-bleed.
        await page.goto(`${urls.APP_URL}/`);

        /*
         * The rail is not a permission boundary — every destination refuses on
         * its own, and it still does. It is a description of the workspace
         * someone has, and it was describing one they do not: Notifications,
         * Organization and People answer "You can't open this",
         * Providers named the payment and messaging providers the business runs
         * on, and "New site" leads to a form that fails on submit (#313).
         */
        /*
         * Below 760px the rail is not drawn and the phone TAB BAR carries the
         * nav — so which navigation this test reads has to be chosen, not
         * filtered for. Both draw the same groups from the same projection,
         * which is the point of having one `navFor`; running at both widths
         * is what proves the bar did not keep its own copy.
         */
        const rail = onPhone(page)
            ? page.getByRole("navigation", { name: "Main" })
            : page.getByRole("navigation", { name: "Primary" });
        // The nav is drawn before anything is said to be missing from it.
        await expect(rail.getByRole("link", { name: "Website" })).toBeVisible();
        if (onPhone(page)) {
            // Home and Website are all a reviewer reaches, and both fit on
            // the bar — so there is no More sheet holding anything else.
            await expect(
                rail.getByRole("button", { name: /^More/ }),
            ).toHaveCount(0);
        }
        for (const gone of [
            "/notifications",
            "/settings",
            "/settings/organization",
            "/settings/people",
            "/settings/modules",
            "/settings/integrations",
            "/sites/new",
        ]) {
            await expect(rail.locator(`a[href="${gone}"]`)).toHaveCount(0);
        }

        // What is left is Website, one row: which site is on the Website
        // screen rather than hung under it.
        await expect(rail.locator('a[href^="/sites/"]')).toHaveCount(0);
    });

    test("lands in the editor, read-only, and is told so", async ({ page }) => {
        const id = await openReviewedSite(page);

        // The editor itself (DEC-200), not the old reading screen.
        expect(new URL(page.url()).pathname).toBe(`/sites/${id}`);
        if (onPhone(page)) {
            // The verdict where Publish sits for an owner: today's bar's
            // Review, or with the Website area on the reader bar under a
            // "Read only" line (`fix/WXNStates`).
            await expect(
                page
                    .getByRole("button", { name: "Review", exact: true })
                    .or(page.locator("[data-reader-bar]")),
            ).toBeVisible();
            await expect(
                page
                    .getByRole("button", { name: /^Feedback, / })
                    .or(page.locator("[data-read-only-line]")),
            ).toBeVisible();
        } else {
            // "Read only" with the Website area on (`fix/WXMReviewer`).
            await expect(page.locator("[data-reviewing]")).toHaveText(
                /^(Reviewing · you can’t change anything|Read only)$/,
            );
        }

        // The old screen's address, in emails and on Home, opens the editor.
        await page.goto(`${urls.APP_URL}/sites/${id}/review`);
        await expect(page).toHaveURL(new RegExp(`/sites/${id}$`));
    });

    test("is offered no write control, at either width", async ({ page }) => {
        await openReviewedSite(page);
        await expectNoWriteControl(page);

        // Nor in the block's own panel, once one is chosen.
        await noteBoxForFirstBlock(page);
        await expectNoWriteControl(page);
        await expect(page.locator("[draggable=true]")).toHaveCount(0);
    });

    test("is refused a direct write to the draft (403)", async ({ page }) => {
        const id = await openReviewedSite(page);
        const nw = northwind(page.request);
        const site = await nw.get<{ pages: { id: string; isHome: boolean }[] }>(
            `/sites/${id}`,
        );
        const home = site.pages.find((p) => p.isHome) ?? site.pages[0];

        /*
         * The API is the guard (DEC-200), whatever the screen draws. The
         * revision is one the draft never reached, so even a broken guard
         * would be refused (409) rather than empty the page.
         */
        const res = await page.request.put(
            nwUrl(`/sites/${id}/pages/${home.id}/draft/sections`),
            {
                headers: nw.headers,
                data: { revision: 999_999_999, sections: [] },
            },
        );
        expect(res.status()).toBe(403);
    });

    // @serial: it reads the site's first block, which site-versions hides
    // and puts back.
    test(
        "reads the page itself, not a list of page titles",
        {
            tag: "@serial",
        },
        async ({ page }) => {
            await openReviewedSite(page);

            // The seeded home page's own copy, rendered through the real
            // blocks on the editor's canvas.
            await expect(
                page
                    .getByText("Packaging, storage and safety supplies")
                    .first(),
            ).toBeVisible();
        },
    );

    test("notes a block, changes the note and deletes it; it survives a reload", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        const id = await openReviewedSite(page);
        const nw = northwind(page.request);
        const body = `Opening hours look wrong — ${ownStamp(test.info())}`;
        const changed = `${body} (Sundays too)`;
        try {
            const box = await noteBoxForFirstBlock(page);
            await box.fill(body);
            await page
                .getByRole("button", { name: "Add note" })
                .filter({ visible: true })
                .click();
            const note = page
                .getByRole("listitem")
                .filter({ hasText: body })
                .filter({ visible: true });
            await expect(note).toBeVisible({ timeout: 30_000 });

            // Your own open note: Edit, then Save.
            await note.getByRole("button", { name: "Edit your note" }).click();
            await note.getByLabel("Your note").fill(changed);
            await note.getByRole("button", { name: "Save note" }).click();
            const changedNote = page
                .getByRole("listitem")
                .filter({ hasText: changed })
                .filter({ visible: true });
            await expect(changedNote).toBeVisible({ timeout: 30_000 });

            // Saved on the server: it comes back after a reload.
            await page.reload();
            await expect(page.locator("[data-layout]")).toBeVisible({
                timeout: 30_000,
            });
            await noteBoxForFirstBlock(page);
            await expect(changedNote).toBeVisible({ timeout: 30_000 });

            // And Delete, after a confirm.
            await changedNote
                .getByRole("button", { name: "Delete your note" })
                .click();
            await page.getByRole("button", { name: "Delete note" }).click();
            await expect(
                page.getByText(changed).filter({ visible: true }),
            ).toHaveCount(0, { timeout: 30_000 });
        } finally {
            // A note a failed step left behind is this test's to take away.
            const left = (
                await nw.get<{ id: string; body: string }[]>(
                    `/sites/${id}/comments`,
                )
            ).filter((c) => c.body.startsWith(body));
            for (const c of left) {
                await nw.delete(`/sites/${id}/comments/${c.id}`);
            }
        }
    });

    test("reads a draft post read-only, and notes it", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        // The owner makes a draft post of this test's own.
        const ownerContext = await browser.newContext({ ignoreHTTPSErrors });
        const owner = await ownerContext.newPage();
        await useSession(owner);
        const ownerApi = northwind(owner.request);
        const siteId = (
            await ownerApi.get<{ id: string; subdomain: string | null }[]>(
                "/sites",
            )
        ).find((s) => s.subdomain === "northwind")?.id;
        expect(siteId, "Northwind has its site at northwind").toBeTruthy();
        const title = `Spring stock ${ownStamp(testInfo)}`;
        const post = await ownerApi.post<{ id: string }>(
            `/sites/${siteId}/posts`,
            { title },
        );
        try {
            await page.goto(`${urls.APP_URL}/sites/${siteId}/posts/${post.id}`);
            // "Read only" in the Website area's post editor (WXYStates).
            await expect(
                page
                    .getByText("Reviewing · you can't change anything")
                    .or(page.locator("[data-reviewing]"))
                    .or(page.getByText("Read only", { exact: true }))
                    .filter({ visible: true })
                    .first(),
            ).toBeVisible({ timeout: 30_000 });
            await expect(
                page.getByRole("textbox", { name: "Post title" }),
            ).not.toBeEditable();
            for (const gone of [/^Publish/, "Save draft"]) {
                await expect(
                    page.getByRole("button", { name: gone }),
                ).toHaveCount(0);
            }

            // Feedback is open for a Reviewer; the note is on the post.
            const note = `The second paragraph repeats the first — ${ownStamp(testInfo)}`;
            const box = page.getByLabel(`Add a note on ${title}`);
            if (onPhone(page) && !(await box.isVisible())) {
                // The Website area's phone post editor: Feedback is a
                // sheet, from ⋯ More's "This post" (`blogphone/WXYMore`).
                const more = page.getByRole("dialog", { name: "This post" });
                await pressUntil(
                    page.getByRole("button", { name: /^More: preview/ }),
                    more,
                );
                await pressUntil(
                    more.getByRole("button", { name: /^Feedback/ }),
                    box,
                );
            }
            await box.fill(note);
            await page.getByRole("button", { name: "Add note" }).click();
            await expect(page.getByText(note)).toBeVisible({ timeout: 30_000 });
        } finally {
            // Its notes go with it.
            await ownerApi.delete(`/sites/${siteId}/posts/${post.id}`);
            await ownerContext.close();
        }
    });
});

/**
 * The verdict, recorded (DEC-200, U4/U5): the top bar's on a desk, the
 * Review sheet's on a phone. `@serial`: a verdict on Northwind's draft is
 * read by every site spec, and an approval locks the notes before it.
 */
test.describe("a reviewer's verdict", { tag: "@serial" }, () => {
    test("asks for changes with a reason, and the owner's editor shows it", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        await signIn(page, demoReviewer);
        const id = await openReviewedSite(page);
        const reason = `The opening hours are last season's — ${ownStamp(testInfo)}`;
        await askForChanges(page, reason);

        // The owner, at the desk, reads it where they publish from.
        const ownerContext = await browser.newContext({
            ignoreHTTPSErrors,
            viewport: { width: 1440, height: 900 },
        });
        try {
            const owner = await ownerContext.newPage();
            await useSession(owner);
            await owner.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
            await owner.goto(`${urls.APP_URL}/sites/${id}`);
            const sheet = owner.locator("[data-publish-sheet]");
            const publish = owner
                .getByRole("button", { name: /^Publish/ })
                .filter({ visible: true })
                .first();
            await expect(publish).toBeEnabled({ timeout: 30_000 });
            await pressUntil(publish, sheet);
            await expect(sheet).toContainText(reason);
            await expect(sheet).toContainText("asked for changes");
            // Read, not published.
            await owner.keyboard.press("Escape");
            await expect(sheet).toHaveCount(0);
        } finally {
            await ownerContext.close();
        }
    });

    test("approves, and the approval stays after a reload", async ({
        page,
    }) => {
        await signIn(page, demoReviewer);
        await openReviewedSite(page);
        await approve(page);

        await page.reload();
        await expect(page.locator("[data-layout]")).toBeVisible({
            timeout: 30_000,
        });
        await expect(await changeYourReview(page)).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByText(/^You approved this on /).filter({ visible: true }),
        ).toBeVisible();
    });
});

test.describe("a shared preview link", () => {
    test("opens the draft with a bar that says it is not live", async ({
        page,
        context,
    }) => {
        await signIn(page, demoUser);
        await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
        // Website opens on the business's one site (ADR-006), in the editor.
        await openReviewedSite(page);

        if (await websiteAreaOn(page)) {
            // The Website area: More's Share a preview link opens the whole
            // site's Feedback (UX-068), on a phone from the page menu (U49).
            if (onPhone(page)) {
                await (
                    await openPhoneMenu(page)
                )
                    .getByRole("button", { name: "Share a preview link" })
                    .click();
            } else {
                const item = page.getByRole("menuitem", {
                    name: "Share a preview link",
                });
                await pressUntil(
                    page.getByRole("button", { name: /^More: find/ }),
                    item,
                );
                await item.click();
            }
        } else if (onPhone(page)) {
            // Review lives in the inspector's Feedback tab since #340. On a
            // phone the inspector is a sheet, opened on Feedback from ⋯ More
            // (DEC-185).
            await (
                await openPhoneMenu(page)
            )
                .getByRole("button", { name: /^Feedback/ })
                .click();
            await expect(
                page.getByRole("tab", { name: /^Feedback/ }),
            ).toHaveAttribute("aria-selected", "true");
        } else {
            await page.getByRole("tab", { name: /^Feedback/ }).click();
        }
        // With a block selected, Feedback opens on that block; preview links
        // are part of the whole site's review.
        const whole = page.getByRole("radio", { name: /^Whole site/ });
        const create = page
            .getByRole("button", { name: /^(Create link|New link)$/ })
            .filter({ visible: true });
        await expect(create.or(whole).first()).toBeVisible({ timeout: 30_000 });
        if (await whole.isVisible()) await whole.click();
        await create.click();

        // The address is shown ONCE, when the link is made — the server keeps
        // a hash, not the token — so it has to be read here or not at all.
        const shown = page.locator("code", { hasText: "/preview/" }).first();
        await expect(shown).toBeVisible({ timeout: 30_000 });
        const shownUrl = (await shown.textContent())?.trim() ?? "";
        const token = shownUrl.split("/preview/")[1];
        expect(token).toBeTruthy();

        // Opened against the renderer that is actually running. The app builds
        // the address as `https://<root domain>/…`, which is right in
        // production and unreachable on a CI runner serving plain http on a
        // port; the token is the part that matters.
        const preview = await context.newPage();
        await preview.goto(`${urls.RENDERER_URL}/preview/${token}`);

        /*
         * The bar is the whole reason a preview link is safe to hand out:
         * whoever opens it is reading a draft, on the merchant's own design,
         * and nothing on the page would otherwise tell them so.
         */
        const bar = preview.getByRole("status").filter({
            hasText: "Draft preview",
        });
        await expect(bar).toBeVisible();
        await expect(bar).toContainText("not live");
        await expect(bar).toContainText(REVIEWED_SITE);

        // Sticky: still there after reading to the bottom, not a banner that
        // scrolls away and leaves the draft looking live.
        await preview.mouse.wheel(0, 4000);
        await expect(bar).toBeInViewport();

        await preview.close();
    });
});

/**
 * Reviewing a test release (DEC-071, T12): the reviewer reads the release,
 * not the draft, and approves that. The draft then moves on; the release
 * still reads Approved in the editor's panel, and the draft's own review is
 * as it was.
 *
 * `@serial`: it edits Northwind's home draft, which other site specs read,
 * and puts it back. The release is the test's own, stamped, and discarded
 * at the end.
 */
test.describe("a reviewer and a test link", () => {
    test(
        "approves the release, and the editor's row reads Approved",
        { tag: "@serial" },
        async ({ page, browser }, testInfo) => {
            test.setTimeout(150_000);

            // The owner, in a context of their own: makes the release and
            // edits the draft through the API, and reads the editor.
            // At the desk, whichever project runs this: the reviewer is
            // the one on the phone.
            const ownerContext = await browser.newContext({
                ignoreHTTPSErrors,
                viewport: { width: 1440, height: 900 },
            });
            const owner = await ownerContext.newPage();
            await useSession(owner);
            const nw = northwind(owner.request);
            const sites =
                await nw.get<{ id: string; subdomain: string | null }[]>(
                    "/sites",
                );
            const siteId = sites.find((s) => s.subdomain === "northwind")?.id;
            expect(siteId, "Northwind has its site at northwind").toBeTruthy();

            const name = `E2E review ${ownStamp(testInfo)}`;

            interface Review {
                latestApproval: { outcome: string; at: string } | null;
                outstanding: boolean;
                pending: boolean;
            }
            const draftReview = () => nw.get<Review>(`/sites/${siteId}/review`);

            const site = await nw.get<{
                pages: { id: string; isHome: boolean }[];
            }>(`/sites/${siteId}`);
            const home = site.pages.find((p) => p.isHome) ?? site.pages[0];
            const draftPath = `/sites/${siteId}/pages/${home.id}/draft`;
            const original = (
                await nw.get<{
                    sections: {
                        type: string;
                        contractVersion: number;
                        content: unknown;
                        hidden?: boolean;
                        key?: string;
                    }[];
                }>(draftPath)
            ).sections.map(
                ({ type, contractVersion, content, hidden, key }) => ({
                    type,
                    contractVersion,
                    content,
                    hidden,
                    key,
                }),
            );
            let releaseId: string | null = null;

            /** The home draft with a stamped heading of this test's on top. */
            const withHeading = async (heading: string) => {
                const now = await nw.get<{ revision: number }>(draftPath);
                await nw.put(`${draftPath}/sections`, {
                    revision: now.revision,
                    sections: [
                        {
                            type: "hero",
                            contractVersion: 1,
                            content: { heading },
                        },
                        ...original,
                    ],
                });
            };

            try {
                // A release of this test's own bytes. A verdict is bound to
                // a release's fingerprint (KTD-10), so a release of the seed's
                // draft would already carry an earlier run's approval.
                await withHeading(`Under review ${name}`);
                const made = await nw.post<{ release: { id: string } }>(
                    `/sites/${siteId}/test-releases`,
                    { name },
                );
                releaseId = made.release.id;
                /*
                 * The draft's review, read with the draft as the release
                 * froze it: a change to the draft can turn an earlier
                 * approval stale, so it is compared at the same bytes.
                 */
                const before = await draftReview();

                // The reviewer finds it in the editor's Test releases, opens
                // its own review page, and approves it there.
                await useSession(page, "reviewer");
                await openReviewedSite(page);
                const panel = await openTestReleases(page);
                const listed = panel.getByRole("listitem", { name });
                await expect(listed).toBeVisible({ timeout: 30_000 });
                // Read-only: its Review, nothing to share or put live.
                await expect(
                    listed.getByRole("button", { name: /^Go live|^Open$/ }),
                ).toHaveCount(0);
                await listed.getByRole("link", { name: "Review" }).click();
                await page.waitForURL(/\/releases\//, { timeout: 30_000 });

                await expect(
                    page
                        .locator("[data-review-subject]")
                        .filter({ visible: true }),
                ).toContainText(name);
                // The release as it was frozen, drawn from its snapshot.
                await expect(
                    page.getByText(`Under review ${name}`),
                ).toBeVisible();

                await page
                    .getByRole("button", { name: "Approve" })
                    .filter({ visible: true })
                    .click();
                await expect(
                    page.locator("[data-release-verdict]"),
                ).toContainText("approved this test link.");
                // The draft's own review is as it was.
                const after = await draftReview();
                expect(after.latestApproval).toEqual(before.latestApproval);
                expect(after.outstanding).toBe(before.outstanding);
                expect(after.pending).toBe(before.pending);

                // The draft moves on after the verdict.
                await withHeading(`After review ${name}`);

                // The release still reads Approved, in the editor's panel.
                await owner.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
                await owner.goto(`${urls.APP_URL}/sites/${siteId}`);
                // Opened until the panel shows: the editor redraws its top
                // bar while it settles.
                const releasesPanel = await openTestReleases(owner);
                const row = releasesPanel.getByRole("listitem", { name });
                await expect(row).toContainText(/Approved by /);
                await expect(row).toContainText("Your draft has changed since");
            } finally {
                // Put the home draft back as it was.
                const now = await nw.get<{ revision: number }>(draftPath);
                await nw.put(`${draftPath}/sections`, {
                    revision: now.revision,
                    sections: original,
                });
                if (releaseId) {
                    await nw.post(
                        `/sites/${siteId}/test-releases/${releaseId}/discard`,
                    );
                }
                await ownerContext.close();
            }
        },
    );
});
