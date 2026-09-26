/**
 * Where a product lives in the workspace. A product belongs to the business
 * (#531), so its id alone opens it; `?storefront=` says which storefront's
 * shelf and listing the page shows, so a link someone shares opens the same
 * view. Left out, the page shows the first storefront that sells it.
 */

/** `?storefront=…`, or nothing when no storefront is named. */
function storefrontQuery(storeId: string | null | undefined): string {
    return storeId ? `?storefront=${encodeURIComponent(storeId)}` : "";
}

/**
 * The product page: what it is, how it sells, what people say. "variants"
 * is the Stock tab's name before #522, still accepted from older callers.
 */
export function productHref(
    storeId: string | null | undefined,
    productId: string,
    tab?: ProductTab | "variants",
): string {
    const base = `/commerce/products/${encodeURIComponent(productId)}${storefrontQuery(storeId)}`;
    const t = tab === "variants" ? "stock" : tab;
    if (!t || t === "overview") return base;
    return `${base}${base.includes("?") ? "&" : "?"}tab=${t}`;
}

/** The full editor, optionally opened at one section. */
export function productEditHref(
    storeId: string | null | undefined,
    productId: string,
    section?: EditorSection,
): string {
    const base = `/commerce/products/${encodeURIComponent(productId)}/edit${storefrontQuery(storeId)}`;
    return section ? `${base}#sec-${section}` : base;
}

/** A new product, made at one storefront. */
export function newProductHref(storeId?: string): string {
    return storeId
        ? `/commerce/products/new?storefront=${encodeURIComponent(storeId)}`
        : "/commerce/products/new";
}

export const SETTINGS_TABS = [
    "categories",
    "options",
    "fields",
    "allergens",
    "sku",
    "defaults",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(value: string | undefined): value is SettingsTab {
    return (SETTINGS_TABS as readonly string[]).includes(value ?? "");
}

/** Product settings — the business's (#529), whatever storefront — at a tab. */
export function productSettingsHref(tab?: SettingsTab): string {
    return tab && tab !== "categories"
        ? `/commerce/products/settings?tab=${tab}`
        : "/commerce/products/settings";
}

/** The product page's tabs, in the design's order (#522). */
export const PRODUCT_TABS = [
    "overview",
    "stock",
    "photos",
    "reviews",
    "orders",
    "discounts",
    "collections",
] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

export type EditorSection =
    | "basics"
    | "description"
    | "details"
    | "madeby"
    | "photos"
    | "seo"
    | "visibility"
    | "variants"
    | "stock";

export function isProductTab(value: string | undefined): value is ProductTab {
    return (PRODUCT_TABS as readonly string[]).includes(value ?? "");
}

/**
 * The tab an address asks for. `?tab=variants`, the Stock tab's name before
 * #522 and still in links already sent, opens Stock; anything unknown,
 * Overview.
 */
export function productTabOf(value: string | undefined): ProductTab {
    if (value === "variants") return "stock";
    return isProductTab(value) ? value : "overview";
}

/** The Stock screen's log for one product, and its checks (#521). */
export function stockLogHref(productId: string): string {
    return `/commerce/stock?tab=log&product=${encodeURIComponent(productId)}`;
}

export const STOCK_CHECKS_HREF = "/commerce/stock?tab=checks";
