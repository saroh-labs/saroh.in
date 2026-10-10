import { PLACE_EDIT_PARAM } from "./place-rows";

/**
 * Where a storefront's own screens live, now that everything a storefront
 * holds is in Sell. One place, so a link cannot drift back to `/stores`.
 */
const q = (id: string) => `?storefront=${encodeURIComponent(id)}`;

export const newStorefrontHref = "/commerce/locations/new";

/**
 * A location's page; with `section`, on that tab (`the-place` is the page
 * itself, `delivery`, `payments`, …: `LOCATION_TABS`).
 */
export function storefrontHref(storeId: string, section?: string): string {
    const tab =
        section && section !== "the-place"
            ? `&section=${encodeURIComponent(section)}`
            : "";
    return `/commerce/locations${q(storeId)}${tab}`;
}

/**
 * Its description and logo: their Edit sheet, open on The place (a page of
 * their own until 10 Oct; that address still lands here).
 */
export function storefrontDetailsHref(storeId: string): string {
    return `${storefrontHref(storeId)}&${PLACE_EDIT_PARAM}=details`;
}

/**
 * Who may work on it, and invitations to it: the location's People tab (a
 * page of its own until 10 Oct; that address still lands here).
 */
export function storefrontPeopleHref(storeId: string): string {
    return storefrontHref(storeId, "people");
}

/** The Categories tab of Product settings (#470) — the business's (#529). */
export function productCategoriesHref(): string {
    return "/commerce/products/settings";
}

export function importProductsHref(storeId?: string): string {
    return storeId
        ? `/commerce/products/import${q(storeId)}`
        : "/commerce/products/import";
}
