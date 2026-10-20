import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { pressUntil } from "./press";

/**
 * Home's Needs you, whichever layout draws it (DEC-171): at a desk Home A
 * groups it by kind, each group a disclosure that opens its rows in place;
 * below 640px the phone Home (U17) draws one line per group, each opening
 * its rows in a sheet. A spec about the rows opens every group first (at
 * a desk) or the group's sheet (on a phone), then reads the rows
 * (`[data-need-row]`), never the groups.
 */
export function needsYou(page: Page): Locator {
    return page.getByRole("region", { name: "Needs you" });
}

/** Open every closed group of Needs you; nothing on a phone's flat list. */
export async function openNeedGroups(needs: Locator): Promise<void> {
    const groups = needs.locator("[data-need-group]");
    const n = await groups.count();
    for (let i = 0; i < n; i++) {
        const group = groups.nth(i);
        const show = group.getByRole("button", { name: "Show the rows" });
        if ((await show.count()) === 0) continue;
        // The first press after a load may land before hydration.
        await pressUntil(
            show,
            group.getByRole("button", { name: "Hide the rows" }),
        );
    }
    await expect(
        needs.getByRole("button", { name: "Show the rows" }),
    ).toHaveCount(0);
}

/** The kinds Needs you is grouped by (`HomeNeedKind`). */
export type NeedKind =
    | "ORDERS"
    | "BILLS"
    | "AWAITING_PAYMENT"
    | "ENQUIRIES"
    | "PAYMENTS"
    | "REVIEWS"
    | "STOCK"
    | "SETUP";

/** Whether Home draws its phone layout: below 640px (`data-home-layout`). */
export const phoneHome = (page: Page) =>
    (page.viewportSize()?.width ?? 1440) < 640;

/**
 * Open one group's sheet on the phone Home (U17), past "Show N more" when
 * it is folded. Null when Home has no line for that group.
 */
export async function openPhoneGroup(
    page: Page,
    kind: NeedKind,
): Promise<Locator | null> {
    const needs = needsYou(page);
    await expect(needs).toBeVisible();
    const line = needs.locator(`[data-phone-line="${kind}"]`);
    const more = needs.getByRole("button", { name: /^Show \d+ more/ });
    if ((await line.count()) === 0 && (await more.count()) > 0) {
        await pressUntil(more, line);
    }
    if ((await line.count()) === 0) return null;
    const sheet = page.locator(`[role=dialog][data-home-sheet="${kind}"]`);
    // The first press after a load may land before hydration.
    await pressUntil(line, sheet);
    return sheet;
}

/**
 * Every row of Needs you: at a desk with every group open; on a phone,
 * the rows of `kind`'s sheet (opened here), or none when it has no line.
 */
export async function needRows(
    page: Page,
    kind: NeedKind = "ORDERS",
): Promise<Locator> {
    const needs = needsYou(page);
    await expect(needs).toBeVisible();
    if (phoneHome(page)) {
        const sheet = await openPhoneGroup(page, kind);
        return (sheet ?? needs).locator("[data-need-row]");
    }
    await openNeedGroups(needs);
    return needs.locator("[data-need-row]");
}
