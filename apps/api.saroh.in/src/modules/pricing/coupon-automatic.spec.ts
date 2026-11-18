import { automaticClash, discountProblem } from "./coupons.service";

// Codes and plans are made up.
describe("automaticClash: one automatic coupon per plan", () => {
    const others = [
        { code: "FAKE-ONE", planIds: ["b"] },
        { code: "FAKE-TWO", planIds: ["c", "d"] },
    ];

    it("names the first plan another automatic coupon already covers, and that coupon", () => {
        expect(automaticClash(others, ["a", "d"])).toEqual({
            code: "FAKE-TWO",
            planId: "d",
        });
        expect(automaticClash(others, ["b", "c"])).toEqual({
            code: "FAKE-ONE",
            planId: "b",
        });
    });

    it("is null when no plan is taken", () => {
        expect(automaticClash(others, ["a"])).toBeNull();
        expect(automaticClash([], ["b"])).toBeNull();
    });
});

describe("discountProblem: an amount or a percent, never both", () => {
    it("takes an amount alone or a whole percent from 1 to 90 alone", () => {
        expect(
            discountProblem({ discountPaise: 111, percentOff: null }),
        ).toBeNull();
        expect(discountProblem({ discountPaise: 0, percentOff: 1 })).toBeNull();
        expect(
            discountProblem({ discountPaise: 0, percentOff: 90 }),
        ).toBeNull();
    });

    it("refuses neither, both, or a percent out of range or not whole", () => {
        expect(
            discountProblem({ discountPaise: 0, percentOff: null })?.field,
        ).toBe("discountPaise");
        expect(
            discountProblem({ discountPaise: 111, percentOff: 7 })?.field,
        ).toBe("discountPaise");
        for (const percentOff of [0, 91, 7.5, -3]) {
            expect(
                discountProblem({ discountPaise: 0, percentOff })?.field,
            ).toBe("percentOff");
        }
    });
});
