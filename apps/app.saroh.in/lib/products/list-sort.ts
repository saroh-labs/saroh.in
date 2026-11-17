/**
 * How the Products list may be sorted, as the API reads `?sort=` (owner,
 * 15 Nov). Its own module, with nothing server-only in it, so the list's
 * client toolbar can read it.
 */
export const CATALOGUE_SORTS = [
    "newest",
    "name",
    "-name",
    "price",
    "-price",
    "stock",
    "-stock",
] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];
