/**
 * What a business may still make, so the workspace never offers what the API
 * would refuse.
 *
 * Websites: one per business (ADR-006), mirrored here. Storefronts: up to the
 * plan (ADR-010) — the API says how many there are and how many the plan
 * allows (`GET …/storefronts/allowance`), so the number is never copied into
 * the app. A business that already has more keeps them all; pickers appear
 * only when there is more than one to pick from.
 */
export const MAX_WEBSITES = 1;

/** How many storefronts a business has, and how many it may have. */
export interface StorefrontAllowance {
    used: number;
    limit: number;
}

/**
 * Whether this business may make another storefront. `null` — the allowance
 * could not be read — offers it: the API still decides, and the New
 * storefront page says plainly when it cannot.
 */
export function mayAddStorefront(
    allowance: StorefrontAllowance | null,
): boolean {
    return allowance === null || allowance.used < allowance.limit;
}

/** Whether this business may make another website, given how many it has. */
export function mayAddWebsite(count: number): boolean {
    return count < MAX_WEBSITES;
}
