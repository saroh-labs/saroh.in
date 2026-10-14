// @covers accounts:/login app:/open app:/settings/billing app:/settings/billing/plans api:billing api:pricing
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
 * Read on Rye & Co. as its owner, which no test writes to. Plan and
 * billing: the one status line, the plan it's on as the page's one card
 * with its way to the next screen, "How billing works" closed until asked
 * for, and Saroh's invoices. Change plan, the next screen: every plan as a
 * card, the coupon, a plan's change opening its quote (a read) and closing
 * again, and the same change opened from an "Upgrade" link elsewhere
 * (`?plan=`), old address and new. Nothing is changed: every dialog is
 * left with Cancel. No price is asserted: the catalogue's are the
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

test("shows the plan it's on, and only that one, with Saroh's invoices", async ({
    page,
}) => {
    await open(page, "/settings/billing");

    const plan = page.getByRole("region", { name: "Your plan" });
    await expect(plan.getByText("Your plan", { exact: true })).toBeVisible();
    // The plan, and what happens next.
    await expect(plan.getByText(/^You're on /)).toBeVisible();
    // At most one message under it, never a stack.
    expect(await plan.locator("[data-notice]").count()).toBeLessThan(2);

    // One card: the plan it's on. No other plan, and no coupon, here.
    const card = page.getByRole("region", { name: "Current plan" });
    await expect(card.getByText("Current plan", { exact: true })).toBeVisible();
    await expect(page.locator("[data-plan]")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Coupon" })).toHaveCount(0);

    // How plans are paid is kept, closed until asked for.
    const rules = page.getByText(
        "Upgrades start today. A cheaper plan or Free starts when what you've paid for ends.",
    );
    await expect(rules).toBeHidden();
    await page.getByText("How billing works").click();
    await expect(rules).toBeVisible();

    await expect(
        page.getByRole("region", { name: "Invoices from Saroh" }),
    ).toBeVisible();
    // The owner's to change: nothing says it is someone else's.
    await expect(page.getByText(/^Your role can read/)).toHaveCount(0);
    await noOverflow(page);

    // The one way on: the next screen, with every plan.
    await card.getByRole("link", { name: /^(Change plan|See plans)$/ }).click();
    await expect(page).toHaveURL(/\/settings\/billing\/plans$/);
    await expect(
        page.getByRole("heading", { name: "Change plan", level: 1 }),
    ).toBeVisible();
});

test("Change plan shows every plan and the coupon, and leads back", async ({
    page,
}) => {
    await open(page, "/settings/billing/plans");
    const picker = page.getByRole("region", { name: "Plans" });
    // The plan it's on: one card, marked.
    await expect(
        picker.locator('[data-plan][aria-current="true"]'),
    ).toHaveCount(1);
    await expect(
        picker.getByRole("button", { name: CHANGE }).first(),
    ).toBeVisible();
    await expect(
        picker.getByRole("link", {
            name: /^Compare everything on the pricing page/,
        }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Coupon" })).toBeVisible();
    await expect(page.getByLabel("Coupon code")).toBeVisible();
    await noOverflow(page);

    await page.getByRole("link", { name: "Back to Plan and billing" }).click();
    await expect(page).toHaveURL(/\/settings\/billing$/);
});

test("a plan's change opens its quote, and Cancel leaves it", async ({
    page,
}) => {
    await open(page, "/settings/billing/plans");
    const picker = page.getByRole("region", { name: "Plans" });
    await picker.getByRole("button", { name: CHANGE }).first().click();

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
    // Nothing was changed, so the person is still choosing.
    await expect(page).toHaveURL(/\/settings\/billing\/plans$/);
});

test("an Upgrade link elsewhere opens that plan's change, old address and new", async ({
    page,
}) => {
    await open(page, "/settings/billing/plans");
    const picker = page.getByRole("region", { name: "Plans" });
    // A plan this business isn't on: a card with a button that changes.
    const row = picker
        .locator("[data-plan]")
        .filter({ has: page.getByRole("button", { name: CHANGE }) })
        .first();
    const id = await row.getAttribute("data-plan");
    test.skip(!id, "Rye is on the only plan there is.");
    const name = await row.getByRole("heading").innerText();

    for (const address of [
        // Where every "Upgrade" in the app lands (`upgradeHref`).
        `/settings/billing/plans?plan=${encodeURIComponent(id ?? "")}`,
        // The address before the plans had their own screen: sent on.
        `/settings/billing?plan=${encodeURIComponent(id ?? "")}#change-plan`,
    ]) {
        await page.goto(address);
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(name.split(" ")[0]);
        // The address is tidied, so a reload doesn't open it again.
        await expect(page).toHaveURL(/\/settings\/billing\/plans$/);
        await dialog
            .getByRole("button", { name: /^(Cancel|Close)$/ })
            .first()
            .click();
        await expect(dialog).toBeHidden();
    }
});
