// @covers app:/settings/providers app:/open api:communications
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { pressUntil } from "../fixtures/press";
import { urls } from "../playwright.config";

/**
 * Settings › Providers' "Emails to your customers" (DEC-174, U4 #1135):
 * one switch for each automatic email Saroh sends the business's
 * customers from its own email, read first in a row and changed in a side
 * sheet, each switch saved as it is flipped with Undo.
 *
 * Each test sets up a business of its own (`makeBusiness`, as Asha, its
 * owner), so a switch flipped here is read by nothing else and the test
 * runs beside every other.
 *
 * What is listed is the API's (`communications/notice-settings.ts`): only
 * the emails Saroh sends today (`NOTICE_SENDS`, flipped by each unit that
 * ships a sender) whose module is on. Until the first sender ships the
 * business is offered none, and the first test pins that no row is drawn
 * then, so no switch that does nothing is ever shown. The second runs once
 * one is offered, and is skipped, saying why, until then.
 *
 * The words, the one-note rule, the read-only sheet and a refused save
 * are covered by `customer-emails*.test.ts(x)` beside the components; the
 * listing, the 403 and the 409 by the API's `notice-settings` specs.
 */

interface Listed {
    notices: { kind: string; label: string; on: boolean; offered: boolean }[];
    canChange: boolean;
    emailConnected: boolean;
}

const api = (b: OwnBusiness) =>
    `${urls.API_URL}/organizations/${b.id}/customer-notices/settings`;

const headers = (b: OwnBusiness) => ({
    origin: urls.APP_URL,
    "x-organization-id": b.id,
});

async function listed(page: Page, b: OwnBusiness): Promise<Listed> {
    const res = await page.request.get(api(b), { headers: headers(b) });
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as Listed;
}

async function openProviders(page: Page, b: OwnBusiness) {
    await page.goto(`/open/${b.id}`);
    await page.goto("/settings/providers");
    await expect(
        page.getByRole("heading", { name: "Providers", level: 1 }),
    ).toBeVisible();
}

const block = (page: Page) =>
    page.getByRole("region", { name: "Emails to your customers" });

/** Never sideways, at the width the project set. */
async function noSideways(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    // A phone widens innerWidth to fit content that overflows.
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
}

test("a row only while an email is offered, with a switch for exactly those", async ({
    page,
}, testInfo) => {
    const b = await makeBusiness(page, testInfo, "ce-row");
    const read = await listed(page, b);
    expect(read.canChange).toBe(true);

    await openProviders(page, b);
    if (read.notices.length === 0) {
        // No email Saroh sends yet: no row, no switch that does nothing.
        await expect(block(page)).toHaveCount(0);
        await expect(page.getByText("Automatic emails")).toHaveCount(0);
        await noSideways(page);
        return;
    }

    await expect(block(page)).toBeVisible();
    const edit = block(page).getByRole("button", {
        name: "Edit emails to your customers",
    });
    const sheet = page.getByRole("dialog", {
        name: "Emails to your customers",
    });
    await pressUntil(edit, sheet);
    await expect(sheet.getByRole("switch")).toHaveCount(read.notices.length);
    for (const n of read.notices) {
        await expect(
            sheet.getByRole("switch", { name: n.label, exact: true }),
        ).toHaveAttribute("aria-checked", String(n.on));
    }
    await noSideways(page);
});

test("an owner turns one off, Undo turns it back on, and the sheet fits", async ({
    page,
}, testInfo) => {
    const b = await makeBusiness(page, testInfo, "ce-flip");
    const read = await listed(page, b);
    const target = read.notices.find((n) => n.offered && n.on);
    test.skip(
        !target,
        "No automatic email Saroh sends is offered to a new business yet",
    );
    if (!target) return;

    await openProviders(page, b);
    const sheet = page.getByRole("dialog", {
        name: "Emails to your customers",
    });
    await pressUntil(
        block(page).getByRole("button", {
            name: "Edit emails to your customers",
        }),
        sheet,
    );
    const toggle = sheet.getByRole("switch", {
        name: target.label,
        exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await noSideways(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(`${target.label} turned off.`)).toBeVisible();
    await expect
        .poll(
            async () =>
                (await listed(page, b)).notices.find(
                    (n) => n.kind === target.kind,
                )?.on,
        )
        .toBe(false);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect
        .poll(
            async () =>
                (await listed(page, b)).notices.find(
                    (n) => n.kind === target.kind,
                )?.on,
        )
        .toBe(true);
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(block(page)).toContainText(
        read.notices.every((n) => n.on) ? "All on" : "on",
    );
});
