import { describe, expect, it } from "vitest";

import { amountProblem, percentProblem } from "./value";

describe("percentProblem", () => {
    it("takes a percentage the API takes", () => {
        for (const ok of ["10", " 12.5 ", "100", "0.01"]) {
            expect(percentProblem(ok)).toBeNull();
        }
    });

    it("asks for one when it is empty", () => {
        expect(percentProblem("  ")).toBe("Enter how much it takes off");
    });

    it("refuses what the API would refuse", () => {
        expect(percentProblem("12.345")).toBe(
            "A number, with at most two decimal places",
        );
        expect(percentProblem("ten")).toBe(
            "A number, with at most two decimal places",
        );
        expect(percentProblem("0")).toBe("More than 0 and at most 100");
        expect(percentProblem("100.01")).toBe("More than 0 and at most 100");
    });
});

describe("amountProblem", () => {
    it("takes an amount the API takes", () => {
        expect(amountProblem("250")).toBeNull();
        expect(amountProblem("99.5")).toBeNull();
    });

    it("asks for one, and refuses nothing off", () => {
        expect(amountProblem("")).toBe("Enter how much it takes off");
        expect(amountProblem("0.00")).toBe("More than 0");
        expect(amountProblem("1,000")).toBe(
            "A number, with at most two decimal places",
        );
    });
});
