import { describe, expect, it } from "vitest";

import type { StockCell } from "./levels";
import {
    changeTone,
    productStock,
    shelfName,
    shelfWord,
    stockFootnote,
    warnsAt,
    weekLine,
} from "./product-stock";

function cell(over: Partial<StockCell> = {}): StockCell {
    return {
        storeId: "hill",
        stockLevelId: "sl",
        soldHere: true,
        onHand: 10,
        promised: 0,
        canSell: 10,
        short: 0,
        warnAt: 4,
        word: "IN_STOCK",
        lastChange: null,
        ...over,
    };
}

const STORES = [
    { id: "hill", name: "Hill Road" },
    { id: "online", name: "Online" },
];

describe("shelfWord", () => {
    it("says short first, before sold out", () => {
        expect(
            shelfWord(cell({ short: 2, canSell: 0, word: "SOLD_OUT" })),
        ).toEqual({ text: "2 short", tone: "bad" });
    });
    it("says sold out, only N left, and in stock", () => {
        expect(shelfWord(cell({ canSell: 0, word: "SOLD_OUT" })).text).toBe(
            "Sold out",
        );
        expect(shelfWord(cell({ canSell: 3, word: "LOW" }))).toEqual({
            text: "Only 3 left",
            tone: "low",
        });
        expect(shelfWord(cell()).text).toBe("In stock");
    });
    it("says a storefront that doesn't sell it", () => {
        expect(
            shelfWord(cell({ soldHere: false, word: "NOT_SOLD_HERE" })).tone,
        ).toBe("muted");
    });
});

describe("productStock", () => {
    it("two storefronts: a shelf each, totals and what each can sell", () => {
        const stock = productStock(
            {
                storefronts: STORES,
                rows: [
                    {
                        productId: "p1",
                        variantId: "v800",
                        cells: [
                            cell({ onHand: 14, promised: 4, canSell: 10 }),
                            cell({
                                storeId: "online",
                                onHand: 6,
                                canSell: 6,
                                word: "LOW",
                                warnAt: 6,
                            }),
                        ],
                    },
                    {
                        productId: "p1",
                        variantId: "v400",
                        cells: [
                            cell({
                                soldHere: false,
                                onHand: 0,
                                canSell: 0,
                                word: "NOT_SOLD_HERE",
                            }),
                            cell({
                                storeId: "online",
                                onHand: 10,
                                promised: 1,
                                canSell: 9,
                            }),
                        ],
                    },
                    { productId: "other", variantId: null, cells: [cell()] },
                ],
            },
            "p1",
        );
        expect(stock).not.toBeNull();
        if (!stock) return;
        expect(stock.mode).toBe("variant");
        expect(stock.split).toBe(true);
        expect(stock.sizes).toHaveLength(2);
        expect(stock.sizes[0].shelves.map((s) => s.name)).toEqual([
            "Hill Road",
            "Online",
        ]);
        // A storefront that neither sells it nor holds any is left out.
        expect(stock.sizes[1].shelves.map((s) => s.name)).toEqual(["Online"]);
        expect(
            shelfName(stock.sizes[1], stock.sizes[1].shelves[0], stock.split),
        ).toBe("Online only");
        expect(stock.totals).toEqual({
            onHand: 30,
            promised: 5,
            canSell: 25,
            short: 0,
        });
        expect(stock.byStore).toEqual([
            { storeId: "hill", name: "Hill Road", canSell: 10 },
            { storeId: "online", name: "Online", canSell: 15 },
        ]);
        expect(warnsAt(stock.sizes[0], stock.split)).toBe(
            "Warns at 4 per shop",
        );
        expect(stockFootnote(stock.split)).toMatch(/^Each storefront/);
    });

    it("keeps stock left at a storefront that stopped selling it", () => {
        const stock = productStock(
            {
                storefronts: STORES,
                rows: [
                    {
                        productId: "p1",
                        variantId: null,
                        cells: [
                            cell(),
                            cell({
                                storeId: "online",
                                soldHere: false,
                                onHand: 3,
                                canSell: 3,
                                word: "NOT_SOLD_HERE",
                            }),
                        ],
                    },
                ],
            },
            "p1",
        );
        expect(stock?.mode).toBe("product");
        expect(stock?.sizes[0].shelves[1].word.text).toBe("Not sold here");
        // Not sold there: it can't be sold there either.
        expect(stock?.totals.canSell).toBe(10);
        expect(stock?.totals.onHand).toBe(13);
    });

    it("sums short shelf by shelf", () => {
        const stock = productStock(
            {
                storefronts: STORES,
                rows: [
                    {
                        productId: "p1",
                        variantId: null,
                        cells: [
                            cell({
                                onHand: 1,
                                promised: 3,
                                canSell: 0,
                                short: 2,
                            }),
                            cell({ storeId: "online", onHand: 9, canSell: 9 }),
                        ],
                    },
                ],
            },
            "p1",
        );
        expect(stock?.totals.short).toBe(2);
        expect(stock?.sizes[0].shelves[0].word.text).toBe("2 short");
    });

    it("one storefront: no split, singular footnote", () => {
        const stock = productStock(
            {
                storefronts: [STORES[0]],
                rows: [{ productId: "p1", variantId: null, cells: [cell()] }],
            },
            "p1",
        );
        expect(stock?.split).toBe(false);
        if (!stock) return;
        expect(warnsAt(stock.sizes[0], false)).toBe("Warns at 4");
        expect(stockFootnote(false)).toBe(
            "Promised is what open orders have already taken.",
        );
    });

    it("is null for a product that doesn't count stock", () => {
        expect(
            productStock({ storefronts: STORES, rows: [] }, "p1"),
        ).toBeNull();
    });
});

describe("weekLine", () => {
    const now = new Date("2026-09-26T10:00:00Z");
    it("adds up the last seven days, baked for a bakery", () => {
        expect(
            weekLine(
                [
                    {
                        kind: "SOLD",
                        quantity: -4,
                        createdAt: "2026-09-25T08:00:00Z",
                    },
                    {
                        kind: "BAKED",
                        quantity: 38,
                        createdAt: "2026-09-24T06:00:00Z",
                    },
                    {
                        kind: "WASTED",
                        quantity: -3,
                        createdAt: "2026-09-23T20:00:00Z",
                    },
                    {
                        kind: "COUNTED",
                        quantity: -1,
                        createdAt: "2026-09-26T07:10:00Z",
                    },
                    {
                        kind: "SOLD",
                        quantity: -9,
                        createdAt: "2026-09-10T08:00:00Z",
                    },
                ],
                now,
            ),
        ).toBe(
            "This week: 4 sold, 38 baked, 3 wasted, −1 unexplained at counts.",
        );
    });
    it("says received when nothing was baked, and no count line when counts agreed", () => {
        expect(
            weekLine(
                [
                    {
                        kind: "RECEIVED",
                        quantity: 5,
                        createdAt: "2026-09-25T08:00:00Z",
                    },
                    {
                        kind: "COUNTED",
                        quantity: 0,
                        createdAt: "2026-09-25T09:00:00Z",
                    },
                ],
                now,
            ),
        ).toBe("This week: 0 sold, 5 received, 0 wasted.");
    });
});

describe("changeTone", () => {
    it("colours by sign", () => {
        expect(changeTone(2)).toBe("ok");
        expect(changeTone(-1)).toBe("bad");
        expect(changeTone(0)).toBe("muted");
    });
});
