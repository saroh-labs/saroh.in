import { adminFetch, getJson } from "./control-plane";
import type {
    AdminCoupon,
    AdminPricing,
    AdminPricingImpact,
} from "./pricing-types";

/**
 * Reads behind Plans & modules (plans catalogue U3). Server-only: it reads
 * through `control-plane.ts`. A client component takes types from
 * `pricing-types.ts`, and reads again through `pricing-actions.ts`.
 *
 * `null` means the API refused (not staff, or no `pricing:read`); a failure
 * throws, so an outage is never drawn as an empty catalogue that someone
 * could then save over the live one.
 */

export function getPricing(): Promise<AdminPricing | null> {
    return getJson<AdminPricing>("/pricing");
}

/**
 * The draft's impact. `null` when there is nothing to weigh — no draft (the
 * API's 404) or one that doesn't validate yet (422) — or the caller may not
 * read it.
 */
export async function getPricingImpact(): Promise<AdminPricingImpact | null> {
    const res = await adminFetch("/pricing/impact");
    if ([401, 403, 404, 422].includes(res.status)) return null;
    if (!res.ok) {
        throw new Error(`GET /admin/pricing/impact failed: ${res.status}`);
    }
    return (await res.json()) as AdminPricingImpact;
}

export function listCoupons(): Promise<AdminCoupon[] | null> {
    return getJson<AdminCoupon[]>("/pricing/coupons");
}
