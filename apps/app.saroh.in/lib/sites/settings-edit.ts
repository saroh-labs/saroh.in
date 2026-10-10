import { SELLS_FROM_ANCHOR } from "./sells-from";
import type { SettingsGroupId } from "./settings-page";
import { ROW_ANCHORS } from "./settings-page";

/**
 * Website › Settings, read first (owner, 10 Oct): each row says what is
 * saved and its Edit opens that row's own sheet, as a location's rows do
 * (`lib/stores/place-rows.ts`). Which sheets there are, the row each
 * belongs to, and how a link asks for one. Pure.
 */

/** The sheets, in the rows' order. "domain" is Add domain's dialog. */
export const SETTINGS_SHEETS = [
    "domain",
    "title",
    "description",
    "image",
    "menu",
    "footer",
    "posts-path",
    "sells-from",
] as const;

export type SettingsSheet = (typeof SETTINGS_SHEETS)[number];

/**
 * The query a link opens a sheet with (`?edit=menu`). Read once on arrival
 * and taken out of the address when the sheet closes, so a reload starts
 * from the rows.
 */
export const SETTINGS_EDIT_PARAM = "edit";

export function settingsSheetFromParam(
    value: string | null | undefined,
): SettingsSheet | null {
    return SETTINGS_SHEETS.find((s) => s === value) ?? null;
}

/** Each row's id, for a link or the checklist to land on. */
export const SETTINGS_ROW_ID: Record<SettingsSheet, string> = {
    domain: "settings-domain",
    title: ROW_ANCHORS.title,
    description: ROW_ANCHORS.description,
    image: ROW_ANCHORS.image,
    menu: ROW_ANCHORS.menu,
    footer: "settings-footer",
    "posts-path": "settings-posts-path",
    "sells-from": SELLS_FROM_ANCHOR,
};

/** A row's Edit, which takes the keyboard back when its sheet closes. */
export const settingsEditId = (sheet: SettingsSheet) =>
    `${SETTINGS_ROW_ID[sheet]}-edit`;

/** The group that holds a sheet's row. */
export function groupOfSheet(sheet: SettingsSheet): SettingsGroupId {
    switch (sheet) {
        case "domain":
            return "address";
        case "title":
        case "description":
        case "image":
            return "search-and-sharing";
        case "menu":
        case "footer":
        case "posts-path":
            return "menu-and-footer";
        case "sells-from":
            return "shop";
    }
}

/**
 * The sheet a link to a row's id opens. Only `#sells-from` does: the
 * readiness step's "Turn on your shop" and the API's Website step link
 * there to have it chosen, and both were written before `?edit=`.
 */
export function settingsSheetFromHash(
    hash: string | null | undefined,
): SettingsSheet | null {
    return hash === `#${SELLS_FROM_ANCHOR}` ? "sells-from" : null;
}

/** A link that opens a row's sheet on arrival, in its group. */
export function settingsEditHref(siteId: string, sheet: SettingsSheet): string {
    const group = groupOfSheet(sheet);
    const query = new URLSearchParams();
    // Address is the screen's own address, with no query of its own.
    if (group !== "address") query.set("section", group);
    query.set(SETTINGS_EDIT_PARAM, sheet);
    return `/sites/${encodeURIComponent(siteId)}/settings?${query.toString()}`;
}
