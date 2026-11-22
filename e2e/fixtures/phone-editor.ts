import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { pressUntil } from "./press";
import { websiteAreaOn } from "./website-area";

/**
 * The site editor on a phone (DEC-185): no bottom tabs, one floating pill
 * (Blocks · + · Brand), and ⋯ More in the bar. Each opens a sheet from the
 * foot, a dialog named by its title. With the Website area on (CI's stack,
 * `fixtures/website-area.ts`) the pill is the foot's bar instead (U49):
 * Sections · Add · Brand · Publish, whose sheets are "Sections on this
 * page", "Add" and "Brand".
 */

/** The pill over the page, or with the Website area on the foot's bar. */
export const editPill = (page: Page): Locator =>
    page
        .getByRole("toolbar", { name: "Edit page" })
        .or(page.getByRole("navigation", { name: "Editor", exact: true }));

/** Each pill button's name, and its sheet's: today's, then the area's. */
const PILL = {
    Blocks: { button: /^(Blocks|Sections)$/, sheet: /^(Blocks|Sections) on / },
    "Add a block": {
        button: /^(Add a block|Add)$/,
        sheet: /^(Add a block|Add)$/,
    },
    Brand: { button: /^Brand$/, sheet: /^Brand$/ },
} as const;

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
    const sheet = phoneSheet(page, PILL[which].sheet);
    if (await sheet.isVisible()) return sheet;
    await pressUntil(
        editPill(page).getByRole("button", { name: PILL[which].button }),
        sheet,
    );
    return sheet;
}

/**
 * The desk editor's Brand panel, opened: the rail's Brand tab, or with the
 * Website area on the left trail's Brand (U46).
 */
export async function openDeskBrand(page: Page): Promise<void> {
    const brand = page
        .getByRole("tab", { name: "Brand" })
        .or(
            page
                .getByRole("navigation", { name: "Editor panels" })
                .getByRole("button", { name: "Brand", exact: true }),
        )
        .first();
    await expect(brand).toBeVisible({ timeout: 30_000 });
    await pressUntil(
        brand,
        async () =>
            (await brand.getAttribute("aria-selected")) === "true" ||
            (await brand.getAttribute("aria-current")) === "true",
    );
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
    name: "Look" | "Colours" | "Fonts" | "Logo" | "Buttons and shapes",
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
 * The looks to choose from: the cards in Brand's Look group on a desk,
 * the Look tab on a phone (U24b).
 */
export async function lookGallery(
    page: Page,
    phone: boolean,
): Promise<Locator> {
    if (phone) {
        const sheet = await brandTab(page, "Look");
        return sheet.getByRole("radiogroup", { name: "Look" });
    }
    return page.getByRole("radiogroup", { name: "Look" });
}

/** The font pairs: behind the Fonts row on a desk, the Fonts tab on a phone. */
export async function typefaces(page: Page, phone: boolean): Promise<Locator> {
    if (phone) {
        const sheet = await brandTab(page, "Fonts");
        return sheet.getByRole("group", { name: "Fonts" });
    }
    await page.locator("[data-typeface-change]").click();
    return page.getByRole("dialog", { name: "Fonts" });
}

/**
 * Write into a block's field. With the Website area a phone's field whose
 * words overflow it opens full screen when focused (`fix/WXNText`): written
 * there, and Save puts it back in the field.
 */
export async function writeField(page: Page, field: Locator, text: string) {
    const long = await field.evaluate(
        (el) =>
            el instanceof HTMLTextAreaElement ||
            el.scrollWidth > el.clientWidth,
    );
    const phone = (page.viewportSize()?.width ?? 1440) < 760;
    if (!long || !phone || !(await websiteAreaOn(page))) {
        await field.fill(text);
        return;
    }
    await field.focus();
    const full = page.locator("#phone-text-sheet");
    await full.fill(text);
    await page
        .getByRole("dialog")
        .filter({ has: full })
        .getByRole("button", { name: "Save", exact: true })
        .click();
    await expect(full).toHaveCount(0);
    await expect(field).toHaveValue(text);
}
