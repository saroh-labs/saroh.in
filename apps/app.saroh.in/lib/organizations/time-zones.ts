/**
 * Time zones for Business settings: the IANA zones this browser knows, each
 * with a label a person reads ("Kolkata — India Standard Time (GMT+5:30)").
 * The API stores the IANA name and checks it against the tz database.
 */

import { DEFAULT_TIMEZONE } from "@/lib/invoices/invoice-number";

export { DEFAULT_TIMEZONE };

/**
 * ICU still answers some zones by their old names — a browser in India
 * reports "Asia/Calcutta". Each is shown and saved as the name the tz
 * database uses now, which the API knows too.
 */
const RENAMED: Record<string, string> = {
    "Africa/Asmera": "Africa/Asmara",
    "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
    "America/Catamarca": "America/Argentina/Catamarca",
    "America/Coral_Harbour": "America/Atikokan",
    "America/Cordoba": "America/Argentina/Cordoba",
    "America/Godthab": "America/Nuuk",
    "America/Indianapolis": "America/Indiana/Indianapolis",
    "America/Jujuy": "America/Argentina/Jujuy",
    "America/Louisville": "America/Kentucky/Louisville",
    "America/Mendoza": "America/Argentina/Mendoza",
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Rangoon": "Asia/Yangon",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "Atlantic/Faeroe": "Atlantic/Faroe",
    "Europe/Kiev": "Europe/Kyiv",
    "Pacific/Enderbury": "Pacific/Kanton",
    "Pacific/Ponape": "Pacific/Pohnpei",
    "Pacific/Truk": "Pacific/Chuuk",
};

/** A zone by the name the tz database uses now. */
export const currentZoneName = (zone: string) => RENAMED[zone] ?? zone;

/** Whether this browser knows the zone. */
export function isKnownZone(zone: string): boolean {
    if (!zone) return false;
    try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/**
 * The zone this browser is in, by its current name, or null when it cannot
 * say (or says something the API would refuse).
 */
export function browserZone(): string | null {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return zone && isKnownZone(zone) ? currentZoneName(zone) : null;
    } catch {
        return null;
    }
}

function zoneName(
    zone: string,
    style: "longGeneric" | "shortOffset",
    at: Date,
): string {
    return (
        new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: style })
            .formatToParts(at)
            .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". */
const cityOf = (zone: string) =>
    (zone.split("/").pop() ?? zone).replace(/_/g, " ");

/** The offset in minutes east of UTC, from "GMT+5:30" — for ordering. */
function offsetMinutes(offset: string): number {
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offset);
    if (!m) return 0;
    const minutes = Number(m[2]) * 60 + (m[3] ? Number(m[3]) : 0);
    return m[1] === "-" ? -minutes : minutes;
}

export interface ZoneOption {
    /** The IANA name the API stores. */
    zone: string;
    /** "Kolkata — India Standard Time (GMT+5:30)". */
    label: string;
    /** "Kolkata", the words a list row leads with. */
    city: string;
    /** "India Standard Time", or "" for a zone known only by its offset. */
    name: string;
    /** "GMT+5:30", as it stands at the moment the list was made. */
    offset: string;
    minutes: number;
}

/**
 * One zone, labelled. Its offset is today's: a zone with summer time reads
 * GMT+1 in July and GMT+0 in January, as its clocks do.
 */
export function zoneOption(zone: string, at: Date = new Date()): ZoneOption {
    const current = currentZoneName(zone);
    if (!isKnownZone(current)) {
        return {
            zone: current,
            label: current,
            city: current,
            name: "",
            offset: "",
            minutes: 0,
        };
    }
    const offset = zoneName(current, "shortOffset", at);
    const generic = zoneName(current, "longGeneric", at);
    // A zone known only by its offset (UTC, Etc/GMT+5) has no name to add.
    const name = /^(GMT|UTC)\b/.test(generic) ? "" : generic;
    const city = current === "UTC" ? "UTC" : cityOf(current);
    return {
        zone: current,
        label: `${city}${name ? ` — ${name}` : ""} (${offset})`,
        city,
        name,
        offset,
        minutes: offsetMinutes(offset),
    };
}

/** A saved zone as a person reads it. */
export const zoneLabel = (zone: string, at?: Date) =>
    zoneOption(zone, at).label;

/**
 * Every zone this browser knows, by current name and once each, plus UTC,
 * west to east and then by city — so a zone sits beside its neighbours.
 */
export function timeZoneOptions(at: Date = new Date()): ZoneOption[] {
    let zones: string[];
    try {
        zones = Intl.supportedValuesOf("timeZone");
    } catch {
        zones = [DEFAULT_TIMEZONE];
    }
    const names = new Set(["UTC", ...zones.map(currentZoneName)]);
    return Array.from(names)
        .filter(isKnownZone)
        .map((zone) => zoneOption(zone, at))
        .sort(
            (a, b) =>
                a.minutes - b.minutes || a.city.localeCompare(b.city, "en"),
        );
}
