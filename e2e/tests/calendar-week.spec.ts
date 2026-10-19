// @covers accounts:/login app:/open app:/calendar api:calendar api:orders api:bookings api:staff
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Home › Calendar's Week (plan 005 E25; bookings U14, #1030) on Rye & Co.,
 * the seeded bakery: Month | Week, Monday to Sunday as card columns, ‹ ›
 * by week and "This week", a week crossing into the next month read whole,
 * and a day's head opening the day as a sheet. On a phone (Pulse) a strip
 * of seven days and the picked day's list, never the grid. Read-only: Rye
 * and Pulse are film sets, so nothing here saves.
 */

const ORG = "seed_sc_rc_org";
const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

/** Pulse Fitness: a team of two, so its Week is an hour grid (E27). */
const PULSE = "seed_sc_pulse_org";

async function signIn(page: Page, org = ORG) {
    await useSession(page);
    await page.goto(`/open/${org}`);
}

/** "YYYY-MM-DD" in India, `days` from today. */
function istDay(days: number): string {
    return new Date(Date.now() + IST_OFFSET_MS + days * 86_400_000)
        .toISOString()
        .slice(0, 10);
}

/** A day, within the next month, whose Mon–Sun week crosses a month's end. */
function crossingDay(): string {
    for (let n = 0; n < 40; n++) {
        const d = istDay(n);
        const [y, m, dd] = d.split("-").map(Number);
        const at = new Date(Date.UTC(y, m - 1, dd));
        const monday = new Date(at);
        monday.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);
        if (monday.getUTCMonth() !== sunday.getUTCMonth()) return d;
    }
    throw new Error("No week in the next 40 days crosses a month");
}

test.describe("calendar week", () => {
    test.beforeEach(async ({ page }) => {
        // The columns are the desk's; a phone gets the strip (its own
        // describe below), never #calendar-week.
        await page.setViewportSize({ width: 1440, height: 900 });
        await signIn(page);
    });

    test("Month | Week opens this week as seven columns", async ({ page }) => {
        await page.goto("/calendar");
        const view = page.getByRole("radiogroup", { name: "View" });
        await expect(
            view.getByRole("radio", { name: "Month", checked: true }),
        ).toBeVisible();
        await view.getByRole("radio", { name: "Week" }).click();
        await page.waitForURL(/view=week/);

        await expect(
            page.getByRole("heading", {
                level: 1,
                name: new RegExp(
                    `^\\d{1,2}( (${MONTHS}))?( \\d{4})? to \\d{1,2} (${MONTHS})( \\d{4})?$`,
                ),
            }),
        ).toBeVisible();
        await expect(
            view.getByRole("radio", { name: "Week", checked: true }),
        ).toBeVisible();
        await expect(page.locator("#calendar-week [data-day]")).toHaveCount(7);
        await expect(
            page.getByRole("button", { name: "This week" }),
        ).toBeDisabled();
        // Rye has no team: What to show names only the layers (U14).
        await expect(
            page.getByRole("button", { name: /^What to show: [A-Z]/ }),
        ).toBeVisible();
    });

    test("‹ › step by week and This week comes back", async ({ page }) => {
        await page.goto("/calendar?view=week");
        const title = page.getByRole("heading", { level: 1 });
        // The loading shell has a heading of its own ("Loading"): read the
        // week's once the week is there.
        await expect(title).toHaveText(
            new RegExp(
                `^\\d{1,2}( (${MONTHS}))?( \\d{4})? to \\d{1,2} (${MONTHS})( \\d{4})?$`,
            ),
        );
        const thisWeek = await title.textContent();
        await page.getByRole("link", { name: "Next week" }).click();
        await page.waitForURL(/view=week&day=/);
        await expect(title).not.toHaveText(thisWeek ?? "");
        await page.getByRole("link", { name: "This week" }).click();
        await expect(title).toHaveText(thisWeek ?? "");
    });

    test("a week crossing a month reads both halves", async ({ page }) => {
        const day = crossingDay();
        await page.goto(`/calendar?view=week&day=${day}`);
        await expect(
            page.getByRole("heading", {
                level: 1,
                name: new RegExp(
                    `^\\d{1,2} (${MONTHS})( \\d{4})? to \\d{1,2} (${MONTHS})( \\d{4})?$`,
                ),
            }),
        ).toBeVisible();
        const days = page.locator("#calendar-week [data-day]");
        await expect(days).toHaveCount(7);
        const dates = await days.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-day") ?? ""),
        );
        expect(new Set(dates.map((d) => d.slice(0, 7))).size).toBe(2);
    });

    test("a day's header opens the day as a sheet and gives focus back", async ({
        page,
    }) => {
        await page.goto("/calendar?view=week");
        const header = page.locator(`#calendar-week [data-day="${istDay(0)}"]`);
        await header.click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText(/· today$/)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
        await expect(header).toBeFocused();
    });

    test("each card opens its record, and the page never scrolls sideways", async ({
        page,
    }) => {
        await page.goto("/calendar?view=week");
        // The week itself: counted or measured before it is drawn, there
        // are no cards to check and nothing wide.
        await expect(page.locator("#calendar-week")).toBeVisible();
        const cards = page.locator("#calendar-week a[href]");
        const n = await cards.count();
        for (let i = 0; i < Math.min(n, 10); i++) {
            await expect(cards.nth(i)).toHaveAttribute(
                "href",
                /^\/(commerce\/orders|billing\/(subscriptions|invoices)|bookings|services)\//,
            );
        }
        const doc = await page.evaluate(() => ({
            vw: window.innerWidth,
            sw: document.documentElement.scrollWidth,
        }));
        expect(doc.sw).toBeLessThanOrEqual(doc.vw);
    });
});

test.describe("calendar week, hour grid", () => {
    test.beforeEach(async ({ page }) => {
        // The hour grid is the desk's; a phone gets the strip.
        await page.setViewportSize({ width: 1440, height: 900 });
        await signIn(page, PULSE);
    });

    test("a business with a team sees its week by the hour", async ({
        page,
    }) => {
        await page.goto("/calendar?view=week");
        const grid = page.locator("#calendar-week");
        await expect(grid.getByText("All day")).toBeVisible();
        await expect(grid.getByText("7 am", { exact: true })).toBeVisible();
        await expect(grid.locator("button[data-day]")).toHaveCount(7);
        // Every block and chip opens its record; Book and Open hours open
        // the day in Bookings (U14).
        const links = grid.locator("a[href]");
        const n = await links.count();
        for (let i = 0; i < Math.min(n, 10); i++) {
            await expect(links.nth(i)).toHaveAttribute(
                "href",
                /^\/(commerce\/orders|billing\/(subscriptions|invoices)|bookings|services)(\/|\?date=)/,
            );
        }
    });

    test("each day's head offers Book, or says the day is closed", async ({
        page,
    }) => {
        await page.goto("/calendar?view=week");
        await expect(page.locator("[data-week-totals=desk]")).toHaveText(
            /^This week · |^Nothing/,
        );
        const today = page
            .locator(`#calendar-week [data-day="${istDay(0)}"]`)
            .locator("..");
        const book = today.getByRole("link", { name: /^Book on / });
        const closed = today.getByText(/^Closed/);
        await expect(book.or(closed)).toBeVisible();
        if (await book.isVisible()) {
            await expect(book).toHaveAttribute(
                "href",
                `/bookings?date=${istDay(0)}&new=1`,
            );
        }
    });
});

test.describe("calendar week on a phone", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 740 });
        await signIn(page, PULSE);
    });

    test("a strip of seven days and the picked day's list, nothing sideways", async ({
        page,
    }) => {
        await page.goto("/calendar?view=week");
        const strip = page.getByRole("radiogroup", { name: "Pick a day" });
        await expect(strip.getByRole("radio")).toHaveCount(7);
        await expect(
            strip.locator(`[data-strip-day="${istDay(0)}"]`),
        ).toHaveAttribute("aria-checked", "true");
        // The old 880px grid is never drawn on a phone.
        await expect(page.locator("#calendar-week")).toHaveCount(0);
        await expect(
            page.getByRole("heading", { level: 2, name: / · today$/ }),
        ).toBeVisible();
        const next = page.locator(`[data-strip-day="${istDay(1)}"]`);
        if (await next.isEnabled()) {
            await next.click();
            await expect(next).toHaveAttribute("aria-checked", "true");
        }
        const doc = await page.evaluate(() => ({
            vw: window.innerWidth,
            sw: document.documentElement.scrollWidth,
        }));
        expect(doc.sw).toBeLessThanOrEqual(doc.vw);
    });
});

/**
 * The orders layer reaches whoever moves orders (E20, DEC-067): Rye's
 * Member holds `order:stage`, and sees the orders on the calendar without
 * their money. Read-only.
 */
test.describe("calendar orders for the kitchen (E20)", () => {
    const member = {
        email: "nisha.kulkarni@saroh.dev",
        password: "demo-password-123",
    };

    test("a Member sees the orders layer, and no amount or money strip", async ({
        page,
    }) => {
        await useSession(page, member);
        await page.goto(`/open/${ORG}`);

        const from = `${istDay(0).slice(0, 7)}-01`;
        const res = await page.request.get(
            `${urls.API_URL}/organizations/${ORG}/calendar?from=${from}&to=${istDay(0)}`,
            { headers: { "x-organization-id": ORG, origin: urls.APP_URL } },
        );
        expect(res.ok()).toBe(true);
        const month = (await res.json()) as {
            layers: string[];
            money?: unknown;
            days: { layers: { orders?: { items: object[] } } }[];
        };
        expect(month.layers).toContain("orders");
        expect(month).not.toHaveProperty("money");
        for (const day of month.days) {
            for (const item of day.layers.orders?.items ?? []) {
                expect(item).not.toHaveProperty("amount");
            }
        }

        await page.goto("/calendar");
        // The month's What to show names the layers on (bookings U13). Rye
        // has no team, so the label starts with the first layer, from a
        // capital: "Orders, bookings and …".
        await expect(
            page.getByRole("button", { name: /^What to show: .*\borders\b/i }),
        ).toBeVisible();
        await expect(
            page.getByRole("group", { name: "This month's money" }),
        ).toHaveCount(0);
    });
});

/**
 * The month strip's Still due counts from today, as the design shows, and what
 * was due before today is Overdue (E23, DEC-067). Rye is only read.
 */
test.describe("calendar money: Due from today (E23)", () => {
    test("Due is what's owed from today; Overdue shows only when something before today is", async ({
        page,
    }) => {
        await signIn(page);
        const today = istDay(0);
        const from = `${today.slice(0, 7)}-01`;
        const res = await page.request.get(
            `${urls.API_URL}/organizations/${ORG}/calendar?from=${from}&to=${today}`,
            { headers: { "x-organization-id": ORG, origin: urls.APP_URL } },
        );
        expect(res.ok()).toBe(true);
        const month = (await res.json()) as {
            money?: {
                total: unknown;
                entries: { date: string; due: number }[];
            };
        };
        test.skip(!month.money?.total, "No money to read here.");
        const overdue = (month.money?.entries ?? []).some(
            (e) => e.due > 0 && e.date < today,
        );

        await page.goto("/calendar");
        const strip = page.getByRole("group", { name: "This month's money" });
        await expect(
            strip.getByRole("button", { name: /^Still due/ }),
        ).toBeVisible();
        await expect(
            strip.getByRole("button", { name: /^Overdue/ }),
        ).toHaveCount(overdue ? 1 : 0);
    });
});
