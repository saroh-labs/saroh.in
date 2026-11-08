import { ONE_ZONE_COUNTRIES } from "@saroh/edition";
import { IANAZone } from "luxon";

/**
 * The zone a business keeps time in when nothing better is known: India's,
 * Saroh's market, and what every reader already falls back to.
 */
export const DEFAULT_BUSINESS_ZONE = "Asia/Kolkata";

/** The zone a country keeps, when it keeps one; null otherwise. */
export function zoneForCountry(
    country: string | null | undefined,
): string | null {
    if (!country) return null;
    return ONE_ZONE_COUNTRIES[country.trim().toUpperCase()] ?? null;
}

/**
 * The zone a new business starts with (UX-008): its country's when that
 * country keeps one (India's for an Indian business, wherever its owner
 * signs up from), else the one setup sent when the tz database knows it
 * (the browser's), else India's for an Indian business and UTC for any other.
 * Never null, so no server-rendered time falls back to the server's own.
 */
export function startingZone(
    sent: string | null | undefined,
    country: string | null | undefined,
): string {
    const ofCountry = zoneForCountry(country);
    if (ofCountry) return ofCountry;
    const zone = sent?.trim();
    if (zone && IANAZone.isValidZone(zone)) return zone;
    const code = country?.trim().toUpperCase();
    return code && code !== "IN" && code !== "INDIA"
        ? "UTC"
        : DEFAULT_BUSINESS_ZONE;
}
