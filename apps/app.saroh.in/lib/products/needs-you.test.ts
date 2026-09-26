import { describe, expect, it } from "vitest";

import { needsShown, needsSummary, needWords } from "./needs-you";
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
            what: "out of stock, customers can't buy it",
            tone: "danger",
        });
        expect(needWords(need("Jam", "low", { canSell: 3 }))).toMatchObject({
            what: "only 3 left",
            tone: "warn",
        });
    });

    it("names the shelves when only some need someone", () => {
        expect(
            needWords(need("Loaf", "out", { where: ["Small at Online"] })),
        ).toMatchObject({ what: "out of stock (Small at Online)" });
        expect(
            needWords(need("Jam", "low", { canSell: 2, where: ["Online"] })),
        ).toMatchObject({ what: "only 2 left (Online)", tone: "warn" });
        expect(needWords(need("Rye", "out", { where: null }))).toMatchObject({
            what: "out of stock, customers can't buy it",
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
        ).toBe("2 out of stock · 1 running low");
        expect(needsSummary([need("a", "short", { short: 1 })])).toBe(
            "1 short for orders",
        );
        expect(needsSummary([])).toBe("");
    });

    it("shows five and leaves the rest to Show only these", () => {
        const many = Array.from({ length: 8 }, (_, i) => need(`p${i}`, "out"));
        const { lines, more } = needsShown(many);
        expect(lines).toHaveLength(5);
        expect(more).toBe(3);
    });
});
