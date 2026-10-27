import { describe, expect, it } from "vitest";

import { breakEven, gapNote, noBreakEven, resultRows } from "./logic";

// The boards' sample: Pulse Gym, ₹85,000 of fixed costs a month, an
// average sale of ₹500 that costs ₹200, open 26 days.
const GYM = {
    fixed: 8500000,
    average: 50000,
    perSale: 20000,
    days: 26,
    now: null,
};

describe("breakEven", () => {
    it("works out the boards' sample, rounding sales up", () => {
        const b = breakEven(GYM);
        expect(b.sales).toBe(284);
        expect(resultRows(GYM, b)).toEqual([
            { k: "A day, open 26 days", v: "About 11" },
            { k: "Each sale covers", v: "₹300.00" },
            {
                k: "Takings at break-even",
                v: "₹1,42,000 a month",
                total: true,
            },
        ]);
    });

    it("says how far past or short today's sales are", () => {
        const past = { ...GYM, now: 320 };
        expect(gapNote(past, breakEven(past))).toBe(
            "At 320 sales you're 36 past break-even, about ₹11,000 profit a month.",
        );
        const short = { ...GYM, now: 220 };
        expect(gapNote(short, breakEven(short))).toBe(
            "At 220 sales you're 64 short, about ₹19,000 a month below your costs.",
        );
    });

    it("says why there's no break-even when a sale costs more than it brings", () => {
        expect(noBreakEven(50000, 52000)).toBe(
            "That's more than the average sale of ₹500, so more sales won't cover your costs. Raise the price or cut the cost per sale.",
        );
    });
});
