// @covers accounts:/login app:/open app:/bookings app:/bookings/all api:bookings api:staff
import { expect, test } from "@playwright/test";

import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";

/**
 * Bookings' header (BLHB variant B, BKVCalendarB), read on Pulse Fitness:
 * nothing is saved. Calendar | List is one switch in both headers (List is
 * the register of every booking, `/bookings/all`), and the list's six chips
 * are one "Showing: Upcoming" picker, a search icon and one Filters button.
 * "Back to the calendar", "… in all" and the calendar's "All bookings" link
 * are gone, and the sidebar page is now the Business calendar.
 */

const ORG = "seed_sc_pulse_org";

const onPhone = () => test.info().project.name.startsWith("phone");

test.describe("Calendar | List", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${ORG}`);
    });

    test("one switch in both headers: List is the register, Calendar is back", async ({
        page,
    }) => {
        await page.goto("/bookings?layout=day");
        const switcher = page.getByRole("navigation", { name: "Bookings" });
        await expect(
            switcher.getByRole("link", { name: "Calendar" }),
        ).toHaveAttribute("aria-current", "page");
        if (onPhone()) {
            // Full width, 44px options. Measured once it's drawn: a box
            // read before then is undefined.
            const list = switcher.getByRole("link", { name: "List" });
            await expect(list).toBeVisible();
            // The header may draw again as it settles: measure until it holds.
            await expect
                .poll(async () => (await list.boundingBox())?.height ?? 0)
                .toBeGreaterThanOrEqual(44);
        }
        await switcher.getByRole("link", { name: "List" }).click();
        await expect(page).toHaveURL(/\/bookings\/all/);
        await expect(
            page.getByRole("heading", { level: 1, name: "All bookings" }),
        ).toBeVisible();
        const onList = page.getByRole("navigation", { name: "Bookings" });
        await expect(
            onList.getByRole("link", { name: "List" }),
        ).toHaveAttribute("aria-current", "page");
        // The old ways back are gone.
        await expect(page.getByText("Back to the calendar")).toHaveCount(0);
        await onList.getByRole("link", { name: "Calendar" }).click();
        await expect(page).toHaveURL(/\/bookings(\?|$)/);
        await expect(
            page.getByRole("button", { name: /Change the day or the view$/ }),
        ).toBeVisible();
    });

    test("the calendar says Today and names its view, and Show as ends in Agenda", async ({
        page,
    }) => {
        await page.goto("/bookings?layout=week");
        if (onPhone()) {
            // On a phone Today shows only away from today (critique, 25 Nov).
            await expect(page.getByRole("link", { name: "Today" })).toHaveCount(
                0,
            );
            await expect(
                page.getByRole("button", {
                    name: /Change the day or the view$/,
                }),
            ).toContainText("Week");
        } else {
            await expect(
                page.getByRole("link", { name: "Today" }),
            ).toBeVisible();
        }
        const sheet = page.getByRole("dialog", { name: "Go to a day" });
        await pressUntil(
            page.getByRole("button", { name: /Change the day or the view$/ }),
            sheet,
        );
        await expect(
            sheet
                .getByRole("navigation", { name: "Show as" })
                .getByRole("link", { name: "Agenda" }),
        ).toBeVisible();
    });
});

test.describe("the list's header", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${ORG}`);
        await page.goto("/bookings/all");
    });

    test("Showing: Upcoming holds the six views, with counts inside", async ({
        page,
    }) => {
        // No row of six chips: one picker.
        await expect(
            page.getByRole("radiogroup", { name: "Show" }),
        ).toHaveCount(0);
        const views = page.getByRole("radiogroup", { name: "Show" });
        await pressUntil(
            page.getByRole("button", { name: /^Showing: Upcoming/ }),
            views,
        );
        for (const label of [
            "Upcoming",
            "Needs an outcome",
            "Awaiting payment",
            "Today",
            "Next 7 days",
            "All",
        ]) {
            await expect(
                views.getByRole("radio", {
                    name: new RegExp(`^${label}\\s*\\d+$`),
                }),
            ).toBeVisible();
        }
        await views.getByRole("radio", { name: /^Needs an outcome/ }).click();
        await expect(page).toHaveURL(/view=outcome/);
        await expect(
            page.getByRole("button", { name: /^Showing: Needs an outcome/ }),
        ).toBeVisible();
    });

    test("Filters holds Sort and Dates, and Today is not one of the dates", async ({
        page,
    }) => {
        const panel = page.getByRole("dialog", { name: "Filters" });
        await pressUntil(
            page.getByRole("button", { name: /^Filters/ }),
            panel.getByText("Sort by"),
        );
        await expect(panel.getByText("for this view")).toBeVisible();
        const dates = panel.getByRole("radiogroup", { name: "Dates" });
        await expect(
            dates.getByRole("radio", { name: "Any date" }),
        ).toBeVisible();
        await expect(
            dates.getByRole("radio", { name: "Tomorrow" }),
        ).toBeVisible();
        await expect(dates.getByRole("radio", { name: "Today" })).toHaveCount(
            0,
        );
        // Awaiting payment is a view, not a Status.
        await expect(
            panel.getByRole("button", { name: "Awaiting payment" }),
        ).toHaveCount(0);
        await expect(
            panel.getByRole("button", { name: "Didn't come" }),
        ).toBeVisible();
    });

    test("search is an icon that opens its field, and the page says Times in the zone once", async ({
        page,
    }) => {
        await expect(page.getByPlaceholder("Search bookings")).toHaveCount(0);
        await page.getByRole("button", { name: "Search bookings" }).click();
        await expect(page.getByPlaceholder("Search bookings")).toBeVisible();
        if (onPhone()) {
            // The phone's header is Calendar | List and "…": the zone is
            // said in the "…" sheet (critique, 25 Nov).
            const sheet = page.getByRole("dialog", { name: "This list" });
            await pressUntil(
                page.getByRole("button", { name: /^This list:/ }),
                sheet,
            );
            await expect(sheet.getByText(/^Times in \w+$/)).toBeVisible();
        } else {
            await expect(page.getByText(/^Times in \w+$/)).toBeVisible();
        }
        await expect(page.getByText(/\d+ in all$/)).toHaveCount(0);
    });
});
