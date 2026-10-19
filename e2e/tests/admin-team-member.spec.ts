// @covers admin:/team admin:/team/[platformAdminId] admin:/team/me api:admin
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { people, useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * A teammate's page on the operator console (DEC-169, admin console U22,
 * R33): reached from their name on the Team list and from Your page, with
 * the counts, the manager link and the tabs Profile · Businesses · Leads ·
 * Earnings · Activity, each an address, at the desk and on a phone.
 *
 * Staff is Sam (`people.staff`), a Platform owner, on his own page. Reads
 * only: Edit details… is opened and cancelled and no call is logged, so
 * the seeded team every other spec reads is never changed. Who may open
 * whose page, and Log a call, are `admin-team-member.db.spec.ts`'s and
 * `member.test.tsx`'s.
 */
const ADMIN = urls.ADMIN_URL;

test.describe("A teammate's page on the operator console", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page, "staff");
    });

    test("opens from a name on the Team list, with the tabs as addresses", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/team`);
        const list = page.getByRole("list", { name: "People on the team" });
        const row = list
            .getByRole("listitem")
            .filter({ hasText: people.staff.email });
        await row.getByRole("link").first().click();

        await expect(page).toHaveURL(/\/team\/[^/]+$/);
        await expect(page.getByText("Not authorized")).toHaveCount(0);
        await expect(
            page.getByRole("heading", { level: 1, name: /\(you\)$/ }),
        ).toBeVisible();
        await expect(
            page.getByRole("group", { name: "Teammate in numbers" }),
        ).toBeVisible();
        await expect(
            page.getByRole("region", { name: "Manager link" }),
        ).toBeVisible();

        const tabs = page.getByRole("navigation", { name: "Teammate" });
        await expect(
            tabs.getByRole("link", { name: /^Profile/ }),
        ).toHaveAttribute("aria-current", "page");
        // Sam is a Platform owner: he holds team:pay, so Earnings is there.
        await expect(
            tabs.getByRole("link", { name: /^Earnings/ }),
        ).toBeVisible();

        await tabs.getByRole("link", { name: /^Businesses/ }).click();
        await expect(page).toHaveURL(/\/businesses$/);
        await tabs.getByRole("link", { name: /^Activity/ }).click();
        await expect(page).toHaveURL(/\/activity$/);
        await expect(
            page.getByRole("region", { name: "Activity" }),
        ).toBeVisible();

        if (test.info().project.name.startsWith("phone")) {
            await expectNothingHiddenSideways(page);
        }
    });

    test("Profile says what's missing, and Edit details… opens and cancels", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/team/me`);
        await expect(page).toHaveURL(/\/team\/[^/]+$/);
        const details = page.getByRole("region", { name: "Details" });
        await expect(details).toBeVisible();
        // The tax id row is Platform owner's and Billing's.
        await expect(details.getByText("Tax id (PAN)")).toBeVisible();

        await details.getByRole("button", { name: "Edit details…" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByText("Works as")).toBeVisible();
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toHaveCount(0);

        if (test.info().project.name.startsWith("phone")) {
            await expectNothingHiddenSideways(page);
        }
    });

    test("Your page is in the menu and lands on one's own page", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/`);
        if (test.info().project.name.startsWith("phone")) {
            await page
                .getByRole("button", { name: "Open the console menu" })
                .click();
        }
        await page.getByRole("link", { name: "Your page" }).first().click();
        await expect(page).toHaveURL(/\/team\/[^/]+$/);
        await expect(
            page.getByRole("heading", { level: 1, name: /\(you\)$/ }),
        ).toBeVisible();
    });
});
