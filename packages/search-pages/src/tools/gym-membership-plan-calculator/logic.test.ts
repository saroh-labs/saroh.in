import { describe, expect, it } from "vitest";

import type { GymInput } from "./logic";
import { planNote, planRows, plans, roundedLine } from "./logic";

// The boards' sample: Pulse Gym, ₹1,500 a month, 10% off 3 months, 25%
// off 12 months, rounded to ₹50 (genC/gym.py asserts the same sums).
const PULSE: GymInput = {
    monthly: 150000,
    quarter: 10,
    year: 25,
    rounding: "50",
};

describe("plans", () => {
    it("works out the boards' sample to the rupee", () => {
        const ps = plans(PULSE);
        expect(planRows(ps)).toEqual([
            ["Monthly", "₹1,500", "₹1,500", "—"],
            ["3 months", "₹4,050", "₹1,350", "₹450"],
            ["12 months", "₹13,500", "₹1,125", "₹4,500"],
        ]);
        expect(planNote(PULSE, ps)).toBe(
            "A member who pays for 12 months saves ₹4,500, three months free.",
        );
        expect(roundedLine(PULSE, ps)).toBeNull();
    });

    it("rounds half up, and works the saving out from the rounded price", () => {
        const i = { ...PULSE, quarter: 12, year: 22, rounding: "100" as const };
        const ps = plans(i);
        expect(planRows(ps).slice(1)).toEqual([
            ["3 months", "₹4,000", "₹1,333", "₹500"],
            ["12 months", "₹14,000", "₹1,167", "₹4,000"],
        ]);
        expect(roundedLine(i, ps)).toBe(
            "3 months at 12% off, 12 months at 22% off, then rounded.",
        );
    });

    it("says when a longer plan costs more a month", () => {
        const i = { ...PULSE, quarter: 20, year: 15, rounding: "1" as const };
        const ps = plans(i);
        expect(planRows(ps)[2]).toEqual([
            "12 months",
            "₹15,300",
            "₹1,275",
            "₹2,700",
        ]);
        expect(planNote(i, ps)).toMatch(
            /^12 months costs more a month than 3 months, because its discount is smaller \(15% against 20%\)\./,
        );
    });

    it("keeps the paisa when not rounded", () => {
        const ps = plans({ ...PULSE, monthly: 99900, rounding: "1" });
        expect(ps[1]?.price).toBe(269730);
    });
});
