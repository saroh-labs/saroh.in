import { describe, expect, it } from "vitest";

import type { StockLine } from "./overview-rules";
import { stockBadge, stockCounts } from "./overview-rules";
import {
    availability,
    collectionExamples,
    customerPriceNote,
    customerStockNote,
    detailTag,
    optionNoun,
    stockException,
    variantsLine,
    visibilityLine,
    websiteSummary,
    weekWords,
} from "./overview-words";

/**
 * The product page says what is true (Products audit, 16 Oct 2026): an
 * out shade is out, never "low"; the exception is named with its fix; the
 * reach is what it truly is while the online shop isn't live; MRP is
 * said struck through only when the shop strikes it.
 */

const line = (
    variantId: string,
    onHand: number,
    word: StockLine["word"],
    promised = 0,
): StockLine & { variantId: string } => ({
    variantId,
    onHand,
    promised,
    canSell: Math.max(0, onHand - promised),
    warnAt: 3,
    word,
});

const tarini = {
    mode: "variant" as const,
    product: null,
    variants: [
        line("v1", 14, "IN_STOCK"),
        line("v2", 2, "LOW"),
        line("v3", 1, "LOW"),
        line("v744", 0, "SOLD_OUT"),
    ],
};
const totals = { onHand: 17, promised: 0, canSell: 17, lowCount: 3 };
const titles: Record<string, string> = {
    v1: "1.0 Black",
    v2: "3.0 Dark Brown",
    v3: "4.0 Brown",
    v744: "7.44",
};
const money = (a: string) => `₹${Number(a)}`;

describe("the Stock tab's badge never counts out as low", () => {
    it("counts each line once: short, then out, then low", () => {
        expect(stockCounts(tarini)).toEqual({ short: 0, out: 1, low: 2 });
    });

    it("says 1 out · 2 low where the API's low count lumps them as 3", () => {
        expect(
            stockBadge(
                { ...tarini, totals, needs: { short: 0, low: 3 } },
                true,
            ),
        ).toBe("1 out · 2 low");
    });

    it("from an older API with no needs, reads this storefront's lines", () => {
        expect(stockBadge({ ...tarini, totals }, true)).toBe("1 out · 2 low");
    });

    it("says short first, and a short line isn't also out", () => {
        const short = {
            mode: "variant" as const,
            product: null,
            variants: [line("a", 1, "SOLD_OUT", 3), line("b", 0, "SOLD_OUT")],
        };
        expect(stockCounts(short)).toEqual({ short: 1, out: 1, low: 0 });
        expect(
            stockBadge({ ...short, totals, needs: { short: 1, low: 2 } }, true),
        ).toBe("1 short · 1 out");
    });
});

describe("the stock card names the exception", () => {
    it("names one out shade, and counts the low ones", () => {
        expect(
            stockException(tarini, (id) => titles[id] ?? id, "Shade"),
        ).toEqual({
            text: "7.44 is out · 2 low",
            variantIds: ["v744", "v2", "v3"],
        });
    });

    it("counts out shades past one, in the option's own word", () => {
        const two = {
            ...tarini,
            variants: [line("a", 0, "SOLD_OUT"), line("b", 0, "SOLD_OUT")],
        };
        expect(stockException(two, (id) => id, "Shade")?.text).toBe(
            "2 shades are out",
        );
    });

    it("is nothing when every line is fine", () => {
        expect(
            stockException(
                { ...tarini, variants: [line("a", 9, "IN_STOCK")] },
                (id) => id,
                "Shade",
            ),
        ).toBeNull();
    });

    it("says sold out for a product counted as a whole", () => {
        expect(
            stockException(
                {
                    mode: "product",
                    variants: [],
                    product: line("p", 0, "SOLD_OUT"),
                },
                (id) => id,
                null,
            ),
        ).toEqual({ text: "Sold out", variantIds: [] });
    });

    it("an archived product's card says what is on hand, not for sale", () => {
        const a = availability(
            { onHand: 10, promised: 0, canSell: 10, short: 0 },
            null,
            true,
        );
        expect(a.label).toBe("On hand");
        expect(a.figure).toBe("10");
        expect(a.note).toBe("Not for sale while it is archived");
    });
});

describe("variants in the product's own word", () => {
    it("uses the option's name, and variant when there is none", () => {
        expect(optionNoun("Shade")).toBe("shade");
        expect(optionNoun("Shade", 28)).toBe("shades");
        expect(optionNoun(null, 2)).toBe("variants");
    });

    it("sums the Variants card: count, price, what is out", () => {
        expect(
            variantsLine(
                {
                    count: 28,
                    optionName: "Shade",
                    min: "420",
                    max: "420",
                    out: 1,
                },
                money,
            ),
        ).toBe("28 shades · ₹420 each · 1 out");
        expect(
            variantsLine(
                { count: 6, optionName: "Jar", min: "420", max: "490", out: 0 },
                money,
            ),
        ).toBe("6 jars · ₹420 to ₹490");
    });
});

describe("the reach is what it truly is", () => {
    it("says sold at the counter, not online, while the shop isn't live", () => {
        expect(visibilityLine("PUBLISHED", false)).toBe(
            "Live. Sold at the counter. Not online yet.",
        );
        expect(visibilityLine("PUBLISHED", true)).toBe(
            "Live. Customers can buy it on your website",
        );
        expect(visibilityLine("PUBLISHED", null)).toBe(
            "Live. Customers can buy it",
        );
    });

    it("tags a shown field 'Shown when online' until the shop is live", () => {
        expect(detailTag(true, true, false)).toBe("Shown when online");
        expect(detailTag(true, true, true)).toBe("Shown online");
        expect(detailTag(false, true, false)).toBe("Hidden until filled in");
        expect(detailTag(true, false, false)).toBe("Team only");
    });

    it("the Website card says not online yet while the shop isn't live", () => {
        const placement = {
            collections: [],
            website: { showsProducts: false, pages: [] },
        };
        expect(websiteSummary(placement, false, false).headline).toBe(
            "Not online yet",
        );
    });
});

describe("the Customer view's notes", () => {
    it("says MRP is struck through only when the shop strikes it", () => {
        const same = {
            price: "420",
            variantPrices: ["420", "420"],
            optionName: "Shade",
            mrp: "420",
            savingPercent: null,
        };
        expect(customerPriceNote(same, money)).toBe("₹420 for every shade.");
        expect(
            customerPriceNote(
                { ...same, mrp: "500", savingPercent: 16 },
                money,
            ),
        ).toBe("₹420 for every shade. MRP ₹500 is shown struck through.");
    });

    it("gives the range across variants of different prices", () => {
        expect(
            customerPriceNote(
                {
                    price: "420",
                    variantPrices: ["420", "490", "450"],
                    optionName: "Jar",
                    mrp: null,
                    savingPercent: null,
                },
                money,
            ),
        ).toBe("₹420 to ₹490 across 3 jars.");
    });

    it("a product with no variants keeps its own MRP rule", () => {
        expect(
            customerPriceNote(
                {
                    price: "220",
                    variantPrices: [],
                    optionName: null,
                    mrp: "220",
                    savingPercent: null,
                },
                money,
            ),
        ).toBe("₹220.");
    });

    it("says the stock as a customer meets it, not every row", () => {
        const lines = [
            ...Array.from({ length: 27 }, (_, i) => ({
                title: `S${i}`,
                soldOut: false,
            })),
            { title: "7.44", soldOut: true },
        ];
        expect(customerStockNote(lines, "Shade")).toBe(
            "27 shades in stock, 7.44 sold out.",
        );
    });
});

describe("small truths", () => {
    const at = (iso: string) => iso;
    const now = new Date("2026-10-16T12:00:00Z");

    it("a first count is where stock started, not unexplained", () => {
        expect(
            weekWords(
                [
                    {
                        id: "e1",
                        kind: "COUNTED",
                        quantity: 167,
                        before: 0,
                        storeId: "s",
                        variantId: null,
                        createdAt: at("2026-10-15T10:00:00Z"),
                    },
                ],
                now,
            ),
        ).toBe(
            "This week: 0 sold, 0 received, 0 wasted, +167 at the first count.",
        );
    });

    it("a later count that moved stock still reads unexplained", () => {
        expect(
            weekWords(
                [
                    {
                        id: "e2",
                        kind: "COUNTED",
                        quantity: -2,
                        before: 12,
                        storeId: "s",
                        variantId: null,
                        createdAt: at("2026-10-15T10:00:00Z"),
                    },
                    {
                        id: "e1",
                        kind: "COUNTED",
                        quantity: 12,
                        before: 0,
                        storeId: "s",
                        variantId: null,
                        createdAt: at("2026-09-01T10:00:00Z"),
                    },
                ],
                now,
            ),
        ).toBe(
            "This week: 0 sold, 0 received, 0 wasted, −2 unexplained at counts.",
        );
    });

    it("draws collection examples from the business's own categories", () => {
        expect(collectionExamples(["Hair colour", "Shampoo"])).toBe(
            "a Hair colour section, a Shampoo list",
        );
        expect(collectionExamples([])).not.toMatch(/Breads/);
    });
});
