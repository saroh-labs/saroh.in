import type { StorefrontFulfilmentType } from "../orders/fulfilment";
import { openingHoursText } from "./opening-hours-text";
import type { OpeningHoursDay } from "./storefronts.dto";

/**
 * Where a customer collects a pick-up order (UX-025): a storefront customers
 * visit ("Customers visit", kind SHOP) that has an address. A "No counter"
 * storefront, or one with no address saved, has no door to collect from, so
 * the website never offers Pick-up from it — whatever its saved ways say.
 * Saves are never refused for it: an old row keeps its chips, and the
 * Locations editor says why Pick-up isn't offered on the website.
 *
 * The address and hours are the business's public details: the site shows
 * them in the bag, on the confirmation and on Track.
 */
export interface PickupPlace {
    address: string;
    /** "Mon–Fri 09:00–18:00, Sun closed"; null when the week isn't set. */
    hours: string | null;
}

export function pickupPlaceOf(
    settings:
        | {
              kind: string | null;
              address: string | null;
              openingHours?: unknown;
          }
        | null
        | undefined,
): PickupPlace | null {
    if (settings?.kind !== "SHOP") return null;
    const address = settings.address?.trim() ?? "";
    if (!address) return null;
    return {
        address,
        hours: openingHoursText(
            Array.isArray(settings.openingHours)
                ? (settings.openingHours as OpeningHoursDay[])
                : null,
        ),
    };
}

/** The storefront's ways, less Pick-up when it has no place to collect from. */
export function waysWithPlace<T extends StorefrontFulfilmentType>(
    ways: readonly T[],
    place: PickupPlace | null,
): T[] {
    return place ? [...ways] : ways.filter((w) => w !== "PICKUP");
}

/** The Locations editor's words when Pick-up isn't offered on the website. */
export const PICKUP_NEEDS_PLACE =
    "Pick-up needs a place customers visit, with its address.";
