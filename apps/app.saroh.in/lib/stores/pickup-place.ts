import type { StorefrontSettings } from "./storefronts";

/**
 * Why the website doesn't offer Pick-up from this location (UX-025), or
 * null when it does or the location doesn't offer Pick-up. The website
 * offers it only from a place customers visit that has an address — the
 * customer has to know where to go. The API applies the same rule at the
 * site's checkout; saves are never refused for it.
 */
export function pickupNotOffered(
    store: Pick<StorefrontSettings, "kind" | "address"> & {
        fulfilmentTypes?: readonly string[] | null;
    },
): string | null {
    if (!store.fulfilmentTypes?.includes("PICKUP")) return null;
    if (store.kind !== "SHOP") {
        return "Your website doesn't offer Pick-up from here: pick-up needs a place customers visit, with its address. Choose Customers visit and add the address, or turn Pick-up off.";
    }
    if (!store.address?.trim()) {
        return "Your website doesn't offer Pick-up from here yet: add this location's address so customers know where to collect.";
    }
    return null;
}
