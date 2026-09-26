import { describe, expect, it } from "vitest";

import type { ProductStock } from "../stock/product-stock";
import type { ProductDetail } from "./service";
import type { SheetValues } from "./stock-sheet";
import {
    canSellNote,
    movable,
    planIsEmpty,
    planSave,
    sheetProblem,
    sheetValues,
} from "./stock-sheet";

const base: SheetValues = {
    price: "480",
    mrp: "",
    sizes: [
        {
            variantId: "v800",
            title: "800g",
            sku: "SD-800",
            price: "",
            warn: "6",
            removed: false,
            shelves: [
                {
                    storeId: "hill",
                    name: "Hill Road",
                    promised: 4,
                    was: 14,
                    onHand: "14",
                },
                {
                    storeId: "online",
                    name: "Online",
                    promised: 0,
                    was: 6,
                    onHand: "6",
                },
            ],
        },
        {
            variantId: "v400",
            title: "400g",
            sku: "SD-400",
            price: "260",
            warn: "4",
            removed: false,
            shelves: [
                {
                    storeId: "online",
                    name: "Online",
                    promised: 1,
                    was: 10,
                    onHand: "10",
                },
            ],
        },
    ],
};

const copy = (v: SheetValues): SheetValues => structuredClone(v);
const owner = { canWrite: true, canStock: true };
const stockOnly = { canWrite: false, canStock: true };

describe("planSave", () => {
    it("counts only the shelves that changed, with what the counter was shown", () => {
        const now = copy(base);
        now.sizes[0].shelves[1].onHand = "4";
        const plan = planSave(base, now, owner, true);
        expect(plan.count).toEqual([
            { storeId: "online", variantId: "v800", expected: 6, counted: 4 },
        ]);
        expect(plan.setAt).toEqual([]);
        expect(plan.product).toBeNull();
    });

    it("a count may go below what is promised", () => {
        const now = copy(base);
        now.sizes[0].shelves[0].onHand = "1";
        expect(sheetProblem(now)).toBeNull();
        expect(planSave(base, now, owner, true).count[0]).toMatchObject({
            counted: 1,
            expected: 14,
        });
    });

    it("a stock-only role saves on hand, but never a price", () => {
        const now = copy(base);
        now.price = "999";
        now.sizes[1].price = "300";
        now.sizes[1].shelves[0].onHand = "12";
        const plan = planSave(base, now, stockOnly, true);
        expect(plan.product).toBeNull();
        expect(plan.variants).toEqual([]);
        expect(plan.count).toHaveLength(1);
    });

    it("sets every storefront when a warning level changes", () => {
        const now = copy(base);
        now.sizes[0].warn = "8";
        const plan = planSave(base, now, owner, true);
        expect(plan.count).toEqual([]);
        expect(plan.setAt.map((s) => s.storeId)).toEqual(["hill", "online"]);
        expect(plan.setAt[0].rows).toEqual([
            { variantId: "v800", quantity: 14, lowStockAlert: 8 },
            { variantId: "v400", quantity: 0, lowStockAlert: 4 },
        ]);
    });

    it("sets rather than counts when nothing is counted yet", () => {
        const plan = planSave(base, copy(base), owner, false);
        expect(plan.setAt).toHaveLength(2);
    });

    it("prices, names and removed sizes, for someone who may change products", () => {
        const now = copy(base);
        now.price = "500";
        now.sizes[1].price = "";
        now.sizes[0].removed = true;
        const plan = planSave(base, now, owner, true);
        expect(plan.product).toEqual({ price: "500", mrp: null });
        expect(plan.variants).toEqual([
            { variantId: "v400", title: "400g", price: null },
        ]);
        expect(plan.remove).toEqual(["v800"]);
    });

    it("an untouched sheet writes nothing", () => {
        expect(planIsEmpty(planSave(base, copy(base), owner, true))).toBe(true);
    });
});

describe("sheetProblem", () => {
    it("wants whole numbers and money", () => {
        const now = copy(base);
        now.sizes[0].shelves[0].onHand = "1.5";
        expect(sheetProblem(now)).toMatch(/^800g: check the price and stock/);
        const mrp = copy(base);
        mrp.mrp = "100";
        expect(sheetProblem(mrp)).toBe(
            "MRP can't be lower than the price it sells for.",
        );
        const none = copy(base);
        none.sizes.forEach((s) => (s.removed = true));
        expect(sheetProblem(none)).toMatch(/^Keep at least one size/);
    });
});

describe("the sheet's notes", () => {
    it("can sell is on hand less promised, shelf by shelf", () => {
        expect(canSellNote(base.sizes[0])).toBe("16");
        expect(movable({ onHand: 14, promised: 4 })).toBe(10);
        expect(movable({ onHand: 1, promised: 3 })).toBe(0);
    });
});

describe("sheetValues", () => {
    const product = {
        price: "480.00",
        mrp: null,
        name: "Sourdough",
        stockMode: "variant",
        inventory: null,
        variants: [
            { id: "v800", title: "800g", sku: "SD-800", price: null },
            { id: "v400", title: "400g", sku: "SD-400", price: "260.00" },
        ],
    } as unknown as ProductDetail;
    const stock = {
        mode: "variant",
        split: true,
        totals: { onHand: 0, promised: 0, canSell: 0, short: 0 },
        byStore: [],
        sizes: [
            {
                variantId: "v800",
                onHand: 14,
                promised: 4,
                canSell: 10,
                short: 0,
                warnAt: 6,
                word: { text: "In stock", tone: "ok" },
                shelves: [
                    {
                        storeId: "hill",
                        name: "Hill Road",
                        soldHere: true,
                        onHand: 14,
                        promised: 4,
                        canSell: 10,
                        short: 0,
                        warnAt: 6,
                        stockLevelId: "a",
                        word: { text: "In stock", tone: "ok" },
                    },
                ],
            },
        ],
    } as ProductStock;
    it("starts from the shelves, prices trimmed", () => {
        const v = sheetValues(product, stock);
        expect(v.price).toBe("480");
        expect(v.sizes.map((s) => [s.title, s.price, s.warn])).toEqual([
            ["800g", "", "6"],
            ["400g", "260", "6"],
        ]);
        expect(v.sizes[0].shelves[0]).toMatchObject({ was: 14, promised: 4 });
    });
});
