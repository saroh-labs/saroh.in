// @covers accounts:/login app:/open app:/sites app:/sites/new app:/sites/[siteId]/releases/[releaseId] site:/preview api:sites pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp as ownStamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
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
 * These are questions only a browser can answer. Whether the list a reviewer
 * sees holds one site or three is a query the server builds from a session
 * cookie; whether the editor route hands them the reading screen instead is a
 * redirect; whether a shared link says "not live" is a page rendered by a
 * different app on a different origin. The unit tests prove the policy. This
 * proves the product.
 */

async function signIn(page: Page, who: { email: string; password: string }) {
    await useSession(page, who);
}

/** The reviewer's one site, opened from Website in the rail. */
async function openTheReviewedSite(page: Page) {
    await page.goto(`${urls.APP_URL}/sites`);
    await page.waitForURL(/\/sites\/[^/]+\/review/, { timeout: 30_000 });
}

test.describe("a reviewer", () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page, demoReviewer);
    });

    test("sees only the site they were invited to", async ({ page }) => {
        await openTheReviewedSite(page);

        // The reviewer is granted the business's site. With one site and no
        // right to make another, there is nothing to pick. That a reviewer
        // sees only the sites they were granted, when a business has several,
        // is `reviewer-scope.spec.ts` in the API.
        await expect(
            page.getByRole("heading", { name: REVIEWED_SITE, exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: /^Website: .*Change it\.$/ }),
        ).toHaveCount(0);
    });

    test("is offered nothing in the rail that they cannot open", async ({
        page,
    }) => {
        await page.goto(`${urls.APP_URL}/sites`);

        /*
         * The rail is not a permission boundary — every destination refuses on
         * its own, and it still does. It is a description of the workspace
         * someone has, and it was describing one they do not: Notifications,
         * Organization and People answer "you do not have access to this",
         * Providers named the payment and messaging providers the business runs
         * on, and "New site" leads to a form that fails on submit (#313).
         */
        /*
         * Below 760px the rail is not drawn and the phone TAB BAR carries the
         * nav — so which navigation this test reads has to be chosen, not
         * filtered for. Both draw the same groups from the same projection,
         * which is the point of having one `navFor`; running at both widths
         * is what proves the bar did not keep its own copy.
         *
         * Decided by the viewport, not by asking what is showing:
         * `isVisible()` does not wait for anything, and answered before the
         * chrome had rendered. 760 is where `AppSidebar` stops being hidden.
         */
        const onPhone = (page.viewportSize()?.width ?? 1440) < 760;

        const rail = onPhone
            ? page.getByRole("navigation", { name: "Main" })
            : page.getByRole("navigation", { name: "Primary" });
        if (onPhone) {
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
            "/settings/providers",
            "/sites/new",
        ]) {
            await expect(rail.locator(`a[href="${gone}"]`)).toHaveCount(0);
        }

        // What is left is Website, one row: which site, and Review, are on
        // the Website screen rather than hung under it.
        await expect(rail.getByRole("link", { name: "Website" })).toBeVisible();
        await expect(rail.locator('a[href^="/sites/"]')).toHaveCount(0);
    });

    test("is taken to Review, not to the editor, and is told why", async ({
        page,
    }) => {
        await openTheReviewedSite(page);

        // `/sites/:id` is the editor. A caller without `section:write` is
        // redirected here rather than shown an editor with its controls taken
        // away — see the page's own note.
        await expect(page).toHaveURL(/\/sites\/[^/]+\/review/);
        await expect(
            page.getByText(/Editing and publishing stay with the owner/i),
        ).toBeVisible();
    });

    // @serial: it reads the site's first block, which site-versions hides
    // and puts back.
    test(
        "reads the page itself, not a list of page titles",
        {
            tag: "@serial",
        },
        async ({ page }) => {
            await openTheReviewedSite(page);

            // The seeded home page's own copy, rendered through the real blocks.
            // What this replaced was a list of titles and paths, which told a
            // reviewer a site had pages and nothing about what was on them.
            await expect(
                page.getByText("Packaging, storage and safety supplies"),
            ).toBeVisible();
        },
    );

    test("leaves a note on a section, and the note comes back", async ({
        page,
    }) => {
        await openTheReviewedSite(page);

        // Commenting is a MODE. Nothing is offered until it is switched on,
        // because a page covered in "leave a note" buttons is not a page
        // anybody reads.
        await page.getByRole("button", { name: "Comment on sections" }).click();

        const note = page.getByRole("button", { name: /^Note on /i }).first();
        // Revealed on hover or focus; focus, so this works without a pointer.
        await note.focus();
        await note.click();

        const body = `Opening hours look wrong — ${ownStamp(test.info())}`;
        await page.getByLabel(/Your note about/i).fill(body);
        await page.getByRole("button", { name: "Add note" }).click();

        await expect(page.getByText(body)).toBeVisible();
    });

    test("can say what they think, and cannot publish", async ({ page }) => {
        await openTheReviewedSite(page);

        await expect(
            page.getByRole("button", { name: "Approve" }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Ask for changes" }),
        ).toBeVisible();
        // The whole point of the role: they say what they think, the owner
        // decides. No publish control exists on this screen.
        await expect(
            page.getByRole("button", { name: /^Publish/ }),
        ).toHaveCount(0);
    });
});

test.describe("a shared preview link", () => {
    test("opens the draft with a bar that says it is not live", async ({
        page,
        context,
    }) => {
        await signIn(page, demoUser);
        await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
        // Website opens on the business's one site (ADR-006), and the Pages
        // tab's action opens it in the editor.
        await page.goto(`${urls.APP_URL}/sites`);
        await page.waitForURL(/\/sites\/[^/]+\/pages/, { timeout: 30_000 });
        await expect(page.getByRole("main")).toContainText(REVIEWED_SITE, {
            timeout: 30_000,
        });
        await page.getByRole("link", { name: "Open editor" }).click();
        await page.waitForURL(/\/sites\/[^/]+$/, { timeout: 30_000 });

        // Review lives in the inspector's Feedback tab since #340. On a
        // phone (G4) the inspector is a sheet, opened on Feedback from the
        // bar at the foot of the screen.
        if ((page.viewportSize()?.width ?? 1440) < 760) {
            await page
                .getByRole("navigation", { name: "Edit this page" })
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
        await page.getByRole("radio", { name: /^Whole site/ }).click();
        await page
            .getByRole("button", { name: /^(Create link|New link)$/ })
            .click();

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
test.describe("a reviewer and a test release", () => {
    test(
        "approves the release, and the editor's row reads Approved",
        { tag: "@serial" },
        async ({ page, browser }, testInfo) => {
            test.setTimeout(150_000);

            // The owner, in a context of their own: makes the release and
            // edits the draft through the API, and reads the editor.
            const ownerContext = await browser.newContext({
                ignoreHTTPSErrors,
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
            const before = await draftReview();

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

                // The reviewer finds it on Review, opens it, and approves it.
                await useSession(page, "reviewer");
                await openTheReviewedSite(page);
                const listed = page.getByRole("listitem", { name });
                await expect(listed).toContainText(
                    "Nobody has reviewed this test release yet.",
                );
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
                ).toContainText("approved this test release.");

                // The draft moves on after the verdict.
                await withHeading(`After review ${name}`);

                // The release still reads Approved, in the editor's panel.
                await owner.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
                await owner.goto(`${urls.APP_URL}/sites/${siteId}`);
                await owner
                    .getByRole("button", { name: "More test release actions" })
                    .click();
                await owner
                    .getByRole("menuitem", { name: /^Test releases/ })
                    .click();
                const row = owner
                    .getByRole("dialog", { name: "Test releases" })
                    .getByRole("listitem", { name });
                await expect(row).toContainText(/Approved by /);
                await expect(row).toContainText("Your draft has changed since");

                // And the draft's own review is as it was.
                const after = await draftReview();
                expect(after.latestApproval).toEqual(before.latestApproval);
                expect(after.outstanding).toBe(before.outstanding);
                expect(after.pending).toBe(before.pending);
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
