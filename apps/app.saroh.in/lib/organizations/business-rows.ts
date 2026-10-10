/**
 * Settings › Business, read first (owner, 10 Oct): each tab is rows of
 * "label · what is saved · Edit", and an Edit opens that row's own side
 * sheet. Which sheets there are, the tab each sits on, how a link elsewhere
 * asks for one, and which one a request really opens. Pure.
 */

/** The page's tabs, in the order they are drawn. */
export const BUSINESS_TABS = [
    "identity",
    "contact",
    "tax",
    "pay",
    "hours",
    "address",
] as const;

export type BusinessTab = (typeof BUSINESS_TABS)[number];

/** The query the page reads its tab from (`?section=tax`). */
export const BUSINESS_TAB_PARAM = "section";

/** The sheets, by tab, in the rows' order. */
export const BUSINESS_SHEETS = [
    "kind",
    "name",
    "logo",
    "legalName",
    "type",
    "timezone",
    "contactEmail",
    "phone",
    "website",
    "gst",
    "taxId",
    "numbers",
    "delivery",
    "pay",
    "hours",
    "address",
] as const;

export type BusinessSheet = (typeof BUSINESS_SHEETS)[number];

/** The tab a sheet's row is on. */
export const BUSINESS_SHEET_TAB: Record<BusinessSheet, BusinessTab> = {
    kind: "identity",
    name: "identity",
    logo: "identity",
    legalName: "identity",
    type: "identity",
    timezone: "identity",
    contactEmail: "contact",
    phone: "contact",
    website: "contact",
    gst: "tax",
    taxId: "tax",
    numbers: "tax",
    delivery: "tax",
    pay: "pay",
    hours: "hours",
    address: "address",
};

/**
 * The query a link opens a sheet with (`?section=tax&edit=taxId`), as a
 * location's does. Read once on arrival and taken out of the address when
 * the sheet closes, so a reload doesn't open it again.
 */
export const BUSINESS_EDIT_PARAM = "edit";

export function businessSheetFromParam(
    value: string | null | undefined,
): BusinessSheet | null {
    return BUSINESS_SHEETS.find((s) => s === value) ?? null;
}

/** A tab's address: `/settings/organization?section=tax`. */
export const businessTabHref = (tab: BusinessTab) =>
    `/settings/organization?${BUSINESS_TAB_PARAM}=${tab}`;

/**
 * The address that lands on a row's tab with its sheet open, for a step or
 * a prompt elsewhere that asks for one thing ("Add your logo").
 */
export const businessEditHref = (sheet: BusinessSheet) =>
    `${businessTabHref(BUSINESS_SHEET_TAB[sheet])}&${BUSINESS_EDIT_PARAM}=${sheet}`;

/**
 * Each sheet's row, for a link to scroll to. How to pay us is one sheet
 * behind three rows; a link lands on the first.
 */
export const BUSINESS_ROW_ID: Record<BusinessSheet, string> = {
    kind: "business-kind",
    name: "business-name",
    logo: "business-logo",
    legalName: "business-legal-name",
    type: "business-type",
    timezone: "business-timezone",
    contactEmail: "business-contact-email",
    phone: "business-phone",
    website: "business-website",
    gst: "business-gst",
    taxId: "business-tax-id",
    numbers: "business-invoice-numbers",
    delivery: "business-delivery-gst",
    pay: "business-pay-upi",
    hours: "business-opening-hours",
    address: "business-registered-address",
};

/** A row's Edit, which takes the keyboard back when its sheet closes. */
export const businessEditId = (sheet: BusinessSheet) =>
    `${BUSINESS_ROW_ID[sheet]}-edit`;

/**
 * The sheet a request really opens. Someone who can't change the business
 * opens none; hours are kept on the locations, so they need a location and
 * the right to change one; and GST on delivery is only a registered
 * business's, so asking for it asks about the registration first.
 */
export function businessSheetToOpen(
    which: BusinessSheet,
    page: { canEdit: boolean; canEditHours: boolean; registered: boolean },
): BusinessSheet | null {
    if (!page.canEdit) return null;
    if (which === "hours") return page.canEditHours ? which : null;
    if (which === "delivery" && !page.registered) return "gst";
    return which;
}
