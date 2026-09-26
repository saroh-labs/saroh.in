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

/** The product page: what it is, how it sells, what people say. */
export function productHref(
    storeId: string | null | undefined,
    productId: string,
    tab?: ProductTab,
): string {
    const base = `/commerce/products/${encodeURIComponent(productId)}${storefrontQuery(storeId)}`;
    if (!tab || tab === "overview") return base;
    return `${base}${base.includes("?") ? "&" : "?"}tab=${tab}`;
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

export const PRODUCT_TABS = [
    "overview",
    "variants",
    "photos",
    "reviews",
    "orders",
    "discounts",
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
