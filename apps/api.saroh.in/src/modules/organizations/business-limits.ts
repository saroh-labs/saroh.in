/**
 * How many of each a business may create — the product's cap, whatever the
 * plan says.
 *
 * Storefronts (ADR-010): a business may have several, up to its plan's
 * `storefronts` entitlement (5 on the free floor). This is the ceiling above
 * that — a plan that says more still stops here — so the plan's number is the
 * one a merchant meets. Websites stay at one per business (ADR-006).
 *
 * Checked only where one is created (`StoresService.createForUser`,
 * `SitesService.createFromTemplate`): the product's cap first, a 409 in plain
 * words because upgrading would not help, then the plan's entitlement, a 403.
 * A business that already has more keeps them all. Soft-deleted rows do not
 * count.
 */
export const MAX_STOREFRONTS_PER_BUSINESS = 25;
export const MAX_WEBSITES_PER_BUSINESS = 1;

/**
 * How many storefronts a business may have in all: its plan's `storefronts`
 * entitlement, never above the product's ceiling. A plan with no number
 * there is capped by the ceiling alone.
 */
export function storefrontLimit(
    entitlements: Readonly<Record<string, number | boolean>>,
): number {
    const plan = entitlements.storefronts;
    return typeof plan === "number"
        ? Math.min(plan, MAX_STOREFRONTS_PER_BUSINESS)
        : MAX_STOREFRONTS_PER_BUSINESS;
}
