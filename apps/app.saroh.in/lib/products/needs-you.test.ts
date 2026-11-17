import { describe, expect, it } from "vitest";

import { needsHeadline, needsShown, needWords, optionWord } from "./needs-you";
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

    it("folds to what its headline counts, and opens to every one", () => {
        const mixed = [
            need("a", "out"),
            need("b", "short", { short: 2 }),
            need("c", "low", { canSell: 3 }),
        ];
        expect(needsShown(mixed, false).map((l) => l.name)).toEqual(["a", "b"]);
        expect(needsShown(mixed, true)).toHaveLength(3);
        // Nothing short or out: the low ones are what it lists.
        expect(
            needsShown([need("c", "low", { canSell: 3 })], false),
        ).toHaveLength(1);
        // Up to 8 folded.
        const many = Array.from({ length: 12 }, (_, i) => need(`p${i}`, "out"));
        expect(needsShown(many, false)).toHaveLength(8);
        expect(needsShown(many, true)).toHaveLength(12);
    });

    it("says what it lists, then the rest", () => {
        expect(
            needsHeadline([
                need("a", "out"),
                need("b", "out"),
                need("c", "low", { canSell: 2 }),
            ]),
        ).toEqual({
            lead: "2 out of stock",
            rest: "and 1 running low",
            phone: "2 out of stock, 1 low",
        });
        expect(
            needsHeadline([need("a", "short", { short: 1 }), need("b", "out")]),
        ).toMatchObject({
            lead: "1 short for orders · 1 out of stock",
            rest: "",
        });
        expect(needsHeadline([need("c", "low", { canSell: 2 })])).toEqual({
            lead: "1 running low",
            rest: "",
            phone: "1 running low",
        });
    });

    it("says the option's own word", () => {
        expect(optionWord("Shade", 1)).toBe("shade");
        expect(optionWord("Shade", 3)).toBe("shades");
        expect(optionWord("Box", 2)).toBe("boxes");
        expect(optionWord(null, 2)).toBe("variants");
    });
});
