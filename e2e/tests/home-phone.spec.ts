// @covers accounts:/login app:/open app:/ app:/calendar api:home api:orders api:bookings api:organizations
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { needsYou } from "../fixtures/home";
import { pressUntil } from "../fixtures/press";
import { onPhone, openNorthwindAs } from "../fixtures/roles";

/**
 * Home on a phone, simplified (DEC-171, plan U17, #1103; boards `HPHome`,
 * `HPSheets`, `HPMore`, `HPStates`): three figures, a Next line that opens
 * the day, one line per Needs you group (five, then Show N more) each
 * opening its rows in a sheet, How it's going in a sentence, setup in a
 * line, and the + for New.
 *
 * Checked at 390 and at the 320 floor: every sheet opens and closes with
 * focus back on its line, every control is a thumb's height, nothing hides
 * sideways, the + never sits on the page's last line, and a Member sees no
 * money. Everyone is on Northwind and only reads, except the one @serial
 * test, which marks an arrival and undoes it inside the hold, so nothing
 * is written.
 */

const SIZES = [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
];

const phoneHome = (page: Page) =>
    page.locator('[data-home-layout="phone"] [data-phone-home]');

const figures = (page: Page) =>
    phoneHome(page).getByRole("list", { name: "Today at a glance" });

const groupLines = (page: Page) => needsYou(page).locator("[data-phone-line]");

const sheet = (page: Page) => page.getByRole("dialog");

async function open(
    page: Page,
    role: "owner" | "northwindMember",
    size = SIZES[0],
) {
    await openNorthwindAs(page, role);
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(phoneHome(page)).toBeVisible();
    await expect(needsYou(page)).toBeVisible();
}

/** Whether a page sideways-scrolls past the width the test set. */
async function noSideways(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    await expect
        .poll(() =>
            page.evaluate(() => ({
                vw: window.innerWidth,
                sw: document.documentElement.scrollWidth,
            })),
        )
        .toEqual({ vw: width, sw: width });
}

/**
 * Every control drawn in `within` shorter than a thumb (44px). A stretched
 * link (its `::after` laid over the whole row, as Today's rows are) is
 * pressed anywhere on that row, so it is measured by the row it covers,
 * not by its line of text.
 */
async function short(within: Locator): Promise<string[]> {
    return within.locator("a, button").evaluateAll((els) =>
        els
            .map((el) => {
                const after = getComputedStyle(el, "::after");
                const stretched =
                    after.content !== "none" && after.position === "absolute";
                const target =
                    stretched && el instanceof HTMLElement && el.offsetParent
                        ? el.offsetParent
                        : el;
                return {
                    name: el.textContent.trim().slice(0, 40),
                    h: Math.round(target.getBoundingClientRect().height),
                };
            })
            // Height 0 is a control not drawn here.
            .filter((c) => c.h > 2 && c.h < 44)
            .map((c) => `${c.name} (${c.h}px)`),
    );
}

/** Open a sheet from its line and close it again, focus coming back. */
async function opensAndCloses(
    page: Page,
    line: Locator,
    how: "Escape" | "Close",
) {
    await pressUntil(line, sheet(page));
    const dialog = sheet(page);
    await expect(dialog).toBeVisible();
    expect(await short(dialog)).toEqual([]);
    if (how === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: "Close" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(line).toBeFocused();
}

test.describe("Home on a phone (U17)", () => {
    test.beforeEach(({ page }) => {
        test.skip(!onPhone(page), "The phone's Home");
    });

    for (const size of SIZES) {
        test(`at ${size.width}: three figures, the lines, 44px, nothing sideways`, async ({
            page,
        }) => {
            await open(page, "owner", size);

            // Three figures for an owner, each a link to its screen.
            const links = figures(page).getByRole("link");
            await expect(links).toHaveCount(3);
            await expect(figures(page)).toContainText("in today");
            await expect(figures(page)).toContainText("bookings");
            await expect(figures(page)).toContainText("to pack");

            // The desk's parts are not drawn here.
            await expect(
                page.getByText("Last 24 hours").filter({ visible: true }),
            ).toHaveCount(0);
            await expect(
                page
                    .getByText("To pack or hand over")
                    .filter({ visible: true }),
            ).toHaveCount(0);

            // At most five group lines before Show N more.
            const n = await groupLines(page).count();
            const more = needsYou(page).getByRole("button", {
                name: /^Show \d+ more · /,
            });
            if ((await more.count()) > 0) expect(n).toBe(5);
            else expect(n).toBeLessThanOrEqual(5);

            expect(await short(phoneHome(page))).toEqual([]);
            await noSideways(page);
            await expectNothingHiddenSideways(page);
        });
    }

    test("each group's line opens its sheet, and it closes back onto the line", async ({
        page,
    }) => {
        await open(page, "owner");
        const more = needsYou(page).getByRole("button", {
            name: /^Show \d+ more · /,
        });
        if ((await more.count()) > 0) {
            // Show N more reveals the folded groups and goes.
            await pressUntil(more, async () => (await more.count()) === 0);
        }
        const n = await groupLines(page).count();
        test.skip(n === 0, "Nothing needs Northwind's owner just now");
        for (let i = 0; i < n; i++) {
            const line = groupLines(page).nth(i);
            const title = (
                await line.locator("span.flex-1").innerText()
            ).trim();
            await pressUntil(line, sheet(page));
            const dialog = sheet(page);
            // Its title is the line's, under "Needs you", over its rows.
            await expect(dialog).toContainText("Needs you");
            await expect(dialog.getByRole("heading")).toHaveText(title);
            await expect(
                dialog.locator("[data-need-row]").first(),
            ).toBeVisible();
            // Closed by Escape and by Close, in turn.
            await page.keyboard.press("Escape");
            await expect(sheet(page)).toHaveCount(0);
            await expect(line).toBeFocused();
            if (i === 0) await opensAndCloses(page, line, "Close");
        }
        await noSideways(page);
    });

    test("the Next line opens the day, with Since yesterday and Open the calendar", async ({
        page,
    }) => {
        await open(page, "owner");
        const next = phoneHome(page).locator("[data-phone-next]");
        test.skip((await next.count()) === 0, "No day to open on Northwind");
        await pressUntil(next, sheet(page));
        const day = sheet(page);
        await expect(day.getByRole("heading")).toHaveText(/^Today/);
        await expect(
            day.getByRole("link", { name: /Open the calendar|All orders/ }),
        ).toBeVisible();
        const since = day.getByRole("group", { name: "Since yesterday" });
        if ((await since.count()) > 0) {
            // Each figure goes to exactly the rows it counts.
            const hrefs = await since
                .getByRole("link")
                .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
            for (const href of hrefs) expect(href).toMatch(/since=/);
        }
        expect(await short(day)).toEqual([]);
        await day.getByRole("button", { name: "Close" }).click();
        await expect(sheet(page)).toHaveCount(0);
        await expect(next).toBeFocused();
        await opensAndCloses(page, next, "Escape");
    });

    test("the + never sits on the page's last line", async ({ page }) => {
        await open(page, "owner");
        const plus = page.getByRole("button", { name: "New", exact: true });
        await expect(plus).toBeVisible();
        await page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight),
        );
        // The last thing to press on the page, at the very bottom.
        const last = phoneHome(page).locator("a, button").last();
        await expect(last).toBeVisible();
        const [p, l] = await Promise.all([
            plus.boundingBox(),
            last.boundingBox(),
        ]);
        expect(p).not.toBeNull();
        expect(l).not.toBeNull();
        if (p && l) {
            const overlaps =
                p.x < l.x + l.width &&
                l.x < p.x + p.width &&
                p.y < l.y + l.height &&
                l.y < p.y + p.height;
            expect(overlaps).toBe(false);
        }
    });

    test("the + is on Home only", async ({ page }) => {
        await open(page, "owner");
        await expect(
            page.getByRole("button", { name: "New", exact: true }),
        ).toBeVisible();
        await page.goto("/calendar");
        await expect(
            page.getByRole("button", { name: "New", exact: true }),
        ).toHaveCount(0);
    });

    test("a Member sees Bookings, Came and To pack, and no money anywhere", async ({
        page,
    }) => {
        await open(page, "northwindMember");
        const list = figures(page);
        await expect(list).toBeVisible();
        await expect(list).not.toContainText("in today");
        await expect(list).toContainText("bookings");
        await expect(list).toContainText("came");
        await expect(phoneHome(page)).not.toContainText("₹");
        // Insights isn't open to a Member: the sentence, no way in.
        await expect(
            phoneHome(page).getByRole("link", { name: "Insights" }),
        ).toHaveCount(0);
        // Each sheet holds no money either.
        const n = await groupLines(page).count();
        for (let i = 0; i < n; i++) {
            const line = groupLines(page).nth(i);
            await pressUntil(line, sheet(page));
            await expect(sheet(page)).not.toContainText("₹");
            await page.keyboard.press("Escape");
            await expect(sheet(page)).toHaveCount(0);
        }
        // New offers what the role may start.
        await pressUntil(
            page.getByRole("button", { name: "New", exact: true }),
            page.getByRole("dialog", { name: "New" }),
        );
        await expect(page.getByRole("dialog", { name: "New" })).toContainText(
            "Book someone",
        );
        await expect(
            page.getByRole("dialog", { name: "New" }),
        ).not.toContainText("Send an invoice");
    });

    // @serial: marks one of Northwind's own bookings and undoes it within
    // the hold, so nothing is written; nothing else may mark it meanwhile.
    test(
        "Mark arrived in the day sheet is held, and Undo leaves the booking as it was",
        { tag: "@serial" },
        async ({ page }) => {
            await open(page, "owner");
            const next = phoneHome(page).locator("[data-phone-next]");
            test.skip((await next.count()) === 0, "No day on Northwind");
            await pressUntil(next, sheet(page));
            const day = sheet(page);
            const arrive = day
                .getByRole("button", { name: "Mark arrived" })
                .first();
            test.skip(
                (await arrive.count()) === 0,
                "Nobody to mark on Northwind just now",
            );
            await arrive.click();
            await expect(day.getByText(/^Came/).first()).toBeVisible();
            const undo = page
                .getByRole("button", { name: "Undo" })
                .filter({ visible: true })
                .first();
            await undo.click();
            await expect(
                day.getByRole("button", { name: "Mark arrived" }).first(),
            ).toBeVisible();
        },
    );
});
