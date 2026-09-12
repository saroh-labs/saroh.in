import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    demoReviewer,
    demoUser,
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
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

/** The reviewer's one site, opened from their own list. */
async function openTheReviewedSite(page: Page) {
    await page.goto(`${urls.APP_URL}/sites`);
    await page.getByRole("link", { name: REVIEWED_SITE }).first().click();
    await page.waitForURL(/\/sites\/[^/]+\/review/, { timeout: 30_000 });
}

test.describe("a reviewer", () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page, demoReviewer);
    });

    test("sees only the site they were invited to", async ({ page }) => {
        await page.goto(`${urls.APP_URL}/sites`);

        // The seed builds three sites and grants this reviewer one. A reviewer
        // who could see the other two would be a MEMBER with extra powers.
        //
        // Counted inside `main` only: the sidebar links to the site the
        // workspace last had open, which is not the list and would make one
        // card look like two.
        const cards = page
            .getByRole("main")
            .locator('a[href^="/sites/"]:not([href$="/new"])');
        await expect(cards.filter({ hasText: REVIEWED_SITE })).toHaveCount(1);
        await expect(cards).toHaveCount(1);
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
         * Below `lg` the rail is a drawer, so it has to be opened before it can
         * be read. Both draw the same groups from the same projection — that is
         * the point of one `navFor` — and this suite runs at both widths, so
         * the assertions below cover the phone as well as the desk.
         */
        const opener = page.getByRole("button", {
            name: "Open navigation menu",
        });
        if (await opener.isVisible()) {
            // The drawer is a client component, so the press only lands once
            // it has hydrated. `toBeVisible` on the panel is what waits for it;
            // clicking and reading straight away raced the hydration and read
            // the hidden desktop rail instead.
            await expect(opener).toBeEnabled();
            await opener.click();
            await expect(
                page.getByRole("dialog").getByRole("navigation"),
            ).toBeVisible();
        }

        const rail = page
            .getByRole("navigation", { name: "Primary" })
            .filter({ visible: true });
        for (const gone of [
            "/notifications",
            "/settings/organization",
            "/settings/people",
            "/settings/modules",
            "/settings/providers",
            "/sites/new",
        ]) {
            await expect(rail.locator(`a[href="${gone}"]`)).toHaveCount(0);
        }

        // What is left is their site, by the name they were invited to.
        await expect(rail.getByRole("link", { name: "Website" })).toBeVisible();
        await expect(rail.getByRole("link", { name: "Review" })).toBeVisible();
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

    test("reads the page itself, not a list of page titles", async ({
        page,
    }) => {
        await openTheReviewedSite(page);

        // The seeded home page's own copy, rendered through the real blocks.
        // What this replaced was a list of titles and paths, which told a
        // reviewer a site had pages and nothing about what was on them.
        await expect(
            page.getByText("Packaging, storage and safety supplies"),
        ).toBeVisible();
    });

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

        const body = `Opening hours look wrong — ${Date.now()}`;
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
        await page.goto(`${urls.APP_URL}/sites`);
        await page.getByRole("link", { name: REVIEWED_SITE }).first().click();
        await page.waitForURL(/\/sites\/[^/]+$/, { timeout: 30_000 });

        await page.getByRole("tab", { name: "review" }).click();
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
