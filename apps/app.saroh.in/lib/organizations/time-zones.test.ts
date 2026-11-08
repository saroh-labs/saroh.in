import { isTimeZone } from "@/lib/format/datetime";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    currentZoneName,
    timeZoneOptions,
    zoneLabel,
    zoneOption,
} from "./time-zones";

const july = new Date("2026-07-01T12:00:00Z");
const january = new Date("2026-01-15T12:00:00Z");

describe("zoneLabel", () => {
    it("reads as a city, the zone's name and its offset", () => {
        expect(zoneLabel("Asia/Kolkata", july)).toBe(
            "Kolkata · India Standard Time (GMT+5:30)",
        );
        expect(zoneLabel("America/Argentina/Buenos_Aires", july)).toMatch(
            /^Buenos Aires · .+ \(GMT-3\)$/,
        );
    });

    it("gives today's offset, summer time and all", () => {
        expect(zoneOption("Europe/London", july).offset).toBe("GMT+1");
        expect(zoneOption("Europe/London", january).offset).toBe("GMT+0");
    });

    it("says an old name by the new one", () => {
        expect(currentZoneName("Asia/Calcutta")).toBe("Asia/Kolkata");
        expect(zoneOption("Asia/Calcutta", july).zone).toBe("Asia/Kolkata");
    });

    it("adds no name to a zone known only by its offset", () => {
        expect(zoneLabel("UTC", july)).toBe("UTC (GMT+0)");
    });

    it("shows a zone it does not know as stored", () => {
        expect(isTimeZone("Mars/Olympus")).toBe(false);
        expect(zoneLabel("Mars/Olympus")).toBe("Mars/Olympus");
    });
});

describe("timeZoneOptions", () => {
    const options = timeZoneOptions(july);

    it("lists each zone once, by its current name, with UTC", () => {
        const zones = options.map((o) => o.zone);
        expect(new Set(zones).size).toBe(zones.length);
        expect(zones).toContain("Asia/Kolkata");
        expect(zones).toContain("UTC");
        expect(zones).not.toContain("Asia/Calcutta");
    });

    it("runs west to east", () => {
        const minutes = options.map((o) => o.minutes);
        expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    });
});

describe("the zones a business is offered (KTD-C)", () => {
    afterEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    const load = async (edition: "INDIA" | "GLOBAL", browser: string) => {
        vi.stubEnv("NEXT_PUBLIC_EDITION", edition);
        vi.resetModules();
        vi.spyOn(
            Intl.DateTimeFormat.prototype,
            "resolvedOptions",
        ).mockReturnValue({
            timeZone: browser,
        } as Intl.ResolvedDateTimeFormatOptions);
        return import("./time-zones");
    };

    it("on Global, only the country's, and never the browser's from another country", async () => {
        const tz = await load("GLOBAL", "Asia/Calcutta");
        expect(tz.zonesOffered("US")).toContain("America/Chicago");
        expect(tz.zonesOffered("US")).not.toContain("Asia/Kolkata");
        expect(tz.zonesOffered("GB")).toEqual(["Europe/London"]);
        expect(tz.zonesOffered("BR")).toBeNull();
        expect(tz.zoneAsked("US")).toBe(true);
        expect(tz.zoneAsked("GB")).toBe(false);
        expect(tz.browserZoneIn("US")).toBe("");
        expect(tz.offeredZone("US")).toBe("America/New_York");
        expect(tz.offeredZone("GB")).toBe("Europe/London");
        expect(tz.DEFAULT_TIMEZONE).toBe("UTC");
    });

    it("on Global, prefills the browser's zone when it is in the country", async () => {
        const tz = await load("GLOBAL", "America/Indianapolis");
        expect(tz.browserZoneIn("US")).toBe("America/Indiana/Indianapolis");
    });

    it("on India, every zone and the browser's, as before", async () => {
        const tz = await load("INDIA", "America/Chicago");
        expect(tz.zonesOffered("IN")).toBeNull();
        expect(tz.zoneAsked("IN")).toBe(false);
        expect(tz.offeredZone("IN")).toBe("America/Chicago");
        expect(tz.DEFAULT_TIMEZONE).toBe("Asia/Kolkata");
    });
});
