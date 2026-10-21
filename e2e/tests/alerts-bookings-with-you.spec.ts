// @covers app:/settings/profile api:notifications
import { expect, test } from "@playwright/test";

import { openNorthwindAs } from "../fixtures/roles";

/**
 * "Bookings with you" (DEC-174, #1138) on Your profile: someone on the
 * diary with a login (Tara, Calendar only on Northwind, the seed's
 * `calendar-only-teammate.ts`) is offered the row, with email on by
 * default. Calendar only has no business bell, so the grid draws Email
 * alone; their own booking alerts reach their own alerts regardless.
 *
 * Read only: nothing is switched, so it runs beside every other spec.
 */
test.describe("Bookings with you", () => {
    test("someone on the diary is offered it, with email on", async ({
        page,
    }) => {
        await openNorthwindAs(page, "calendarOnly");
        await page.goto("/settings/profile");

        const grid = page.getByRole("table", { name: "Alerts by channel" });
        await expect(grid).toBeVisible();
        const row = grid.getByRole("row", { name: /Bookings with you/ });
        await expect(row).toContainText(
            "When a booking with you is made, moved or cancelled",
        );
        await expect(
            row.getByRole("switch", { name: "Bookings with you by Email, on" }),
        ).toHaveAttribute("aria-checked", "true");
    });
});
