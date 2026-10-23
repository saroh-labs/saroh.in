import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { pressUntil } from "./press";

/**
 * The site editor on a phone (DEC-185): no bottom tabs, one floating pill
 * (Blocks · + · Brand), and ⋯ More in the bar. Each opens a sheet from the
 * foot, a dialog named by its title.
 */

/** The pill over the page. */
export const editPill = (page: Page): Locator =>
    page.getByRole("toolbar", { name: "Edit page" });

/**
 * Until no sheet is on its way out: one closing still matches by its name
 * for a moment, and a press on it lands on something leaving the page.
 */
async function settled(page: Page): Promise<void> {
    await expect(
        page.locator('[role="dialog"][data-state="closed"]'),
    ).toHaveCount(0);
}

/** A phone sheet, by its title. */
export const phoneSheet = (page: Page, name: string | RegExp): Locator =>
    page.getByRole("dialog", { name });

/** Open the pill's Blocks, + or Brand, pressed until its sheet shows. */
export async function openFromPill(
    page: Page,
    which: "Blocks" | "Add a block" | "Brand",
): Promise<Locator> {
    await settled(page);
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
    await settled(page);
    const sheet = phoneSheet(page, "More");
    if (await sheet.isVisible()) return sheet;
    await pressUntil(
        page.getByRole("button", { name: /^More: preview/ }),
        sheet,
    );
    return sheet;
}

/** A tab of the phone's Brand sheet, opened with the sheet if need be. */
export async function brandTab(
    page: Page,
    name: "Look" | "Type" | "Colour" | "Spacing",
): Promise<Locator> {
    const sheet = await openFromPill(page, "Brand");
    const tab = sheet.getByRole("tab", { name, exact: true });
    await pressUntil(
        tab,
        async () => (await tab.getAttribute("aria-selected")) === "true",
    );
    return sheet;
}

/**
 * The looks to choose from: behind the Look card's Change on a desk, the
 * Look tab itself on a phone (DEC-185).
 */
export async function lookGallery(
    page: Page,
    phone: boolean,
): Promise<Locator> {
    if (phone) {
        const sheet = await brandTab(page, "Look");
        return sheet.getByRole("group", { name: "Change look" });
    }
    const dialog = page.getByRole("dialog", { name: "Change look" });
    if (!(await dialog.isVisible())) {
        await page.locator("[data-look-change]").click();
    }
    return dialog;
}

/** The typefaces: behind Change on a desk, the Type tab on a phone. */
export async function typefaces(page: Page, phone: boolean): Promise<Locator> {
    if (phone) {
        const sheet = await brandTab(page, "Type");
        return sheet.getByRole("group", { name: "Typeface" });
    }
    await page.locator("[data-typeface-change]").click();
    return page.getByRole("dialog", { name: "Typeface" });
}
