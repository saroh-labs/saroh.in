import type { Locator, Page } from "@playwright/test";

import { pressUntil } from "./press";

/**
 * The site editor on a phone (DEC-185): no bottom tabs, one floating pill
 * (Blocks · + · Brand), and ⋯ More in the bar. Each opens a sheet from the
 * foot, a dialog named by its title.
 */

/** The pill over the page. */
export const editPill = (page: Page): Locator =>
    page.getByRole("toolbar", { name: "Edit page" });

/** A phone sheet, by its title. */
export const phoneSheet = (page: Page, name: string | RegExp): Locator =>
    page.getByRole("dialog", { name });

/** Open the pill's Blocks, + or Brand, pressed until its sheet shows. */
export async function openFromPill(
    page: Page,
    which: "Blocks" | "Add a block" | "Brand",
): Promise<Locator> {
    const sheet = phoneSheet(page, which === "Blocks" ? /^Blocks on / : which);
    if (await sheet.isVisible()) return sheet;
    await pressUntil(
        editPill(page).getByRole("button", { name: which, exact: true }),
        sheet,
    );
    return sheet;
}

/** Open ⋯ More, pressed until it shows. */
export async function openMore(page: Page): Promise<Locator> {
    const sheet = phoneSheet(page, "More");
    if (await sheet.isVisible()) return sheet;
    await pressUntil(
        page.getByRole("button", { name: /^More: preview/ }),
        sheet,
    );
    return sheet;
}
