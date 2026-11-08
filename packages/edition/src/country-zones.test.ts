import { describe, expect, it } from "vitest";

import {
    currentZoneName,
    mainZoneOf,
    MULTI_ZONE_COUNTRIES,
    ONE_ZONE_COUNTRIES,
    zoneInCountry,
    zonesOfCountry,
} from "./country-zones";

// The runtime's per-country lists use CLDR's older names for a few zones.
const CLDR_NAME: Record<string, string> = {
    "Asia/Kolkata": "Asia/Calcutta",
    "Asia/Kathmandu": "Asia/Katmandu",
    "America/Indiana/Indianapolis": "America/Indianapolis",
    "America/Kentucky/Louisville": "America/Louisville",
    "America/Atikokan": "America/Coral_Harbour",
};

const runtimeZones = (country: string) =>
    (
        new Intl.Locale(`und-${country}`) as Intl.Locale & {
            getTimeZones(): string[];
        }
    ).getTimeZones();

const valid = (zone: string) => {
    try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
};

describe("countries with one zone", () => {
    it("name a zone the runtime knows, and one the country keeps", () => {
        for (const [country, zone] of Object.entries(ONE_ZONE_COUNTRIES)) {
            expect(valid(zone), zone).toBe(true);
            expect(runtimeZones(country), country).toContain(
                CLDR_NAME[zone] ?? zone,
            );
        }
    });

    it("keep India's", () => {
        expect(zonesOfCountry("IN")).toEqual(["Asia/Kolkata"]);
        expect(mainZoneOf("in")).toBe("Asia/Kolkata");
    });
});

describe("countries with several zones", () => {
    it("list exactly the zones the runtime gives the country", () => {
        for (const [country, { zones }] of Object.entries(
            MULTI_ZONE_COUNTRIES,
        )) {
            for (const zone of zones) expect(valid(zone), zone).toBe(true);
            expect(zones.map((z) => CLDR_NAME[z] ?? z).sort(), country).toEqual(
                [...runtimeZones(country)].sort(),
            );
        }
    });

    it("fall back to the owner's main zones, listed first", () => {
        expect(mainZoneOf("US")).toBe("America/New_York");
        expect(mainZoneOf("CA")).toBe("America/Toronto");
        expect(mainZoneOf("AU")).toBe("Australia/Sydney");
        for (const { main, zones } of Object.values(MULTI_ZONE_COUNTRIES)) {
            expect(zones[0]).toBe(main);
        }
        expect(zonesOfCountry("US")).toContain("America/Los_Angeles");
    });

    it("never name India's zone, and never repeat a one-zone country", () => {
        for (const [country, { zones }] of Object.entries(
            MULTI_ZONE_COUNTRIES,
        )) {
            expect(zones).not.toContain("Asia/Kolkata");
            expect(ONE_ZONE_COUNTRIES[country]).toBeUndefined();
        }
    });
});

describe("a country not listed", () => {
    it("has no zones and no main one", () => {
        expect(zonesOfCountry("BR")).toEqual([]);
        expect(mainZoneOf("BR")).toBeNull();
        expect(mainZoneOf(null)).toBeNull();
    });
});

describe("the zone a business starts with", () => {
    it("is the given zone only when the country keeps it", () => {
        expect(zoneInCountry("US", "America/Denver")).toBe("America/Denver");
        expect(zoneInCountry("US", "Asia/Kolkata")).toBe("America/New_York");
        expect(zoneInCountry("US", null)).toBe("America/New_York");
        expect(zoneInCountry("CA", "Europe/London")).toBe("America/Toronto");
        expect(zoneInCountry("AU", "")).toBe("Australia/Sydney");
    });

    it("reads a browser's old names as today's", () => {
        expect(zoneInCountry("US", "America/Indianapolis")).toBe(
            "America/Indiana/Indianapolis",
        );
        expect(zoneInCountry("CA", "America/Coral_Harbour")).toBe(
            "America/Atikokan",
        );
        expect(currentZoneName("Asia/Calcutta")).toBe("Asia/Kolkata");
    });

    it("gives a one-zone country its zone whatever was given", () => {
        expect(zoneInCountry("GB", "Asia/Kolkata")).toBe("Europe/London");
        expect(zoneInCountry("IN", "America/Chicago")).toBe("Asia/Kolkata");
    });

    it("knows no zone for a country not listed", () => {
        expect(zoneInCountry("BR", "America/Sao_Paulo")).toBeNull();
        expect(zoneInCountry(null, "Asia/Kolkata")).toBeNull();
    });
});
