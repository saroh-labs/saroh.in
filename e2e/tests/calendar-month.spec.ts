// @covers accounts:/login app:/open app:/calendar api:calendar api:bookings api:staff
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * Home › Calendar's month (bookings U13, #1029; was Overview) on Pulse
 * Fitness, the seeded gym with a team, at the desk and on a phone: one
 * filter button, What to show; the money on one line with Export; the
 * picked day in a side panel (desk) or a sheet from the foot (phone) with
 * Book on this day. Read-only: Pulse and Rye are film sets, so nothing
 * here saves.
 */

const PULSE = "seed_sc_pulse_org";
const RYE = "seed_sc_rc_org";
const IST_OFFSET_MS = 330 * 60_000;

/** "YYYY-MM-DD" in India today. */
const today = () =>
    new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

async function signIn(page: Page, org = PULSE) {
    await useSession(page);
    await page.goto(`/open/${org}`);
}

async function noSideways(page: Page) {
    const doc = await page.evaluate(() => ({
        vw: window.innerWidth,
        sw: document.documentElement.scrollWidth,
    }));
    expect(doc.sw).toBeLessThanOrEqual(doc.vw);
}

test.describe("calendar month on the desk", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await signIn(page);
    });

    test("one filter button opens What to show, and a layer switched off leaves the label", async ({
        page,
    }) => {
        await page.goto("/calendar");
        const filter = page.getByRole("button", { name: /^What to show/ });
        await expect(filter).toBeVisible();
        await expect(filter).toHaveText(/^Everyone · /);
        await filter.click();
        const box = page.getByRole("dialog", { name: "What to show" });
        await expect(box.getByText("On the calendar")).toBeVisible();
        await expect(
            box.getByRole("radiogroup", { name: "Whose" }),
        ).toBeVisible();
        const layers = box.getByRole("checkbox");
        const first = layers.first();
        const name =
            (await first.locator("span.block").first().textContent()) ?? "";
        await first.click();
        await expect(first).toHaveAttribute("aria-checked", "false");
        await box.getByRole("button", { name: /^Show / }).click();
        await expect(box).toHaveCount(0);
        // Read once it is shut: the open popover is modal, so the page
        // behind it, the button too, is hidden from the accessibility tree.
        await expect(filter).not.toHaveText(new RegExp(name.toLowerCase()));
    });

    test("the picked day sits beside the month with Book on this day", async ({
        page,
    }) => {
        await page.goto("/calendar");
        const panel = page.locator("#calendar-day");
        await expect(panel).toBeVisible();
        await expect(panel.getByRole("heading", { level: 2 })).toHaveText(
            / · today$/,
        );
        await expect(
            panel.getByRole("link", { name: "Book on this day" }),
        ).toHaveAttribute("href", `/bookings?date=${today()}&new=1`);
        await noSideways(page);
    });
});

test.describe("calendar month on a phone", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await signIn(page);
    });

    test("a tapped day rises as a sheet, and Escape gives focus back", async ({
        page,
    }) => {
        await page.goto("/calendar");
        await expect(page.locator("#calendar-day")).toBeHidden();
        const day = page.locator(`#calendar-grid [data-day="${today()}"]`);
        await day.click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText(/ · today$/)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
        await expect(day).toBeFocused();
    });

    test("What to show rises from the foot, and nothing hides sideways", async ({
        page,
    }) => {
        await page.goto("/calendar");
        await page.getByRole("button", { name: /^What to show/ }).click();
        const box = page.getByRole("dialog", { name: "What to show" });
        await expect(box.getByRole("switch").first()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(box).toHaveCount(0);
        await noSideways(page);
    });
});

/**
 * Rye's Member reads orders without their money (E20, DEC-067, DEC-098):
 * no amount anywhere on the month.
 */
test.describe("calendar month without money", () => {
    test("a Member sees no amount, at the desk or in the day", async ({
        page,
    }) => {
        await useSession(page, { email: "nisha.kulkarni@saroh.dev" });
        await page.goto(`/open/${RYE}`);
        await page.goto("/calendar");
        await expect(
            page.getByRole("button", { name: /^What to show/ }),
        ).toBeVisible();
        await expect(page.locator("main")).not.toContainText("₹");
        await expect(
            page.getByRole("group", { name: "This month's money" }),
        ).toHaveCount(0);
    });
});
