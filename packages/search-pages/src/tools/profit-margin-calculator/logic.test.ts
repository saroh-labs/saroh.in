import { describe, expect, it } from "vitest";

import type { MarginInput } from "./logic";
import { margin, marginNote, resultRows } from "./logic";

// The boards' sample: Northwind Bakes, an item that costs ₹600, sold at
// ₹1,180 with GST at 18%, wanting a 50% margin.
const ITEM: MarginInput = {
    cost: 60000,
    price: 118000,
    mode: "with",
    rate: "18",
    target: 50,
};

describe("margin", () => {
    it("works out the boards' sample to the paisa", () => {
        const m = margin(ITEM);
        expect(m.before).toBe(100000);
        expect(m.gst).toBe(18000);
        expect(m.profit).toBe(40000);
        expect(m.margin).toBe(40);
        expect(resultRows(ITEM, m)).toEqual([
            { k: "Price before GST", v: "₹1,000.00", total: false },
            { k: "GST 18%", v: "₹180.00", total: false },
            { k: "Profit per sale", v: "₹400.00", total: false },
            { k: "Markup on cost", v: "66.7%", total: true },
        ]);
        expect(marginNote(ITEM, m)).toBe(
            "For a 50% margin, sell at ₹1,200.00 before GST, ₹1,416.00 with GST.",
        );
    });

    it("priced before GST, adds GST rather than taking it out", () => {
        const i = { ...ITEM, price: 100000, mode: "before" as const };
        expect(resultRows(i, margin(i)).map((r) => [r.k, r.v])).toEqual([
            ["Profit per sale", "₹400.00"],
            ["Markup on cost", "66.7%"],
            ["Price with GST 18%", "₹1,180.00"],
        ]);
    });

    it("says a loss plainly, with the price that breaks even", () => {
        const i = { ...ITEM, price: 59000, mode: "before" as const };
        const m = margin(i);
        expect(resultRows(i, m).slice(0, 2)).toEqual([
            { k: "Loss per sale", v: "−₹10.00", total: false },
            { k: "Markup on cost", v: "−1.7%", total: false },
        ]);
        expect(m.margin).toBeCloseTo(-1.69, 2);
        expect(marginNote(i, m)).toBe(
            "You lose ₹10 on each one. To break even, sell at ₹600 before GST, ₹708 with GST.",
        );
    });

    it("keeps paise exact on an odd rate", () => {
        const m = margin({ ...ITEM, price: 99999, rate: "0.25" });
        expect(m.before + m.gst).toBe(99999);
        expect(m.before).toBe(99750);
    });
});
