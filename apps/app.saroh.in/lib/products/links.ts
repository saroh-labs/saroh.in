/**
 * Where a product lives in the workspace. Products are stored per
 * storefront, so the storefront travels in the address: the page needs it to
 * read and write, and a link someone shares must still open the right one.
 */

/** The product page: what it is, how it sells, what people say. */
export function productHref(
    storeId: string,
    productId: string,
    tab?: ProductTab,
): string {
    const base = `/commerce/products/${encodeURIComponent(productId)}?storefront=${encodeURIComponent(storeId)}`;
    return tab && tab !== "overview" ? `${base}&tab=${tab}` : base;
}

/** The full editor, optionally opened at one section. */
export function productEditHref(
    storeId: string,
    productId: string,
    section?: EditorSection,
): string {
    const base = `/commerce/products/${encodeURIComponent(productId)}/edit?storefront=${encodeURIComponent(storeId)}`;
    return section ? `${base}#sec-${section}` : base;
}

/** A new product, made at one storefront. */
export function newProductHref(storeId?: string): string {
    return storeId
        ? `/commerce/products/new?storefront=${encodeURIComponent(storeId)}`
        : "/commerce/products/new";
}

/** Catalogue settings: categories, options, defaults. */
export function productSettingsHref(
    tab?: "categories" | "options" | "defaults",
): string {
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
