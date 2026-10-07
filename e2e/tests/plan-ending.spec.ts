// @covers app:/open app:/ app:/settings/billing api:billing
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { useSession } from "../fixtures/sessions";

/**
 * The countdown to a plan that ends (#805), on desk and phone.
 *
 * Asha's Studio (`packages/database/src/seed/plan-ending.ts`) is on the
 * sample catalogue's entry plan with a plan override — the launch offer's
 * mechanism — putting it on the top plan until ten days after the seed
 * ran, so the countdown shows above its pages. Only read here, so desk and
 * phone share it. The days and the words for one day are covered by
 * `plan-ending-banner.test.tsx`; the reminders by the API's
 * `plan-ending.db.spec.ts`.
 */

const STUDIO = "seed_org_plan-ending_studio";

test("a plan that ends soon says when above the page, and leads to choosing a plan", async ({
    page,
}) => {
    await useSession(page, "founder");
    await page.goto(`/open/${STUDIO}`);
    await page.goto("/");

    const banner = page
        .getByRole("status")
        .filter({ hasText: /plan ends in \d+ days/ });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("and everything you made is kept");
    await expectNothingHiddenSideways(page);

    await banner.getByRole("link", { name: "Choose a plan" }).click();
    await expect(page).toHaveURL(/\/settings\/billing#change-plan$/);
    await expect(
        page.getByRole("region", { name: "Change plan" }),
    ).toBeVisible();
});
