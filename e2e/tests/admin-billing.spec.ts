// @covers admin:/billing api:admin
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Billing as one page (admin plan U14, R25, R26) on the seeded stack, as
 * Sam (`people.staff`, a Platform owner, who holds `saroh-billing:read`).
 *
 * Reads only: the cards, chips, tabs and the search change the address and
 * nothing else, and no subscription sheet action is pressed. The seeded
 * database's own subscriptions decide the numbers, so the spec checks the
 * page's shape and what each filter does to the address, never a figure.
 * Desk and phone both run it.
 */
const ADMIN = urls.ADMIN_URL;

test.describe("Billing, one page", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page, "staff");
    });

    test("lands on Subscriptions, with the tabs, one search and the total", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/billing`);
        await expect(page).toHaveURL(/\/billing\/subscriptions$/);
        await expect(
            page.getByRole("heading", { level: 1, name: "Billing" }),
        ).toBeVisible();

        const tabs = page.getByRole("navigation", { name: "Billing" });
        for (const name of [
            "Subscriptions",
            "Invoices",
            "Needs action",
            "Provider events",
        ]) {
            await expect(
                tabs.getByRole("link", { name: new RegExp(name) }),
            ).toBeVisible();
        }
        await expect(
            tabs.getByRole("link", { name: /Subscriptions/ }),
        ).toHaveAttribute("aria-current", "page");

        await expect(page.getByRole("searchbox")).toBeVisible();
        await expect(page.getByText("A month, at list price")).toBeVisible();
        await expect(
            page.getByRole("button", { name: "What this counts" }),
        ).toBeVisible();
    });

    test("a status card filters as it is pressed, and clears when pressed again", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/billing/subscriptions`);
        const paying = page.getByRole("button", { name: /^Paying/ });
        await expect(paying).toHaveAttribute("aria-pressed", "false");

        await paying.click();
        await expect(page).toHaveURL(/status=ACTIVE/);
        await expect(
            page.getByRole("button", { name: /^Paying/ }),
        ).toHaveAttribute("aria-pressed", "true");

        await page.getByRole("button", { name: /^Paying/ }).click();
        await expect(page).not.toHaveURL(/status=/);
        await expect(
            page.getByRole("button", { name: /^Paying/ }),
        ).toHaveAttribute("aria-pressed", "false");
    });

    test("the search applies as it is typed, and goes with you to another tab", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/billing/subscriptions`);
        await page.getByRole("searchbox").fill("no-such-business-zz");
        await expect(page).toHaveURL(/q=no-such-business-zz/);
        await expect(page.getByText(/No subscriptions match/)).toBeVisible();

        await page
            .getByRole("navigation", { name: "Billing" })
            .getByRole("link", { name: /Invoices/ })
            .click();
        await expect(page).toHaveURL(
            /\/billing\/invoices\?q=no-such-business-zz$/,
        );
        await expect(page.getByRole("searchbox")).toHaveValue(
            "no-such-business-zz",
        );
    });

    test("Needs action and Provider events open in place", async ({ page }) => {
        await page.goto(`${ADMIN}/billing/actions`);
        await expect(
            page.getByRole("heading", { name: "Failed billing jobs" }),
        ).toBeVisible();
        await page.goto(`${ADMIN}/billing/events`);
        await expect(
            page
                .getByRole("navigation", { name: "Billing" })
                .getByRole("link", { name: /Provider events/ }),
        ).toHaveAttribute("aria-current", "page");
    });
});

test("a business's owner is refused Billing", async ({ page }) => {
    await useSession(page, "owner");
    await page.goto(`${ADMIN}/billing/subscriptions`);
    await expect(
        page.getByText("Not authorized", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
});
