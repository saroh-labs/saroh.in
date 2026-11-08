/**
 * The time zones a business's country keeps (ISO 3166-1 alpha-2), in the tz
 * database's current names. A country that keeps one names its zone; one
 * that keeps several is asked at setup, and falls back to its main zone
 * (owner, 8 Nov 2026: the US New York, Canada Toronto, Australia Sydney).
 * The tests hold both lists to the runtime's own per-country zones.
 */

/** Countries that keep one zone, so the country alone names it. */
export const ONE_ZONE_COUNTRIES: Readonly<Record<string, string>> = {
    IN: "Asia/Kolkata",
    AE: "Asia/Dubai",
    AT: "Europe/Vienna",
    BD: "Asia/Dhaka",
    BE: "Europe/Brussels",
    BH: "Asia/Bahrain",
    // Asia/Famagusta keeps the north's time; the Republic keeps Nicosia's.
    CY: "Asia/Nicosia",
    // Europe/Busingen is one German village inside Switzerland.
    DE: "Europe/Berlin",
    EE: "Europe/Tallinn",
    FI: "Europe/Helsinki",
    FR: "Europe/Paris",
    GB: "Europe/London",
    GR: "Europe/Athens",
    HK: "Asia/Hong_Kong",
    HR: "Europe/Zagreb",
    IE: "Europe/Dublin",
    IT: "Europe/Rome",
    KW: "Asia/Kuwait",
    LK: "Asia/Colombo",
    LT: "Europe/Vilnius",
    LU: "Europe/Luxembourg",
    LV: "Europe/Riga",
    MT: "Europe/Malta",
    // Asia/Kuching keeps the same time as Kuala Lumpur.
    MY: "Asia/Kuala_Lumpur",
    NL: "Europe/Amsterdam",
    NP: "Asia/Kathmandu",
    // Pacific/Chatham is the Chatham Islands, some 600 people.
    NZ: "Pacific/Auckland",
    OM: "Asia/Muscat",
    PK: "Asia/Karachi",
    QA: "Asia/Qatar",
    SA: "Asia/Riyadh",
    SG: "Asia/Singapore",
    SI: "Europe/Ljubljana",
    SK: "Europe/Bratislava",
    ZA: "Africa/Johannesburg",
};

export interface CountryZones {
    /** The zone when nothing better is known: the most populous. */
    main: string;
    zones: readonly string[];
}

/** Countries that keep several zones: the setup question's choices. */
export const MULTI_ZONE_COUNTRIES: Readonly<Record<string, CountryZones>> = {
    US: {
        main: "America/New_York",
        zones: [
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Phoenix",
            "America/Los_Angeles",
            "America/Anchorage",
            "Pacific/Honolulu",
            "America/Adak",
            "America/Boise",
            "America/Detroit",
            "America/Indiana/Indianapolis",
            "America/Indiana/Knox",
            "America/Indiana/Marengo",
            "America/Indiana/Petersburg",
            "America/Indiana/Tell_City",
            "America/Indiana/Vevay",
            "America/Indiana/Vincennes",
            "America/Indiana/Winamac",
            "America/Juneau",
            "America/Kentucky/Louisville",
            "America/Kentucky/Monticello",
            "America/Menominee",
            "America/Metlakatla",
            "America/Nome",
            "America/North_Dakota/Beulah",
            "America/North_Dakota/Center",
            "America/North_Dakota/New_Salem",
            "America/Sitka",
            "America/Yakutat",
        ],
    },
    CA: {
        main: "America/Toronto",
        zones: [
            "America/Toronto",
            "America/Vancouver",
            "America/Edmonton",
            "America/Winnipeg",
            "America/Halifax",
            "America/St_Johns",
            "America/Regina",
            "America/Atikokan",
            "America/Blanc-Sablon",
            "America/Cambridge_Bay",
            "America/Creston",
            "America/Dawson",
            "America/Dawson_Creek",
            "America/Fort_Nelson",
            "America/Glace_Bay",
            "America/Goose_Bay",
            "America/Inuvik",
            "America/Iqaluit",
            "America/Moncton",
            "America/Rankin_Inlet",
            "America/Resolute",
            "America/Swift_Current",
            "America/Whitehorse",
        ],
    },
    AU: {
        main: "Australia/Sydney",
        zones: [
            "Australia/Sydney",
            "Australia/Melbourne",
            "Australia/Brisbane",
            "Australia/Perth",
            "Australia/Adelaide",
            "Australia/Hobart",
            "Australia/Darwin",
            "Antarctica/Macquarie",
            "Australia/Broken_Hill",
            "Australia/Eucla",
            "Australia/Lindeman",
            "Australia/Lord_Howe",
        ],
    },
    // The Canary Islands keep an hour behind the mainland.
    ES: {
        main: "Europe/Madrid",
        zones: ["Europe/Madrid", "Atlantic/Canary", "Africa/Ceuta"],
    },
    // Madeira keeps Lisbon's time; the Azores an hour behind.
    PT: {
        main: "Europe/Lisbon",
        zones: ["Europe/Lisbon", "Atlantic/Madeira", "Atlantic/Azores"],
    },
};

const codeOf = (country: string | null | undefined) =>
    country?.trim().toUpperCase() ?? "";

const oneZone = (code: string) =>
    ONE_ZONE_COUNTRIES[code] as string | undefined;
const multiZone = (code: string) =>
    MULTI_ZONE_COUNTRIES[code] as CountryZones | undefined;

/** The zones a country keeps, main first; [] for a country not listed. */
export function zonesOfCountry(
    country: string | null | undefined,
): readonly string[] {
    const code = codeOf(country);
    const one = oneZone(code);
    if (one) return [one];
    return multiZone(code)?.zones ?? [];
}

/** The country's one zone, or its main one; null for a country not listed. */
export function mainZoneOf(country: string | null | undefined): string | null {
    const code = codeOf(country);
    return oneZone(code) ?? multiZone(code)?.main ?? null;
}
