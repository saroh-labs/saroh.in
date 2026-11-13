import { describe, expect, it } from "vitest";

import { isSuggested, templateFit, templatesByFit, tradeOf } from "./suggest";

const salon = { id: "salon", kinds: ["salon"], uses: ["APPOINTMENTS"] };
const bakery = { id: "bakery", kinds: ["food"], uses: ["COMMERCE"] };
const starter = { id: "starter", kinds: [], uses: [] };
const portfolio = { id: "portfolio", kinds: [], uses: [] };

describe("template suggestions (DEC-216)", () => {
    it("reads only a known trade", () => {
        expect(tradeOf("salon")).toBe("salon");
        expect(tradeOf("SALON")).toBeNull();
        expect(tradeOf(null)).toBeNull();
    });

    it("suggests by kind and modules, as the picker always has", () => {
        expect(isSuggested(starter, "BUSINESS", null, "starter")).toBe(true);
        expect(isSuggested(portfolio, "BUSINESS", null, "starter")).toBe(false);
        // A trade template whose module is off is not suggested.
        expect(isSuggested(bakery, "BUSINESS", ["APPOINTMENTS"], null)).toBe(
            false,
        );
        expect(isSuggested(bakery, "BUSINESS", null, null)).toBe(true);
    });

    it("puts the trade's templates first, then the suggested, then the rest", () => {
        const business = {
            trade: "salon",
            kind: "BUSINESS",
            modulesOn: ["APPOINTMENTS"],
            defaultId: "starter",
        };
        expect(templateFit(salon, business)).toBe("trade");
        expect(templateFit(bakery, business)).toBe("also");
        expect(
            templatesByFit([bakery, portfolio, starter, salon], business).map(
                (t) => [t.template.id, t.fit],
            ),
        ).toEqual([
            ["salon", "trade"],
            ["starter", "suggested"],
            ["bakery", "also"],
            ["portfolio", "also"],
        ]);
    });

    it("never calls 'other' a trade's own", () => {
        expect(
            templateFit(
                { id: "x", kinds: ["other"] },
                {
                    trade: "other",
                    kind: "BUSINESS",
                    modulesOn: null,
                    defaultId: null,
                },
            ),
        ).toBe("suggested");
    });
});
