import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { pressUntil } from "./press";

/**
 * Home's Needs you, whichever layout draws it (DEC-171): at a desk Home A
 * groups it by kind, each group a disclosure that opens its rows in place;
 * on a phone it is one list until U17. A spec about the rows opens every
 * group first, then reads the rows (`[data-need-row]`), never the groups.
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

/** Every row of Needs you, with every group open. */
export async function needRows(page: Page): Promise<Locator> {
    const needs = needsYou(page);
    await expect(needs).toBeVisible();
    await openNeedGroups(needs);
    return needs.locator("[data-need-row]");
}
