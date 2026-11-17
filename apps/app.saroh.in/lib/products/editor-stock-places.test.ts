import { describe, expect, it } from "vitest";

import { allLocations, elsewhereShelves } from "./editor-stock";

describe("allLocations (HPEditDesk)", () => {
    it("adds every shelf up to the product page's figures", () => {
        // Northwind's gloves: 360 at the store (150 promised), 80 online.
        expect(
            allLocations([
                { quantity: "360", promised: 150 },
                { quantity: "80", promised: 0 },
            ]),
        ).toEqual({ onHand: 440, promised: 150, toSell: 290 });
    });

    it("counts what each shelf can sell on its own, never below 0", () => {
        expect(
            allLocations([
                { quantity: "10", promised: 15 },
                { quantity: "5", promised: 0 },
            ]),
        ).toEqual({ onHand: 15, promised: 15, toSell: 5 });
    });

    it("adds nothing for a count that isn't a whole number yet", () => {
        expect(
            allLocations([
                { quantity: "", promised: 0 },
                { quantity: "4.5", promised: 0 },
                { quantity: "7", promised: 2 },
            ]),
        ).toEqual({ onHand: 7, promised: 2, toSell: 5 });
    });
});

describe("elsewhereShelves", () => {
    const shelf = (storeId: string, onHand: number, soldHere = true) => ({
        storeId,
        name: storeId === "nw" ? "Northwind Supply Store" : "Online",
        soldHere,
        onHand,
        promised: storeId === "nw" ? 150 : 0,
        canSell: onHand,
        short: 0,
        warnAt: 10,
        stockLevelId: null,
        word: { text: "", tone: "ok" as const },
    });
    const size = (shelves: ReturnType<typeof shelf>[]) => ({
        variantId: null,
        onHand: 0,
        promised: 0,
        canSell: 0,
        short: 0,
        warnAt: 10,
        shelves,
        word: { text: "", tone: "ok" as const },
    });

    it("gives the other locations' shelves, counted as typed", () => {
        expect(
            elsewhereShelves(
                {
                    mode: "product",
                    sizes: [size([shelf("nw", 360), shelf("online", 80)])],
                },
                "nw",
            ),
        ).toEqual([
            {
                storeId: "online",
                name: "Online",
                quantity: "80",
                lowStockAlert: "10",
                promised: 0,
            },
        ]);
    });

    it("leaves out a place that neither sells it nor holds any", () => {
        expect(
            elsewhereShelves(
                {
                    mode: "product",
                    sizes: [
                        size([shelf("nw", 360), shelf("online", 0, false)]),
                    ],
                },
                "nw",
            ),
        ).toEqual([]);
    });

    it("gives none when each variant counts on its own, or nothing was read", () => {
        expect(
            elsewhereShelves(
                { mode: "variant", sizes: [size([shelf("online", 5)])] },
                "nw",
            ),
        ).toEqual([]);
        expect(elsewhereShelves(null, "nw")).toEqual([]);
    });
});
