import { describe, expect, it } from "vitest";

import { catalogueRows } from "./catalogue";
import { catalogueProduct } from "./catalogue.fixture";
import {
    foldShelves,
    HEALTHY_SHOWN,
    orderShelves,
    position,
    quickStock,
    readAdd,
    sellLine,
    shelfLine,
    shelfTone,
    showShelves,
    statusToast,
    step,
    stockHeadline,
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
        // Someone who counts stock always gets its Add row: Restock lands
        // here, and must be able to add.
        expect(showShelves(stock, true)).toBe(true);
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

describe("the drawer's shelves, needing first (Products audit)", () => {
    const shelf = (
        title: string,
        onHand: number,
        promised = 0,
        warnAt = 2,
    ) => ({
        variantId: title,
        title,
        onHand,
        promised,
        canSell: Math.max(0, onHand - promised),
        short: Math.max(0, promised - onHand),
        warnAt,
        storeIds: ["hill"],
    });

    it("puts short, then out, then low before the rest, in order", () => {
        const ordered = orderShelves([
            shelf("a", 9),
            shelf("low", 1),
            shelf("b", 9),
            shelf("out", 0),
            shelf("short", 1, 3),
        ]);
        expect(ordered.map((s) => s.title)).toEqual([
            "short",
            "out",
            "low",
            "a",
            "b",
        ]);
    });

    it("folds past six healthy shelves, never folding one that needs someone", () => {
        const shades = Array.from({ length: 28 }, (_, i) =>
            shelf(`s${i}`, i === 25 ? 0 : 6),
        );
        const ordered = orderShelves(shades);
        const folded = foldShelves(ordered, false);
        expect(folded.shown[0]?.title).toBe("s25");
        expect(folded.shown).toHaveLength(1 + HEALTHY_SHOWN);
        expect(folded.hidden).toBe(27 - HEALTHY_SHOWN);
        expect(foldShelves(ordered, true).shown).toHaveLength(28);
        // Few enough: nothing folds.
        expect(foldShelves(ordered.slice(0, 7), false).hidden).toBe(0);
    });

    it("says the exception in the headline", () => {
        const total = { canSell: 167, onHand: 167, promised: 0, short: 0 };
        expect(
            stockHeadline(total, {
                productId: "p",
                name: "p",
                kind: "out",
                short: 0,
                canSell: 0,
                where: ["7.44"],
                option: "Shade",
                variants: { worst: 1, of: 28 },
                places: [],
            }),
        ).toBe("167 can sell · 1 of 28 shades out");
        expect(stockHeadline(total, null)).toBe("167 can sell · 167 on hand");
    });
});

describe("the words for selling on and off", () => {
    it("claims the website only when the online shop is live", () => {
        expect(sellLine(true, true)).toBe(
            "Hides it from your website and the counter. Nothing is deleted.",
        );
        expect(sellLine(true, false)).toBe(
            "Takes it off sale at the counter. Nothing is deleted.",
        );
        expect(sellLine(true, null)).toBe(
            "Takes it off sale. Nothing is deleted.",
        );
        expect(sellLine(false, true)).toBe(
            "Shows it on your website and at the counter.",
        );
        expect(sellLine(false, false)).toBe("Puts it on sale at the counter.");
    });

    it("echoes the state in the toast", () => {
        expect(statusToast("ARCHIVED", ["Jar"])).toBe("Archived Jar.");
        expect(statusToast("PUBLISHED", ["Jar"])).toBe("Jar is live.");
        expect(statusToast("PUBLISHED", ["a", "b"])).toBe(
            "2 products are live.",
        );
        expect(statusToast("ARCHIVED", ["a", "b"])).toBe(
            "Archived 2 products.",
        );
    });
});
