// @covers accounts:/login app:/open app:/settings/billing api:billing api:pricing
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * Settings › Plan and billing (plans catalogue U14), on desk and phone.
 *
 * The owner's page: only the owner changes what the business pays Saroh
 * (DEC-131, amended 2026-10-11), so every control here is the owner's. An
 * Admin reads the same page with none of them (`role-admin.spec.ts`).
 *
 * Read on Rye & Co. as its owner, which no test writes to: the one status
 * line, the plans as cards, "How billing works" closed until asked for, a
 * plan's change opening its quote (a read) and closing again, and the same
 * change opened from an
 * "Upgrade" link elsewhere (`?plan=`). Nothing is changed: every dialog is
 * left with Cancel. No price is asserted — the catalogue's are the
 * business's, not the test's.
 */

const RYE = "seed_sc_rc_org";

/**
 * A plan card's button, by what it does: "Upgrade to ‹plan›", "Move to
 * ‹plan› from ‹date›", "Start ‹plan›", "Start with the first month: ‹plan›",
 * "Keep ‹plan›", "Bill yearly". Never the off "Current plan" one.
 */
const CHANGE = /^(Upgrade to |Move to |Start |Keep |Bill (yearly|monthly))/;

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
    // One line: the plan, and what happens next.
    await expect(plan.getByText(/^You're on /)).toBeVisible();
    // At most one message under it, never a stack.
    expect(await plan.locator("[data-notice]").count()).toBeLessThan(2);

    const picker = page.getByRole("region", { name: "Change plan" });
    await expect(picker.getByRole("heading", { name: "Plans" })).toBeVisible();
    // The plan it's on: one card, marked.
    await expect(
        picker.locator('[data-plan][aria-current="true"]'),
    ).toHaveCount(1);
    await expect(
        picker.getByRole("link", {
            name: /^Compare everything on the pricing page/,
        }),
    ).toBeVisible();
    // How plans are paid is kept, closed until asked for.
    const rules = picker.getByText(
        "Upgrades start today. A cheaper plan or Free starts when what you've paid for ends.",
    );
    await expect(rules).toBeHidden();
    await picker.getByText("How billing works").click();
    await expect(rules).toBeVisible();

    await expect(
        page.getByRole("region", { name: "Invoices from Saroh" }),
    ).toBeVisible();

    // The owner's to change: nothing says it is someone else's, a plan
    // has its button, and the coupon is offered.
    await expect(page.getByText(/^Your role can read/)).toHaveCount(0);
    await expect(
        picker
            .getByRole("button", {
                name: CHANGE,
            })
            .first(),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Coupon" })).toBeVisible();
    await expect(page.getByLabel("Coupon code")).toBeVisible();
    await noOverflow(page);
});

test("a plan's change opens its quote, and Cancel leaves it", async ({
    page,
}) => {
    await open(page, "/settings/billing");
    const picker = page.getByRole("region", { name: "Change plan" });
    const change = picker
        .getByRole("button", {
            name: CHANGE,
        })
        .first();
    await change.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The quote has landed: its confirm, or Close when nothing changes.
    await expect(
        dialog
            .getByRole("button", {
                name: /^(Continue to payment|Move to .+|Close)$/,
            })
            .first(),
    ).toBeVisible();
    await expect(dialog).not.toContainText("Working out the price");
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
    // A plan this business isn't on: a card with a button that changes.
    const row = picker
        .locator("[data-plan]")
        .filter({ has: page.getByRole("button", { name: CHANGE }) })
        .first();
    const id = await row.getAttribute("data-plan");
    test.skip(!id, "Rye is on the only plan there is.");
    const name = await row.getByRole("heading").innerText();

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
