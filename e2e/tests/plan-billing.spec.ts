// @covers accounts:/login app:/open app:/settings/billing api:billing api:pricing
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * Settings › Plan and billing (plans catalogue U14), on desk and phone.
 *
 * Read on Rye & Co. as its owner, which no test writes to: the page's cards
 * as the "Saroh Settings" design draws them, a plan row's change opening
 * its quote (a read) and closing again, and the same change opened from an
 * "Upgrade" link elsewhere (`?plan=`). Nothing is changed: every dialog is
 * left with Cancel. No price is asserted — the catalogue's are the
 * business's, not the test's.
 */

const RYE = "seed_sc_rc_org";

async function open(page: Page, path: string) {
    await useSession(page);
    await page.goto(`/open/${RYE}`);
    await page.goto(path);
}

/** No sideways scroll at the width this project set. */
async function noOverflow(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    await expect
        .poll(() =>
            page.evaluate(() => ({
                inner: window.innerWidth,
                scroll: document.documentElement.scrollWidth,
            })),
        )
        .toEqual({ inner: width, scroll: width });
}

test("shows the plan, the picker and Saroh's invoices", async ({ page }) => {
    await open(page, "/settings/billing");

    const plan = page.getByRole("region", { name: "Your plan" });
    await expect(plan.getByText("Your plan", { exact: true })).toBeVisible();
    await expect(plan.getByText("Next charge")).toBeVisible();

    const picker = page.getByRole("region", { name: "Change plan" });
    await expect(
        picker.getByText(
            "Change plan any time. Upgrades start today; downgrades from your next charge.",
        ),
    ).toBeVisible();
    await expect(picker.getByText("Current plan")).toHaveCount(1);

    await expect(
        page.getByRole("region", { name: "Invoices from Saroh" }),
    ).toBeVisible();
    await noOverflow(page);
});

test("a plan's change opens its quote, and Cancel leaves it", async ({
    page,
}) => {
    await open(page, "/settings/billing");
    const picker = page.getByRole("region", { name: "Change plan" });
    const change = picker
        .getByRole("button", {
            name: /^(Upgrade|Switch|Start \d+-day trial|Bill (yearly|monthly)): /,
        })
        .first();
    await change.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The quote has landed: a confirm, or "nothing changes".
    await expect(
        dialog.getByRole("button", {
            name: /^(Continue to payment|Move to .+|Close)$/,
        }),
    ).toBeVisible();
    await noOverflow(page);
    await dialog
        .getByRole("button", { name: /^(Cancel|Close)$/ })
        .first()
        .click();
    await expect(dialog).toBeHidden();
});

test("an Upgrade link elsewhere opens that plan's change", async ({ page }) => {
    await open(page, "/settings/billing");
    const picker = page.getByRole("region", { name: "Change plan" });
    // A plan this business isn't on: a row with a button.
    const row = picker
        .locator("[data-plan]")
        .filter({ has: page.getByRole("button") })
        .first();
    const id = await row.getAttribute("data-plan");
    test.skip(!id, "Rye is on the only plan there is.");
    const name = await row.locator("p").first().innerText();

    // Where every "Upgrade" in the app lands (`upgradeHref`).
    await page.goto(`/settings/billing?plan=${encodeURIComponent(id ?? "")}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(name.split(" ")[0]);
    // The address is tidied, so a reload doesn't open it again.
    await expect(page).not.toHaveURL(/plan=/);
    await dialog
        .getByRole("button", { name: /^(Cancel|Close)$/ })
        .first()
        .click();
    await expect(dialog).toBeHidden();
});
