import { PHONE_COUNTRIES } from "./phone";

/**
 * Where a Global business's delivery goes, past the city: its region and
 * country. An order keeps them apart, the region in `Order.deliveryState` and
 * the ISO code in `Order.deliveryCountry` (DEC-207), and prints them as one
 * line, "Texas, United States". India's orders hold the GST state alone and
 * no country, so their line is the state as it was.
 */

/** Longest region typed. */
export const REGION_MAX = 60;
/** Longest postcode a Global business's delivery takes. */
export const POSTCODE_MAX = 12;

/** A listed country by its ISO code ("gb" or "GB"), else null. */
export const listedCountry = (code: string | null | undefined) =>
    PHONE_COUNTRIES.find((c) => c.code === code?.trim().toUpperCase()) ?? null;

/** The printed line: "Texas, United States", "United States" or "Texas". */
export function joinDeliveryPlace(
    region: string | null | undefined,
    country: string | null | undefined,
): string {
    return [region?.trim() ?? "", listedCountry(country)?.name ?? ""]
        .filter(Boolean)
        .join(", ");
}

/** A typed or older stored line apart; `country` is null when it names none. */
export function splitDeliveryPlace(stored: string | null | undefined): {
    region: string;
    country: string | null;
} {
    const line = stored?.trim() ?? "";
    const at = line.lastIndexOf(",");
    const last = line
        .slice(at + 1)
        .trim()
        .toLowerCase();
    const country = PHONE_COUNTRIES.find((c) => c.name.toLowerCase() === last);
    return country
        ? {
              region: at < 0 ? "" : line.slice(0, at).trim(),
              country: country.code,
          }
        : { region: line, country: null };
}
