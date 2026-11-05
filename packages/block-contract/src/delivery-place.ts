import { PHONE_COUNTRIES } from "./phone";

/**
 * Where a Global business's delivery goes, past the city: its region and
 * country. An order keeps both on one line (`Order.deliveryState`), "Texas,
 * United States", so every place that prints the address names the country
 * with no change, and no column is added. India's orders never come here:
 * theirs holds the GST state alone.
 */

/** Longest region typed; with the longest country it fits `state`'s 100. */
export const REGION_MAX = 60;
/** Longest postcode a Global business's delivery takes. */
export const POSTCODE_MAX = 12;

/** A listed country by its ISO code ("gb" or "GB"), else null. */
export const listedCountry = (code: string | null | undefined) =>
    PHONE_COUNTRIES.find((c) => c.code === code?.trim().toUpperCase()) ?? null;

/** The stored line: "Texas, United States", "United States" or "Texas". */
export function joinDeliveryPlace(
    region: string,
    country: string | null | undefined,
): string {
    return [region.trim(), listedCountry(country)?.name ?? ""]
        .filter(Boolean)
        .join(", ");
}

/** The stored line apart again; `country` is null when it names none. */
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
