import { describe, expect, it } from "vitest";

import { depositNote, noShowCost, readNumber, resultRows } from "./logic";

// The boards' sample: Rye Studio, 60 bookings a week, 8 in 100 don't turn
// up, ₹900 average, a 25% deposit (genC/noshow.py asserts the same sums).
const RYE = {
    bookings: 60,
    rate: 8,
    average: 900,
    deposit: "quarter",
} as const;

describe("noShowCost", () => {
    it("works out the boards' sample to the rupee", () => {
        const c = noShowCost(RYE);
        expect(Math.round(c.lostMonth)).toBe(18720);
        expect(Math.round(c.lostYear)).toBe(224640);
        expect(Math.round(c.keptMonth)).toBe(4680);
        expect(Math.round(c.keptYear)).toBe(56160);
        expect(Math.round(c.perMonth)).toBe(21);
    });

    it("lists the rows the desk board shows", () => {
        expect(resultRows(RYE, noShowCost(RYE))).toEqual([
            { k: "No-shows a month", v: "about 21" },
            { k: "Lost a month", v: "₹18,720" },
            { k: "Kept by a 25% deposit", v: "₹4,680 a month" },
            { k: "Still lost", v: "₹14,040 a month" },
            { k: "Lost a year", v: "₹2,24,640", total: true },
        ]);
        expect(depositNote(RYE, noShowCost(RYE))).toMatch(
            /^A 25% deposit keeps ₹56,160 a year of it\./,
        );
    });

    it("with no deposit, shows the loss and what each deposit would keep", () => {
        const none = { ...RYE, deposit: "none" } as const;
        expect(resultRows(none, noShowCost(none)).map((r) => r.k)).toEqual([
            "No-shows a month",
            "Lost a year",
        ]);
        expect(depositNote(none, noShowCost(none))).toBe(
            "With a 25% deposit you'd keep ₹4,680 a month. With half, ₹9,360.",
        );
    });

    it("costs nothing when nobody misses", () => {
        expect(noShowCost({ ...RYE, rate: 0 }).lostYear).toBe(0);
    });
});

describe("readNumber", () => {
    it("reads what people type, and nothing else", () => {
        expect(readNumber("1,200")).toBe(1200);
        expect(readNumber(" 8.5 ")).toBe(8.5);
        expect(readNumber("₹900")).toBe(900);
        expect(readNumber("")).toBeNull();
        expect(readNumber("-4")).toBeNull();
        expect(readNumber("ten")).toBeNull();
    });
});
