import { describe, expect, it } from "vitest";

import { needsShown, needsSummary, needWords, optionWord } from "./needs-you";
import type { CatalogueNeed } from "./service";

const need = (
    name: string,
    kind: CatalogueNeed["kind"],
    over: Partial<CatalogueNeed> = {},
): CatalogueNeed => ({
    productId: name,
    name,
    kind,
    short: 0,
    canSell: 0,
    ...over,
});

describe("Needs you (#519)", () => {
    it("says the design's notes", () => {
        expect(needWords(need("Rye", "out"))).toMatchObject({
            what: "Out of stock",
            tone: "danger",
        });
        expect(needWords(need("Jam", "low", { canSell: 3 }))).toMatchObject({
            what: "Only 3 left",
            tone: "warn",
        });
    });

    it("names the shelves when only some need someone", () => {
        expect(
            needWords(need("Loaf", "out", { where: ["Small at Online"] })),
        ).toMatchObject({ what: "Out: Small at Online" });
        expect(
            needWords(need("Jam", "low", { canSell: 2, where: ["Online"] })),
        ).toMatchObject({ what: "Low: Online (2 left)", tone: "warn" });
        expect(needWords(need("Rye", "out", { where: null }))).toMatchObject({
            what: "Out of stock",
        });
    });

    it("says a short product is short for orders already placed, in danger", () => {
        expect(needWords(need("Bun", "short", { short: 2 }))).toMatchObject({
            what: "2 short for orders already placed",
            tone: "danger",
        });
    });

    it("sums them up, leaving out what isn't there", () => {
        expect(
            needsSummary([
                need("a", "out"),
                need("b", "out"),
                need("c", "low", { canSell: 2 }),
            ]),
        ).toBe("2 out · 1 low");
        expect(needsSummary([need("a", "short", { short: 1 })])).toBe(
            "1 short",
        );
        expect(needsSummary([])).toBe("");
    });

    it("folds to the worst two, and opens to every one", () => {
        const many = Array.from({ length: 8 }, (_, i) => need(`p${i}`, "out"));
        expect(needsShown(many, false).map((l) => l.name)).toEqual([
            "p0",
            "p1",
        ]);
        expect(needsShown(many, true)).toHaveLength(8);
    });

    it("says the option's own word", () => {
        expect(optionWord("Shade", 1)).toBe("shade");
        expect(optionWord("Shade", 3)).toBe("shades");
        expect(optionWord("Box", 2)).toBe("boxes");
        expect(optionWord(null, 2)).toBe("variants");
    });
});
