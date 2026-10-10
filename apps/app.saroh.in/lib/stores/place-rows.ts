import {
    ADDRESS_FIELD_ID,
    HOURS_FIELD_ID,
    KIND_FIELD_ID,
} from "./location-readiness";
import type { StorefrontKind } from "./storefronts";

/**
 * The place, read first (owner, 10 Oct): each row says what is saved and
 * its Edit opens that row's own side sheet. Which sheets there are, how a
 * link or a button elsewhere asks for one, and the rows' words. Pure.
 */

/** The sheets, in the rows' order. */
export const PLACE_SHEETS = [
    "name",
    "kind",
    "address",
    "hours",
    "details",
] as const;

export type PlaceSheet = (typeof PLACE_SHEETS)[number];

/**
 * The query a link opens a sheet with (`?edit=details`), as the old
 * details page's address does. Read once on arrival and taken out of the
 * address when the sheet closes, so a reload doesn't open it again.
 */
export const PLACE_EDIT_PARAM = "edit";

export function placeSheetFromParam(
    value: string | null | undefined,
): PlaceSheet | null {
    return PLACE_SHEETS.find((s) => s === value) ?? null;
}

/** Each row's id, for a link to scroll to. */
export const PLACE_ROW_ID: Record<PlaceSheet, string> = {
    name: "location-name",
    kind: "location-kind-row",
    address: "location-address",
    hours: "location-hours",
    details: "location-details",
};

/** A row's Edit, which takes the keyboard back when its sheet closes. */
export const placeEditId = (sheet: PlaceSheet) => `${PLACE_ROW_ID[sheet]}-edit`;

/**
 * The sheet that holds a field the readiness card or Delivery sends
 * someone to ("Add address", "Set hours", "Add an address"); `null` for
 * anything that isn't one of The place's fields.
 */
export function placeSheetFor(focus: string | undefined): PlaceSheet | null {
    if (focus === ADDRESS_FIELD_ID) return "address";
    if (focus === HOURS_FIELD_ID) return "hours";
    if (focus === KIND_FIELD_ID) return "kind";
    return null;
}

/**
 * The two answers to "Do customers come here?" (DEC-069, KTD-12): the
 * `SHOP` and `ONLINE` kinds, said as the answer to the question. Lists
 * elsewhere name the kinds "Customers visit" and "No counter".
 */
export const KIND_ANSWER: Record<StorefrontKind, string> = {
    SHOP: "Yes, they visit",
    ONLINE: "No, online only",
};

/** What follows from the answer, under it in the row and in its sheet. */
export const KIND_FOLLOWS: Record<StorefrontKind, string> = {
    SHOP: "It has an address and opening hours, and can offer pick-up.",
    ONLINE: "Its address and opening hours aren't shown, and it can't offer pick-up.",
};

/**
 * The sheet a request really opens. A place nobody visits has no address
 * or hours to edit, so asking for either asks whether customers come here
 * first; the description and logo have no sheet when they couldn't be
 * read; and someone who can't edit opens none.
 */
export function placeSheetToOpen(
    which: PlaceSheet,
    page: { canEdit: boolean; kind: StorefrontKind; hasDetails: boolean },
): PlaceSheet | null {
    if (!page.canEdit) return null;
    if (which === "details") return page.hasDetails ? which : null;
    if ((which === "address" || which === "hours") && page.kind !== "SHOP") {
        return "kind";
    }
    return which;
}

/**
 * The saved address on one line, its lines joined by commas ("12 Hill
 * Road, Bandra"); `null` when there is none to say.
 */
export function addressLine(address: string | null | undefined): string | null {
    const lines = (address ?? "")
        .split("\n")
        .map((l) => l.trim().replace(/[\s,]+$/, ""))
        .filter(Boolean);
    return lines.length > 0 ? lines.join(", ") : null;
}
