/**
 * How many of each a business may create — the product's cap, whatever the
 * plan says.
 *
 * Storefronts (ADR-010): a business may have several. Where the catalogue
 * governs locations (its `locations` row, metered behind `PLAN_ENFORCEMENT`),
 * the plan caps only places customers visit (`shopLocations`) and this
 * ceiling caps them all; elsewhere the old `storefronts` floor still applies
 * (5, `LEGACY_FLOOR_ENTITLEMENTS`) under the same ceiling.
 *
 * Websites: the catalogue sells them now (its `sites` row), so the product's
 * ceiling sits well above anything a plan sells — the same 25 as locations:
 * high enough that a plan is the cap a merchant meets, low enough that one
 * business can't fill the address space or the renderer. Where the
 * catalogue doesn't govern websites (the switch off, a business off the
 * catalogue), it stays one per business as before (ADR-006,
 * {@link LEGACY_WEBSITES_PER_BUSINESS}).
 *
 * Checked only where one is created (`StoresService.createForUser`,
 * `planSiteFromTemplate`): the product's cap first, a 409 in plain words
 * because upgrading would not help, then the plan's. A business that
 * already has more keeps them all. Soft-deleted rows do not count.
 */
export const MAX_STOREFRONTS_PER_BUSINESS = 25;
export const MAX_WEBSITES_PER_BUSINESS = 25;
/** Websites a business may have where the catalogue doesn't govern them. */
export const LEGACY_WEBSITES_PER_BUSINESS = 1;

/**
 * How many storefronts a business may have in all. Where the catalogue
 * governs locations (`governed`), the product's ceiling alone: the plan caps
 * places customers visit, not storefronts. Elsewhere its `storefronts`
 * entitlement (the floor), never above the ceiling; a plan with no number
 * there is capped by the ceiling alone.
 */
export function storefrontLimit(
    entitlements: Readonly<Record<string, number | boolean>>,
    governed = false,
): number {
    if (governed) return MAX_STOREFRONTS_PER_BUSINESS;
    const plan = entitlements.storefronts;
    return typeof plan === "number"
        ? Math.min(plan, MAX_STOREFRONTS_PER_BUSINESS)
        : MAX_STOREFRONTS_PER_BUSINESS;
}
