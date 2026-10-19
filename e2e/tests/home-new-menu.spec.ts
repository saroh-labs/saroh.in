// @covers accounts:/login app:/open app:/ app:/commerce/orders app:/bookings app:/billing/invoices/new api:home api:organizations api:capabilities api:orders api:bookings api:invoices
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { pressUntil } from "../fixtures/press";
import { onPhone, openNorthwindAs, WHO_CAN_CHANGE } from "../fixtures/roles";
import type { Role } from "../fixtures/sessions";

/**
 * Home's New (DEC-171, plan U5, #1082): a menu by the greeting at a desk,
 * the + over the tab bar on a phone, offering what the person's
 * permissions let them start: Take an order, Book someone, Send an
 * invoice. A Member holds `booking:write` (DEC-170) but neither
 * `order:create` nor `invoice:write`, so they are offered Book someone and
 * told once what else their role leaves out. A Reviewer may start none of
 * them and is shown no New at all.
 *
 * Each start opens its own flow where it lives, already open: New order's
 * sheet over Orders, New booking's over Bookings, and the invoice editor.
 * Nothing is saved: each flow is opened and left. Everyone is on
 * Northwind, which sells and takes bookings; only read here.
 */

const EVERY = ["Take an order", "Book someone", "Send an invoice"];
const MEMBER_LINE = `Taking orders and sending invoices aren't part of your role. ${WHO_CAN_CHANGE}`;

/** Who sees what: Calendar only is a role the business made (#868). */
const OFFERS: readonly {
    who: string;
    role: Role;
    items: string[];
    line: string | null;
}[] = [
    { who: "an Owner", role: "owner", items: EVERY, line: null },
    { who: "an Admin", role: "admin", items: EVERY, line: null },
    {
        who: "a Member",
        role: "northwindMember",
        items: ["Book someone"],
        line: MEMBER_LINE,
    },
    {
        who: "Calendar only, a role the business made",
        role: "calendarOnly",
        items: ["Book someone"],
        line: MEMBER_LINE,
    },
];

/** The desk's New button, level with the greeting. */
const deskNew = (page: Page) =>
    page.getByRole("button", { name: "New", exact: true }).filter({
        visible: true,
    });

/** The New menu at a desk, or the New sheet on a phone. */
const surface = (page: Page) =>
    onPhone(page)
        ? page.getByRole("dialog", { name: "New" })
        : page.getByRole("menu");

/** Its rows, by their first line. */
const rowsOf = (open: Locator, page: Page) =>
    onPhone(page) ? open.getByRole("link") : open.getByRole("menuitem");

/** Open New on Home: the menu at a desk, the sheet on a phone. */
async function openNew(page: Page): Promise<Locator> {
    const open = surface(page);
    // The same accessible name, "New", on both: the + is the phone's.
    await pressUntil(deskNew(page).first(), open);
    return open;
}

async function rowLabels(page: Page, open: Locator) {
    const rows = rowsOf(open, page);
    const n = await rows.count();
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
        const text = (await rows.nth(i).innerText()).split("\n")[0]?.trim();
        if (text) labels.push(text);
    }
    return labels;
}

test.describe("Home's New, by role (U5)", () => {
    for (const { who, role, items, line } of OFFERS) {
        test(`offers ${who} ${items.join(", ")}`, async ({ page }) => {
            await openNorthwindAs(page, role);
            await expect(page).toHaveURL(/\/$/);
            const open = await openNew(page);
            await expect.poll(() => rowLabels(page, open)).toEqual(items);
            if (line) await expect(open.getByText(line)).toBeVisible();
            else await expect(open).not.toContainText("part of your role");
        });
    }

    test("shows a Reviewer no New at all", async ({ page }) => {
        await openNorthwindAs(page, "reviewer");
        await expect(page).toHaveURL(/\/$/);
        await expect(
            page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();
        await expect(deskNew(page)).toHaveCount(0);
    });
});

test.describe("each start opens its flow, already open (U5)", () => {
    const FLOWS: readonly {
        label: string;
        role: Role;
        lands: RegExp;
        open: (page: Page) => Locator;
    }[] = [
        {
            label: "Take an order",
            role: "owner",
            lands: /\/commerce\/orders\?new=1/,
            open: (page) => page.getByRole("dialog", { name: "New order" }),
        },
        {
            label: "Book someone",
            role: "owner",
            lands: /\/bookings\?new=1/,
            open: (page) => page.getByRole("dialog", { name: "New booking" }),
        },
        {
            // The gap the plan found (A17): the rail's mirror of a Member
            // has no booking:write, the API does, and the flow opens.
            label: "Book someone",
            role: "northwindMember",
            lands: /\/bookings\?new=1/,
            open: (page) => page.getByRole("dialog", { name: "New booking" }),
        },
        {
            label: "Send an invoice",
            role: "owner",
            lands: /\/billing\/invoices\/new$/,
            open: (page) => page.getByRole("heading", { name: "New invoice" }),
        },
    ];

    for (const flow of FLOWS) {
        test(`${flow.label} (${flow.role}) opens where it lives`, async ({
            page,
        }) => {
            await openNorthwindAs(page, flow.role);
            await expect(page).toHaveURL(/\/$/);
            const open = await openNew(page);
            await rowsOf(open, page).filter({ hasText: flow.label }).click();
            await expect(page).toHaveURL(flow.lands);
            await expect(flow.open(page)).toBeVisible();
            // Opened there, and left there: no second hop mid-task.
            await expect(page).toHaveURL(flow.lands);
        });
    }
});

test.describe("the desk's New menu by keyboard (U5)", () => {
    test.beforeEach(({ page }) => {
        test.skip(onPhone(page), "The phone's New is the + sheet.");
    });

    test("Enter opens it on the first row, arrows move, Escape closes and focus goes back", async ({
        page,
    }) => {
        await openNorthwindAs(page, "owner");
        const button = deskNew(page).first();
        await expect(button).toBeVisible();
        const menu = page.getByRole("menu");
        const items = menu.getByRole("menuitem");

        // Pressed until it answers: a press before hydration is lost.
        await expect(async () => {
            await button.focus();
            await page.keyboard.press("Enter");
            await expect(menu).toBeVisible({ timeout: 2_000 });
        }).toPass({ timeout: 20_000 });
        await expect(items.nth(0)).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(items.nth(1)).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await expect(items.nth(0)).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(button).toBeFocused();

        // And Enter on a row starts it.
        await page.keyboard.press("Enter");
        await expect(items.nth(0)).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(items.nth(1)).toHaveText(/Book someone/);
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/bookings\?new=1/);
        await expect(
            page.getByRole("dialog", { name: "New booking" }),
        ).toBeVisible();
    });

    test("sits level with the greeting, the menu under it", async ({
        page,
    }) => {
        await openNorthwindAs(page, "owner");
        const button = deskNew(page).first();
        const title = page.getByRole("heading", { level: 1 }).first();
        await expect(button).toBeVisible();
        const [b, t] = await Promise.all([
            button.boundingBox(),
            title.boundingBox(),
        ]);
        // Level with the title's first line, on the right.
        expect(Math.abs((b?.y ?? 0) - (t?.y ?? 0))).toBeLessThan(24);
        expect(b?.x ?? 0).toBeGreaterThan((t?.x ?? 0) + (t?.width ?? 0));
        await pressUntil(button, page.getByRole("menu"));
        const menuBox = await page.getByRole("menu").boundingBox();
        expect(menuBox?.width ?? 0).toBeCloseTo(300, 0);
        expect(menuBox?.y ?? 0).toBeGreaterThan(b?.y ?? 0);
        // The + is the phone's alone.
        await expect(page.locator('button[aria-label="New"]')).toBeHidden();
    });
});

test.describe("the phone's + sheet (U5)", () => {
    test.beforeEach(({ page }) => {
        test.skip(!onPhone(page), "The desk's New is a menu.");
    });

    test("opens by touch with 44px rows, and closes by Escape and by Close", async ({
        page,
    }) => {
        // Guard the guard: without a touch pointer, 44px is not the rule.
        expect(
            await page.evaluate(
                () => window.matchMedia("(pointer: coarse)").matches,
            ),
        ).toBe(true);
        await openNorthwindAs(page, "owner");
        const plus = deskNew(page).first();
        // Over the tab bar, not under it.
        const bar = page.getByRole("navigation", { name: "Main" });
        const [p, b] = await Promise.all([
            plus.boundingBox(),
            bar.boundingBox(),
        ]);
        expect((p?.y ?? 0) + (p?.height ?? 0)).toBeLessThanOrEqual(b?.y ?? 0);
        expect(p?.height).toBe(56);

        const sheet = await openNew(page);
        await expect(sheet.getByRole("heading", { name: "New" })).toBeVisible();
        const rows = sheet.getByRole("link");
        await expect(rows).toHaveCount(3);
        for (let i = 0; i < 3; i++) {
            const box = await rows.nth(i).boundingBox();
            expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
        const close = sheet.getByRole("button", { name: "Close" });
        await expect(close).toBeFocused();
        expect((await close.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
            44,
        );
        await expectNothingHiddenSideways(page);

        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(plus).toBeFocused();

        await plus.tap();
        await expect(sheet).toBeVisible();
        await close.tap();
        await expect(sheet).toBeHidden();
    });

    test("tapping Take an order opens New order over Orders", async ({
        page,
    }) => {
        await openNorthwindAs(page, "owner");
        const sheet = await openNew(page);
        await sheet.getByRole("link", { name: /^Take an order/ }).tap();
        await expect(page).toHaveURL(/\/commerce\/orders\?new=1/);
        await expect(
            page.getByRole("dialog", { name: "New order" }),
        ).toBeVisible();
    });

    test("is on Home only", async ({ page }) => {
        await openNorthwindAs(page, "owner");
        await expect(deskNew(page)).toHaveCount(1);
        await page.goto("/commerce/products");
        await expect(
            page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "New", exact: true }).filter({
                visible: true,
            }),
        ).toHaveCount(0);
    });
});
