import { describe, expect, it } from "vitest";

import {
    clashAdvice,
    DEFAULT_SKU_PATTERN,
    distinctSkus,
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

    it("names a clash from what is missing, and never blocks", () => {
        const row = (
            productId: string,
            product: string,
            variant: string,
            sku: string,
        ) => ({
            productId,
            product,
            variant,
            sku,
        });
        // Both parts there: the value is cut to four letters.
        expect(
            clashAdvice(DEFAULT_SKU_PATTERN, [
                row("p1", "Godaan", "Hindi · Paperback", "GOD01-HIND"),
                row("p1", "Godaan", "Hindi · Hardcover", "GOD01-HIND"),
                row("p1", "Godaan", "English", "GOD01-ENGL"),
            ]),
        ).toBe(
            "Hindi · Paperback and Hindi · Hardcover both shorten to HIND. The editor will add -2, -3 to tell them apart.",
        );
        // No {N}: two products share it.
        expect(
            clashAdvice("{NAME3}", [
                row("p1", "Vitamin serum", "", "VIT"),
                row("p2", "Vitamin oil", "", "VIT"),
            ]),
        ).toBe(
            "Vitamin serum and Vitamin oil both get VIT. The editor will add -2, -3 to tell them apart, or add {N} to number each product.",
        );
        // No {VALUE}: two variants of one product share it.
        expect(
            clashAdvice("{NAME3}{N}", [
                row("p1", "Rose oil", "30 ml", "ROS01"),
                row("p1", "Rose oil", "50 ml", "ROS01"),
            ]),
        ).toMatch(/both get ROS01\. .*add \{VALUE\}/);
        expect(
            clashAdvice("{NAME3}{N}", [
                row("p1", "Vit", "", "VIT01"),
                row("p2", "Ros", "", "ROS02"),
            ]),
        ).toBe("");
    });

    it("adds -2, -3 to a SKU that is taken", () => {
        const parts = {
            name: "Godaan",
            category: "",
            value: "Hindi · Hardcover",
            n: 1,
        };
        expect(skuFrom(DEFAULT_SKU_PATTERN, parts)).toBe("GOD01-HIND");
        expect(skuFrom(DEFAULT_SKU_PATTERN, parts, ["god01-hind"])).toBe(
            "GOD01-HIND-2",
        );
        expect(
            skuFrom(DEFAULT_SKU_PATTERN, parts, ["GOD01-HIND", "GOD01-HIND-2"]),
        ).toBe("GOD01-HIND-3");
        expect(skuFrom(DEFAULT_SKU_PATTERN, parts, ["OTHER"])).toBe(
            "GOD01-HIND",
        );
        expect(distinctSkus(["A", "A", "B", "A", "A-2"])).toEqual([
            "A",
            "A-2",
            "B",
            "A-3",
            "A-2-2",
        ]);
    });
});
