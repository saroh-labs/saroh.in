/**
 * Where a storefront's own screens live, now that everything a storefront
 * holds is in Sell. One place, so a link cannot drift back to `/stores`.
 */
const q = (id: string) => `?storefront=${encodeURIComponent(id)}`;

export const newStorefrontHref = "/commerce/storefronts/new";

export function storefrontHref(storeId: string): string {
    return `/commerce/storefronts${q(storeId)}`;
}

/** Its address, description and logo. */
export function storefrontDetailsHref(storeId: string): string {
    return `/commerce/storefronts/${encodeURIComponent(storeId)}/details`;
}

/** Who may work on it, and invitations to it. */
export function storefrontPeopleHref(storeId: string): string {
    return `/commerce/storefronts/${encodeURIComponent(storeId)}/people`;
}

export function productCategoriesHref(storeId: string): string {
    return `/commerce/products/categories${q(storeId)}`;
}

export function importProductsHref(storeId?: string): string {
    return storeId
        ? `/commerce/products/import${q(storeId)}`
        : "/commerce/products/import";
}
