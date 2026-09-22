/**
 * How many of each a business may create — the product's cap, not the plan's
 * (ADR-006). A business has one storefront and one website for now; the schema
 * stays multi, and lifting either is this number plus the screens.
 *
 * Checked only where one is created (`StoresService.createForUser`,
 * `SitesService.createFromTemplate`). A business that already has more keeps
 * them all. Soft-deleted rows do not count.
 */
export const MAX_STOREFRONTS_PER_BUSINESS = 1;
export const MAX_WEBSITES_PER_BUSINESS = 1;
