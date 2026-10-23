// @covers app:/settings/profile api:notifications
import { expect, test } from "@playwright/test";

import { openNorthwindAs } from "../fixtures/roles";

/**
 * "Members" (DEC-174, #1150) on Your profile: the owner of Northwind, which
 * has Payments on (the base seed), is offered the row, with the bell on and
 * email off by default. It tells them when a member cancels or pauses from
 * their account, or turns off autopay at their bank.
 *
 * Read only: nothing is switched, so it runs beside every other spec.
 */
test.describe("Members alerts", () => {
    test("the owner is offered it, bell on and email off", async ({ page }) => {
        await openNorthwindAs(page, "owner");
        await page.goto("/settings/profile");

        const grid = page.getByRole("table", { name: "Alerts by channel" });
        await expect(grid).toBeVisible();
        const row = grid.getByRole("row", { name: /Members/ });
        await expect(row).toContainText(
            "When a member cancels or pauses, or turns off autopay at their bank",
        );
        await expect(
            row.getByRole("switch", { name: "Members by Bell, on" }),
        ).toHaveAttribute("aria-checked", "true");
        await expect(
            row.getByRole("switch", { name: "Members by Email, off" }),
        ).toHaveAttribute("aria-checked", "false");
    });
});
