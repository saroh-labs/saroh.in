import { IANAZone } from "luxon";

/**
 * The zone a business keeps time in when nothing better is known: India's,
 * Saroh's market, and what every reader already falls back to.
 */
export const DEFAULT_BUSINESS_ZONE = "Asia/Kolkata";

/**
 * Countries that keep one zone, so the country alone names it. A country
 * with several (the US, Australia…) isn't guessed at: setup sends the
 * browser's zone, and the merchant can change it in Settings.
 */
const ONE_ZONE_COUNTRIES: Readonly<Record<string, string>> = {
    IN: "Asia/Kolkata",
    AE: "Asia/Dubai",
    BD: "Asia/Dhaka",
    BH: "Asia/Bahrain",
    GB: "Europe/London",
    HK: "Asia/Hong_Kong",
    IE: "Europe/Dublin",
    LK: "Asia/Colombo",
    MY: "Asia/Kuala_Lumpur",
    NP: "Asia/Kathmandu",
    NZ: "Pacific/Auckland",
    OM: "Asia/Muscat",
    PK: "Asia/Karachi",
    QA: "Asia/Qatar",
    SA: "Asia/Riyadh",
    SG: "Asia/Singapore",
    KW: "Asia/Kuwait",
};

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
 * (the browser's), else India's. Never null, so no server-rendered time
 * falls back to the server's UTC.
 */
export function startingZone(
    sent: string | null | undefined,
    country: string | null | undefined,
): string {
    const ofCountry = zoneForCountry(country);
    if (ofCountry) return ofCountry;
    const zone = sent?.trim();
    if (zone && IANAZone.isValidZone(zone)) return zone;
    return DEFAULT_BUSINESS_ZONE;
}
