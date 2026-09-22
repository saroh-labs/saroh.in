/**
 * One storefront and one website per business, for now (ADR-006).
 *
 * The API refuses a second (`organizations/business-limits.ts` there); these
 * mirror it so the workspace never offers what would be refused. A business
 * that already has more keeps them all — pickers appear only when there is
 * more than one to pick from.
 */
export const MAX_STOREFRONTS = 1;
export const MAX_WEBSITES = 1;

/** Whether this business may make another storefront, given how many it has. */
export function mayAddStorefront(count: number): boolean {
    return count < MAX_STOREFRONTS;
}

/** Whether this business may make another website, given how many it has. */
export function mayAddWebsite(count: number): boolean {
    return count < MAX_WEBSITES;
}
