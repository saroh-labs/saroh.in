import { describe, expect, it } from "vitest";

import { replaySwitchedOn, sharesUsageNow } from "./sharing";

describe("replaySwitchedOn (DEC-125)", () => {
    it("needs both a key and the switch exactly on", () => {
        expect(replaySwitchedOn({ key: "phc_x", replay: "on" })).toBe(true);
        for (const settings of [
            { key: undefined, replay: "on" },
            { key: "", replay: "on" },
            { key: "phc_x", replay: undefined },
            { key: "phc_x", replay: "off" },
            { key: "phc_x", replay: "true" },
            { key: undefined, replay: undefined },
        ])
            expect(replaySwitchedOn(settings)).toBe(false);
    });
});

describe("sharesUsageNow", () => {
    it("is what the person saved", () => {
        expect(sharesUsageNow({ sharesUsage: true })).toBe(true);
        expect(sharesUsageNow({ sharesUsage: false })).toBe(false);
    });

    it("is yes for someone who has never chosen", () => {
        expect(sharesUsageNow({ sharesUsage: null })).toBe(true);
    });

    it("is no when the choice could not be read: nobody is recorded on a guess", () => {
        expect(sharesUsageNow(null)).toBe(false);
    });
});
