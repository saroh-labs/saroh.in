import { describe, expect, it } from "vitest";

import {
    currentZoneName,
    isKnownZone,
    timeZoneOptions,
    zoneLabel,
    zoneOption,
} from "./time-zones";

const july = new Date("2026-07-01T12:00:00Z");
const january = new Date("2026-01-15T12:00:00Z");

describe("zoneLabel", () => {
    it("reads as a city, the zone's name and its offset", () => {
        expect(zoneLabel("Asia/Kolkata", july)).toBe(
            "Kolkata — India Standard Time (GMT+5:30)",
        );
        expect(zoneLabel("America/Argentina/Buenos_Aires", july)).toMatch(
            /^Buenos Aires — .+ \(GMT-3\)$/,
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
        expect(isKnownZone("Mars/Olympus")).toBe(false);
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
