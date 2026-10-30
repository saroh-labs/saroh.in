import { describe, expect, it } from "vitest";

import { columns, offerLine, ordinal, readCount } from "./logic";

describe("loyalty stamp card", () => {
    it("says the boards' offer: buy 9, the 10th is free", () => {
        expect(offerLine(10)).toBe("Buy 9, the 10th is free:");
        expect(offerLine(2)).toBe("Buy 1, the 2nd is free:");
        expect(ordinal(11)).toBe("11th");
        expect(ordinal(3)).toBe("3rd");
    });

    it("lays the stamps in one row up to 6, else two", () => {
        expect(columns(6)).toBe(6);
        expect(columns(8)).toBe(4);
        expect(columns(10)).toBe(5);
    });

    it("takes up to 12 stamps, as the States board says", () => {
        expect(readCount("15")).toEqual({
            ok: false,
            problem:
                "A card fits up to 12 stamps. Try 12, or make the reward come sooner.",
        });
        expect(readCount("9")).toEqual({ ok: true, n: 9 });
        expect(readCount("1")).toMatchObject({ ok: false });
        expect(readCount("")).toEqual({ ok: false, problem: null });
    });
});
