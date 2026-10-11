import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    clockParts,
    clockValue,
    clockWords,
    timeRangeWords,
    timeWords,
} from "./clock";

const KOLKATA = "Asia/Kolkata";

/**
 * The same cases as the API's `words-format.spec.ts` ("a time in a
 * sentence"), value for value: the page and the email a customer gets must
 * say one time the same way. A case added there is added here.
 */
describe("a time a customer reads", () => {
    it("is on the 12-hour clock, with am and pm in small letters", () => {
        expect(timeWords(new Date("2025-10-12T04:00:00.000Z"), KOLKATA)).toBe(
            "9:30 am",
        );
        expect(timeWords(new Date("2025-10-12T12:35:00.000Z"), KOLKATA)).toBe(
            "6:05 pm",
        );
    });

    it("says noon and midnight as 12", () => {
        expect(timeWords(new Date("2025-10-12T06:30:00.000Z"), KOLKATA)).toBe(
            "12:00 pm",
        );
        expect(timeWords(new Date("2025-10-12T18:30:00.000Z"), KOLKATA)).toBe(
            "12:00 am",
        );
    });

    it("reads a wall-clock value the same way", () => {
        expect(clockWords("09:30")).toBe("9:30 am");
        expect(clockWords("18:00")).toBe("6:00 pm");
        expect(clockWords("00:15")).toBe("12:15 am");
        expect(clockWords("12:00")).toBe("12:00 pm");
        expect(clockWords("closed")).toBe("closed");
    });
});

describe("the site's own cases", () => {
    it("takes an ISO string as it comes from the API", () => {
        expect(timeWords("2026-10-05T03:30:00.000Z", KOLKATA)).toBe("9:00 am");
        expect(timeWords("2026-10-05T07:30:00.000Z", KOLKATA)).toBe("1:00 pm");
        expect(timeWords("2026-10-05T11:00:00.000Z", KOLKATA)).toBe("4:30 pm");
    });

    it("reads the time in the zone it is given", () => {
        const at = "2026-10-05T07:30:00.000Z";
        expect(timeWords(at, "UTC")).toBe("7:30 am");
        expect(timeWords(at, "America/New_York")).toBe("3:30 am");
    });

    it("never writes a leading zero, a capital or a dot", () => {
        for (let h = 0; h < 24; h += 1) {
            const at = new Date(Date.UTC(2026, 9, 5, h, 5));
            expect(timeWords(at, "UTC")).toMatch(/^(1[0-2]|[1-9]):05 (am|pm)$/);
        }
    });

    it("keeps a 24-hour value for a machine", () => {
        expect(clockValue("2026-10-05T03:30:00.000Z", KOLKATA)).toBe("09:00");
        expect(clockValue("2026-10-05T07:30:00.000Z", KOLKATA)).toBe("13:00");
        expect(clockValue("2026-10-05T18:30:00.000Z", KOLKATA)).toBe("00:00");
        expect(clockParts("2026-10-05T18:30:00.000Z", KOLKATA)).toEqual({
            hour: 0,
            minute: 0,
        });
    });

    it("throws on a zone the runtime does not know, as Intl does", () => {
        expect(() => timeWords(new Date(), "Not/AZone")).toThrow();
    });
});

/** The merchant app's `formatTimeRange` rule. */
describe("from one time to another", () => {
    it("says am or pm once when both ends share it", () => {
        expect(
            timeRangeWords(
                "2026-10-05T03:30:00.000Z",
                "2026-10-05T04:00:00.000Z",
                KOLKATA,
            ),
        ).toBe("9:00 to 9:30 am");
        expect(
            timeRangeWords(
                "2026-10-05T12:30:00.000Z",
                "2026-10-05T13:30:00.000Z",
                KOLKATA,
            ),
        ).toBe("6:00 to 7:00 pm");
    });

    it("says it at both ends when they differ", () => {
        expect(
            timeRangeWords(
                "2026-10-05T06:00:00.000Z",
                "2026-10-05T06:45:00.000Z",
                KOLKATA,
            ),
        ).toBe("11:30 am to 12:15 pm");
    });
});

/**
 * One formatter for the site. A file that formats its own hour drifts from
 * the rest ("13:00" on the booking page, "1:00 pm" in the email), so nothing
 * else in this package may ask `Intl` for an hour. Opening hours have their
 * own compact form ("9am–7pm") and read the zone's clock for "Open now".
 */
describe("the site's times come from this formatter", () => {
    const SRC = path.join(__dirname, "..");
    const MAY = ["lib/clock.ts", "lib/opening-hours.ts"];
    const HOUR =
        /\bhour12\b|\bhourCycle\b|\bhour:\s*["']|\btimeStyle\b|\.toLocaleTimeString\(/;

    function files(dir: string, out: string[] = []): string[] {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) files(file, out);
            else if (
                /\.tsx?$/.test(entry.name) &&
                !/\.test\.tsx?$/.test(entry.name)
            )
                out.push(file);
        }
        return out;
    }

    it("no other file formats an hour by hand", () => {
        const found = files(SRC)
            .map((file) => path.relative(SRC, file).split(path.sep).join("/"))
            .filter((file) => !MAY.includes(file))
            .filter((file) =>
                HOUR.test(readFileSync(path.join(SRC, file), "utf8")),
            );
        expect(found).toEqual([]);
    });
});
