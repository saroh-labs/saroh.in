/**
 * Time zones for Business settings: the IANA zones this browser knows, each
 * with a label a person reads ("Kolkata — India Standard Time (GMT+5:30)").
 * The API stores the IANA name and checks it against the tz database.
 */

import { currentZoneName, zoneInCountry, zonesOfCountry } from "@saroh/edition";

import { PROFILE } from "@/lib/edition";
import {
    isTimeZone,
    timeZoneName,
    viewerTimeZone,
} from "@/lib/format/datetime";
import { DEFAULT_TIMEZONE } from "@/lib/invoices/invoice-number";

export { DEFAULT_TIMEZONE };

/**
 * ICU still answers some zones by their old names — a browser in India
 * reports "Asia/Calcutta". Each is shown and saved as the name the tz
 * database uses now, which the API knows too (`@saroh/edition`).
 */
export { currentZoneName };

/**
 * The zone this browser is in, by its current name, or null when it cannot
 * say (or says something the API would refuse).
 */
export function browserZone(): string | null {
    try {
        const zone = viewerTimeZone();
        return zone && isTimeZone(zone) ? currentZoneName(zone) : null;
    } catch {
        return null;
    }
}

/** Where the business's country is asked (Global), its zone follows it. */
const zoneByCountry = PROFILE.businessCountry === "asked-at-setup";

/**
 * The zones a business may keep (KTD-C): on Global, its country's, when the
 * country is listed; null where any zone is offered (India, and a country
 * not listed).
 */
export function zonesOffered(
    country: string | null | undefined,
): readonly string[] | null {
    if (!zoneByCountry) return null;
    const zones = zonesOfCountry(country);
    return zones.length > 0 ? zones : null;
}

/** Whether setup asks the zone: a Global country that keeps several. */
export const zoneAsked = (country: string | null | undefined): boolean =>
    zoneByCountry && zonesOfCountry(country).length > 1;

/**
 * The zone offered before one is chosen: the browser's, except that on
 * Global it must be in the business's country (else the country's main
 * zone; none for a country not listed). Never another country's.
 */
export function offeredZone(country: string | null | undefined): string | null {
    const browser = browserZone();
    return zoneByCountry ? zoneInCountry(country, browser) : browser;
}

/** The browser's zone when it is one of the country's, for setup's question. */
export function browserZoneIn(country: string | null | undefined): string {
    const browser = browserZone();
    return browser && zonesOfCountry(country).includes(browser) ? browser : "";
}

function zoneName(
    zone: string,
    style: "longGeneric" | "shortOffset",
    at: Date,
): string {
    return timeZoneName(zone, style, at);
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
    if (!isTimeZone(current)) {
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
        label: `${city}${name ? ` · ${name}` : ""} (${offset})`,
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
export function timeZoneOptions(
    at: Date = new Date(),
    only?: readonly string[] | null,
): ZoneOption[] {
    if (only) {
        return only
            .map((zone) => zoneOption(zone, at))
            .sort(
                (a, b) =>
                    a.minutes - b.minutes || a.city.localeCompare(b.city, "en"),
            );
    }
    let zones: string[];
    try {
        zones = Intl.supportedValuesOf("timeZone");
    } catch {
        zones = [DEFAULT_TIMEZONE];
    }
    const names = new Set(["UTC", ...zones.map(currentZoneName)]);
    return Array.from(names)
        .filter(isTimeZone)
        .map((zone) => zoneOption(zone, at))
        .sort(
            (a, b) =>
                a.minutes - b.minutes || a.city.localeCompare(b.city, "en"),
        );
}
