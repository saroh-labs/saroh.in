import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { pressUntil } from "./press";

/**
 * An invoice's details (DEC-173, U9 #1121) put each action where its state
 * puts it: the one main button and what sits beside it in the money card,
 * the rest in Share or More. These find an action wherever it is, on the
 * invoice's page or in the list's side sheet, so a spec says what it does,
 * not where the button sits today.
 */

/** The money card's own button, the one on screen. */
export function cardAction(page: Page, name: string): Locator {
    return page
        .locator("[data-money-card]")
        .filter({ visible: true })
        .getByRole("button", { name, exact: true });
}

/** Share's or More's button, the one on screen. */
export function menuButton(page: Page, menu: "Share" | "More"): Locator {
    return page
        .locator(`[data-menu="${menu.toLowerCase()}"]`)
        .filter({ visible: true })
        .first();
}

/**
 * Opens Share or More and gives back its item. An item that is off says
 * why under its name, so it is matched from the start of its name.
 */
export async function menuItem(
    page: Page,
    menu: "Share" | "More",
    name: string,
    { timeout = 20_000 }: { timeout?: number } = {},
): Promise<Locator> {
    const item = page.getByRole("menuitem", {
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    });
    await pressUntil(menuButton(page, menu), item, { timeout });
    return item;
}

/** Closes an open menu without choosing. */
export async function closeMenu(page: Page): Promise<void> {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
}

/**
 * Presses an action wherever it is: a button on screen first, then Share,
 * then More.
 */
export async function pressInvoiceAction(
    page: Page,
    name: string,
): Promise<void> {
    const button = page
        .getByRole("button", { name, exact: true })
        .filter({ visible: true });
    if ((await button.count()) > 0) {
        await button.first().click();
        return;
    }
    for (const menu of ["Share", "More"] as const) {
        if ((await menuButton(page, menu).count()) === 0) continue;
        const item = await menuItem(page, menu, name, {
            timeout: 6_000,
        }).catch(() => null);
        if (item && (await item.count()) > 0) {
            await item.click();
            return;
        }
        if ((await page.getByRole("menu").count()) > 0) await closeMenu(page);
    }
    throw new Error(`No "${name}" on this invoice`);
}
