import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * Home › Calendar's Week (plan 005 E25) on Rye & Co., the seeded bakery:
 * Month | Week, Monday to Sunday as card columns, ‹ › by week and "This
 * week", a week crossing into the next month read whole, and a day's
 * header opening the day as a sheet. Read-only: Rye is a film set, so
 * nothing here saves.
 */

const ORG = "seed_sc_rc_org";
const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

/** Pulse Fitness: a team of two, so its Week is an hour grid (E27). */
const PULSE = "seed_sc_pulse_org";

async function signIn(page: Page, org = ORG) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
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
                    `^\\d{1,2}( (${MONTHS}))?( \\d{4})?–\\d{1,2} (${MONTHS}) \\d{4}$`,
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
        // Rye has no team: no filter, and the layer switches still apply.
        await expect(page.getByLabel("Team member")).toHaveCount(0);
        await expect(
            page.getByRole("group", { name: "Show on the calendar" }),
        ).toBeVisible();
    });

    test("‹ › step by week and This week comes back", async ({ page }) => {
        await page.goto("/calendar?view=week");
        const title = page.getByRole("heading", { level: 1 });
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
                    `^\\d{1,2} (${MONTHS})( \\d{4})?–\\d{1,2} (${MONTHS}) \\d{4}$`,
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
        await signIn(page, PULSE);
    });

    test("a business with a team sees its week by the hour", async ({
        page,
    }) => {
        await page.goto("/calendar?view=week");
        const grid = page.locator("#calendar-week");
        await expect(grid.getByText("All day")).toBeVisible();
        await expect(grid.getByText("07:00", { exact: true })).toBeVisible();
        await expect(grid.locator("button[data-day]")).toHaveCount(7);
        // Every block and chip opens its record.
        const links = grid.locator("a[href]");
        const n = await links.count();
        for (let i = 0; i < Math.min(n, 10); i++) {
            await expect(links.nth(i)).toHaveAttribute(
                "href",
                /^\/(commerce\/orders|billing\/(subscriptions|invoices)|bookings|services)\//,
            );
        }
    });

    test("the grid scrolls inside its frame on a phone, never the page", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/calendar?view=week");
        await expect(page.locator("#calendar-week")).toBeVisible();
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
        await page.goto(`${urls.ACCOUNTS_URL}/login`);
        await page.getByLabel("Email").fill(member.email);
        await page
            .getByLabel("Password", { exact: true })
            .fill(member.password);
        await page.getByRole("button", { name: "Log in" }).click();
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
            timeout: 30_000,
        });
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
        await expect(
            page
                .getByRole("group", { name: "Show on the calendar" })
                .getByRole("button", { name: /Orders/ }),
        ).toBeVisible();
        await expect(
            page.getByRole("group", { name: "This month's money" }),
        ).toHaveCount(0);
    });
});
