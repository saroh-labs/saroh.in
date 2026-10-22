// @covers accounts:/login app:/ app:/sites app:/sites/[siteId]/review app:/contacts app:/settings/billing app:/settings/profile api:sites api:organizations api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { MenuRow } from "../fixtures/roles";
import {
    expectDenied,
    expectLeaveOfferedThenStay,
    expectMenu,
    expectNoWayToPlans,
    expectSettingsTabs,
} from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { REVIEWED_SITE } from "../playwright.config";

/**
 * A Reviewer, in the browser: Priya, invited to Northwind's one site.
 *
 * The narrowest role there is: `site:read`, `site:comment` and
 * `site:approve`, on the sites they were invited to and nothing else of the
 * business (`organization-policy.ts`, `sites/site-access.ts`). So the menu
 * is Home and Website, the site opens on its reading screen, and a verdict
 * is theirs to give while publishing is not.
 *
 * `site-review.spec.ts` covers the notes and an approval as it is recorded
 * (on a test release of its own, alone, since a verdict is read by every
 * site spec). Nothing here saves: the verdict is opened and cancelled.
 */

/**
 * `NAV_GROUPS` (`components/shared/navigation/nav-items.tsx`) for `site:read` alone:
 * Home, which asks nothing, and Website. Calendar asks `org:read` and
 * Settings one of four reads a Reviewer has none of.
 */
const MENU: readonly MenuRow[] = [
    { label: "Home", href: "/" },
    { label: "Website", href: "/sites" },
];

/**
 * `SETTINGS_PAGES` for a Reviewer, reached from the account menu: their own
 * profile, and Share, which whoever may see the website may see.
 */
const SETTINGS = ["/settings/profile", "/settings/share"];

/** The reviewer's one site, opened from Website. */
async function openTheReviewedSite(page: Page): Promise<string> {
    await page.goto("/sites");
    await page.waitForURL(/\/sites\/[^/]+\/review/, { timeout: 30_000 });
    return new URL(page.url()).pathname.split("/")[2] ?? "";
}

test.describe("a Reviewer", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page, "reviewer");
    });

    test("is offered Home and Website, and nothing else", async ({ page }) => {
        await expectMenu(page, MENU);
        await expectSettingsTabs(page, SETTINGS);
    });

    test("is told who can change it when they open the rest of the business", async ({
        page,
    }) => {
        await expectDenied(page, "/contacts", { thing: "Contacts" });
        await expect(
            page.getByRole("link", { name: "Back to Home" }),
        ).toBeVisible();
    });

    test("opens the site they review and no other", async ({ page }) => {
        const siteId = await openTheReviewedSite(page);
        await expect(
            page.getByRole("heading", { name: REVIEWED_SITE, exact: true }),
        ).toBeVisible();

        // A site they weren't invited to isn't there for them: no page, as
        // for a site that doesn't exist, never a look at what it holds.
        const other = siteId === "seed_site_1" ? "seed_site_2" : "seed_site_1";
        await page.goto(`/sites/${other}/review`);
        await expect(
            page.getByRole("heading", { name: "Page not found" }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(
            0,
        );
    });

    test("reads the site with nothing to edit or publish, and says what they think", async ({
        page,
    }) => {
        const siteId = await openTheReviewedSite(page);
        await expect(
            page.getByText(/Editing and publishing stay with the owner/),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: /^Publish/ }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("link", { name: "Open editor" }),
        ).toHaveCount(0);

        // The verdict is theirs: Approve, or Ask for changes, which asks
        // what needs changing before anything is recorded.
        await expect(
            page
                .getByRole("button", { name: "Approve" })
                .filter({ visible: true }),
        ).toBeEnabled();
        await page
            .getByRole("button", { name: "Ask for changes" })
            .filter({ visible: true })
            .click();
        const reason = page
            .getByLabel("What needs changing?")
            .filter({ visible: true });
        await expect(reason).toBeEditable();
        // Left unsaid: a verdict is read by every spec on this site.
        await page
            .getByRole("button", { name: "Cancel", exact: true })
            .filter({ visible: true })
            .click();
        await expect(reason).toHaveCount(0);

        // The editor's own address hands a reader back to the reading
        // screen, once, and stays there.
        await page.goto(`/sites/${siteId}`);
        await expect(page).toHaveURL(new RegExp(`/sites/${siteId}/review$`));
        await expect(
            page.getByRole("heading", { name: REVIEWED_SITE, exact: true }),
        ).toBeVisible();
    });

    test("has no way to the plans, and reads who has", async ({ page }) => {
        await expectNoWayToPlans(page);
    });

    test("is offered Leave on Your profile, and stays", async ({ page }) => {
        await expectLeaveOfferedThenStay(page);
    });
});
