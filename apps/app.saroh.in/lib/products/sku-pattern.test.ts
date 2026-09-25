import { describe, expect, it } from "vitest";

import {
    clashProblem,
    DEFAULT_SKU_PATTERN,
    patternProblem,
    skuFrom,
} from "./sku-pattern";

// The API keeps the same rules
// (apps/api.saroh.in/src/modules/catalogue/sku-pattern.spec.ts, same cases).
describe("SKU pattern", () => {
    it("fills each part", () => {
        const parts = {
            name: "Vitamin C 10% Brightening Serum",
            category: "Serums & treatments",
            value: "30 ml",
            n: 3,
        };
        expect(skuFrom(DEFAULT_SKU_PATTERN, parts)).toBe("VIT03-30ML");
        expect(skuFrom("{CAT}-{NAME3}-{VALUE}", parts)).toBe("SER-VIT-30ML");
        expect(skuFrom("{NAME3}{N}", { ...parts, n: 12 })).toBe("VIT12");
    });

    it("falls back, drops accents, and never leaves a stray hyphen", () => {
        expect(
            skuFrom("{CAT}-{NAME3}-{VALUE}", {
                name: "Rosé oil",
                category: "",
                value: "",
                n: 1,
            }),
        ).toBe("GEN-ROS");
        expect(
            skuFrom("{NAME3}", { name: "", category: "", value: "", n: 1 }),
        ).toBe("SKU");
    });

    it("says what is wrong, in order", () => {
        expect(patternProblem("")).toBe("A pattern needs at least one part.");
        expect(patternProblem("ABC")).toMatch(/at least one part in braces/);
        expect(patternProblem("{NAME3} {N}")).toMatch(/Letters, numbers/);
        expect(patternProblem("{NAME3}{SIZE}")).toMatch(/Only \{NAME3\}/);
        expect(patternProblem(DEFAULT_SKU_PATTERN)).toBe("");
    });

    it("names a clash and the part that would resolve it", () => {
        expect(clashProblem("{NAME3}", ["VIT", "VIT", "ROS"])).toBe(
            "2 variants would share VIT. Add {N} so each one differs.",
        );
        expect(clashProblem("{NAME3}{N}", ["VIT01", "VIT01"])).toMatch(
            /Add \{VALUE\}/,
        );
        expect(clashProblem("{NAME3}{N}", ["VIT01", "ROS02"])).toBe("");
    });
});
