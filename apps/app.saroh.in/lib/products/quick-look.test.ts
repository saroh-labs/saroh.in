import { describe, expect, it } from "vitest";

import { catalogueRows } from "./catalogue";
import { catalogueProduct } from "./catalogue.fixture";
import {
    position,
    quickStock,
    readAdd,
    shelfLine,
    shelfTone,
    showShelves,
    step,
    stockLine,
    storefrontsLine,
} from "./quick-look";

/** The Cinnamon bun of the design: two sizes at Hill Road, one short. */
function bun() {
    const [row] = catalogueRows([
        catalogueProduct({
            id: "bun",
            name: "Cinnamon bun",
            variants: [
                { id: "single", sku: "CB-1", title: "Single", price: null },
                { id: "six", sku: "CB-6", title: "Six-pack", price: "320" },
            ],
            listings: [
                {
                    storeId: "hill",
                    storeName: "Hill Road",
                    inventory: { quantity: 4, promised: 6, lowStockAlert: 5 },
                    variants: [
                        {
                            variantId: "single",
                            soldHere: true,
                            inventory: {
                                quantity: 3,
                                promised: 3,
                                lowStockAlert: 5,
                            },
                        },
                        {
                            variantId: "six",
                            soldHere: true,
                            inventory: {
                                quantity: 1,
                                promised: 3,
                                lowStockAlert: 5,
                            },
                        },
                    ],
                },
                {
                    storeId: "online",
                    storeName: "Online",
                    inventory: { quantity: 4, promised: 0, lowStockAlert: 5 },
                    variants: [
                        {
                            variantId: "single",
                            soldHere: true,
                            inventory: {
                                quantity: 4,
                                promised: 0,
                                lowStockAlert: 5,
                            },
                        },
                        {
                            variantId: "six",
                            soldHere: false,
                            inventory: null,
                        },
                    ],
                },
            ],
        }),
    ]);
    return row;
}

describe("quickStock (#520)", () => {
    it("reads one storefront's shelves under the filter", () => {
        const stock = quickStock(bun(), "hill");
        expect(stock.total).toEqual({
            onHand: 4,
            promised: 6,
            canSell: 0,
            short: 2,
        });
        expect(stockLine(stock.total)).toBe(
            "0 can sell · 4 on hand · 6 promised",
        );
        expect(stock.shelves.map((s) => [s.title, shelfLine(s)])).toEqual([
            ["Single", "0 can sell · 3 on hand, 3 promised"],
            ["Six-pack", "2 short · 1 on hand, 3 promised"],
        ]);
        expect(showShelves(stock)).toBe(true);
    });

    it("adds up every storefront that sells a variant, and knows where", () => {
        const stock = quickStock(bun(), null);
        const single = stock.shelves.find((s) => s.variantId === "single");
        expect(single).toMatchObject({ onHand: 7, canSell: 4 });
        expect(single?.storeIds).toEqual(["hill", "online"]);
        // Online doesn't sell the six-pack.
        const six = stock.shelves.find((s) => s.variantId === "six");
        expect(six?.storeIds).toEqual(["hill"]);
    });

    it("is one shelf for a product counted as a whole", () => {
        const [row] = catalogueRows([catalogueProduct({ id: "loaf" })]);
        const stock = quickStock(row, null);
        expect(stock.shelves).toHaveLength(1);
        expect(stock.shelves[0]).toMatchObject({
            variantId: null,
            onHand: 72,
            warnAt: 5,
        });
        expect(showShelves(stock)).toBe(false);
    });

    it("is untracked when nothing counts stock", () => {
        const [row] = catalogueRows([
            catalogueProduct({
                id: "mug",
                inventory: null,
                listings: [
                    {
                        storeId: "hill",
                        storeName: "Hill Road",
                        inventory: null,
                        variants: [],
                    },
                ],
            }),
        ]);
        expect(quickStock(row, null).tracked).toBe(false);
    });
});

describe("shelfTone", () => {
    it("is danger short or empty, the accent at its level", () => {
        expect(shelfTone({ short: 1, canSell: 3, warnAt: 5 })).toBe("danger");
        expect(shelfTone({ short: 0, canSell: 0, warnAt: 5 })).toBe("danger");
        expect(shelfTone({ short: 0, canSell: 5, warnAt: 5 })).toBe("warn");
        expect(shelfTone({ short: 0, canSell: 6, warnAt: 5 })).toBe("muted");
    });
});

describe("storefrontsLine", () => {
    it("says sold out first, then what each storefront can sell", () => {
        expect(storefrontsLine(bun())).toBe(
            "Sold out at Hill Road · 4 at Online",
        );
    });

    it("says nothing with one storefront", () => {
        const [row] = catalogueRows([
            catalogueProduct({
                id: "one",
                listings: [
                    {
                        storeId: "hill",
                        storeName: "Hill Road",
                        inventory: {
                            quantity: 3,
                            promised: 0,
                            lowStockAlert: 5,
                        },
                        variants: [],
                    },
                ],
            }),
        ]);
        expect(storefrontsLine(row)).toBeNull();
    });
});

describe("walking the list", () => {
    it("stays at the last with J and at the first with K", () => {
        expect(step(11, 1, 12)).toBe(11);
        expect(step(0, -1, 12)).toBe(0);
        expect(step(2, 1, 12)).toBe(3);
        expect(position(2, 12)).toBe("3 of 12");
        expect(position(-1, 12)).toBe("");
    });
});

describe("readAdd", () => {
    it("takes whole units over 0 only", () => {
        expect(readAdd("5")).toBe(5);
        expect(readAdd(" 12 ")).toBe(12);
        expect(readAdd("0")).toBeNull();
        expect(readAdd("1.5")).toBeNull();
        expect(readAdd("")).toBeNull();
    });
});
