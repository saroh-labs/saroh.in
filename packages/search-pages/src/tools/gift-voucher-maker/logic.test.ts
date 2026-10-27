import { describe, expect, it } from "vitest";

import {
    codePrefix,
    isoDay,
    makeCode,
    readDate,
    showDate,
    worth,
} from "./logic";

describe("gift voucher", () => {
    it("draws the boards' Rye Studio voucher", () => {
        expect(worth("amount", "2,000", "")).toBe("₹2,000");
        expect(worth("service", "", "Hair spa")).toBe("Hair spa");
        expect(showDate("2027-04-30")).toBe("30 Apr 2027");
    });

    it("marks what's missing", () => {
        expect(worth("amount", "", "")).toBe("[amount]");
        expect(worth("service", "", " ")).toBe("[service]");
    });

    it("makes a code like RYE-7K2Q-9M, with no look-alike characters", () => {
        let i = 0;
        const seq = [0.5, 0.1, 0.9, 0.3, 0.7, 0.2];
        const code = makeCode("Rye Studio", () => seq[i++ % seq.length] ?? 0);
        expect(code).toMatch(/^RYE-[A-HJ-KMNP-Z2-9]{4}-[A-HJ-KMNP-Z2-9]{2}$/);
        expect(codePrefix("12")).toBe("GFT");
    });

    it("compares dates by the local day", () => {
        expect(isoDay(new Date(2026, 9, 26))).toBe("2026-10-26");
    });

    it("reads a date the way it's typed, day first", () => {
        for (const v of [
            "30 Apr 2027",
            "30 april, 2027",
            "30/04/2027",
            "30-4-2027",
            "2027-04-30",
        ])
            expect(readDate(v)).toBe("2027-04-30");
        expect(readDate("31/02/2027")).toBeNull();
        expect(readDate("next month")).toBeNull();
    });
});
