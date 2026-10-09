/**
 * How many of each a business may create — the product's cap, whatever the
 * plan says.
 *
 * Storefronts (ADR-010): a business may have several, up to this ceiling.
 * A plan caps only places customers visit (`shopLocations`; owner, 8 Oct):
 * the catalogue's `locations` row where it governs (behind
 * `PLAN_ENFORCEMENT`), else the old `storefronts` floor (5,
 * `LEGACY_FLOOR_ENTITLEMENTS`, `billing/legacy-location-floor.ts`), both
 * asked when a storefront becomes a SHOP. An online-only one is 0 locations.
 *
 * Websites: the catalogue sells them now (its `sites` row), so the product's
 * ceiling sits well above anything a plan sells — the same 25 as locations:
 * high enough that a plan is the cap a merchant meets, low enough that one
 * business can't fill the address space or the renderer. Where the
 * catalogue doesn't govern websites (the switch off, a business off the
 * catalogue), it stays one per business as before (ADR-006,
 * {@link LEGACY_WEBSITES_PER_BUSINESS}).
 *
 * The ceilings are checked where one is created
 * (`StoresService.createForUser`, `planSiteFromTemplate`): a 409 in plain
 * words because upgrading would not help; a website's plan cap after it.
 * A business that already has more keeps them all. Soft-deleted rows do
 * not count.
 */
export const MAX_STOREFRONTS_PER_BUSINESS = 25;
export const MAX_WEBSITES_PER_BUSINESS = 25;
/** Websites a business may have where the catalogue doesn't govern them. */
export const LEGACY_WEBSITES_PER_BUSINESS = 1;
