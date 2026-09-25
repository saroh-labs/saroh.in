/**
 * Track stock (#515), as the product page and the editor show it — pure and
 * client-safe. The API decides; these only say what to draw and in what
 * words.
 *
 * A product counts stock while its own switch (`stockTracked`) and the
 * business's are both on. Untracked, it is always available on the shop:
 * no count and no "Sold out".
 */

/**
 * Whether the product counts stock. `business` is the business's switch,
 * `null` when it could not be read — then the product's own switch decides,
 * as it does for every business that never turned it off.
 */
export function countsStock(
    productTracked: boolean,
    business: boolean | null,
): boolean {
    return productTracked && business !== false;
}

/**
 * What a person sees of the Track stock switch:
 * - "change" — Owner and Admin (`store:write`) turn it on and off;
 * - "locked" — a stock-only role (`inventory:write` alone) sees it, locked,
 *   with why: it changes how the product sells, not how many there are;
 * - "hidden" — anyone else sees no switch, only whether it is tracked.
 */
export type TrackingControl = "change" | "locked" | "hidden";

export function trackingControl(may: {
    canWrite: boolean;
    canStock: boolean;
}): TrackingControl {
    if (may.canWrite) return "change";
    return may.canStock ? "locked" : "hidden";
}

/** Track stock as one screen draws it. */
export interface ProductTracking {
    /** The product counts stock now (its switch and the business's). */
    counts: boolean;
    /** The business's switch; off, no product can start tracking. */
    business: boolean;
    control: TrackingControl;
}

/** Why a stock-only role can't flip the switch. */
export const TRACKING_LOCKED =
    "Only an owner or admin can turn Track stock on or off.";

/** The business has Track stock off: no product counts. */
export const BUSINESS_NOT_TRACKING =
    "Your business doesn't track stock, so every product is always available on the shop.";

/** Said once it is off. */
export const TRACKING_OFF_SAID = "Stock is no longer tracked for this product.";

/** Said once it is on again, and what that means for the shop. */
export const TRACKING_ON_SAID = "Stock is tracked for this product again.";
export const TRACKING_ON_NEXT =
    "It starts at 0, so the shop says Sold out until you count it.";

/** Said when it couldn't go off, above the API's reason. */
export const TRACKING_STILL_ON = "Stock is still tracked";

/** The confirmation before it goes off: what it does to the count and the shop. */
export function stopTrackingConfirm(productName: string): {
    title: string;
    description: string;
    confirmLabel: string;
} {
    return {
        title: `Stop tracking ${productName}?`,
        description:
            'Its count goes to 0 at every storefront, and it is always available on the shop — no count and no "Sold out". Turning it back on starts from 0, so you count it again.',
        confirmLabel: "Stop tracking",
    };
}
