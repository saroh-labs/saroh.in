import { describe, expect, it } from "vitest";

import { gstCalc, working } from "./logic";

// The boards' sample: ₹1,000 at 18%, in the seller's state.
const BASE = { paise: 100000, rate: "18", included: false, inter: false };

describe("gstCalc", () => {
    it("adds GST to the boards' price, split CGST and SGST", () => {
        const r = gstCalc(BASE);
        expect(r.figure).toBe("₹1,180");
        expect(r.rows).toEqual([
            { k: "Price before GST", v: "₹1,000.00" },
            { k: "CGST 9%", v: "₹90.00" },
            { k: "SGST 9%", v: "₹90.00" },
            { k: "GST in total", v: "₹180.00", total: true },
        ]);
    });

    it("works back from a price with GST included", () => {
        const r = gstCalc({ ...BASE, paise: 118000, included: true });
        expect(r.figureLabel).toBe("Price before GST");
        expect(r.figure).toBe("₹1,000");
        expect(r.rows[0]).toEqual({ k: "Price with GST", v: "₹1,180.00" });
    });

    it("charges IGST in one line in another state", () => {
        expect(gstCalc({ ...BASE, inter: true }).rows.slice(1)).toEqual([
            { k: "IGST 18%", v: "₹180.00" },
            { k: "GST in total", v: "₹180.00", total: true },
        ]);
    });

    it("works the other rates: 12% and 0.25%", () => {
        expect(gstCalc({ ...BASE, rate: "12" }).figure).toBe("₹1,120");
        expect(gstCalc({ ...BASE, rate: "0.25" }).rows[1]).toEqual({
            k: "CGST 0.125%",
            v: "₹1.25",
        });
    });

    it("says 0% is nil-rated or exempt", () => {
        const r = gstCalc({ ...BASE, rate: "0" });
        expect(r.figure).toBe("₹1,000");
        expect(r.rows).toEqual([
            { k: "Price before GST", v: "₹1,000.00" },
            { k: "GST at 0%", v: "₹0.00" },
        ]);
        expect(r.note).toMatch(/nil-rated or exempt/);
    });

    it("never loses a paisa working back", () => {
        const r = gstCalc({ ...BASE, paise: 99999, included: true });
        // ₹999.99 with 18% in: ₹847.45 + ₹152.54.
        expect(r.figure).toBe("₹847.45");
        expect(r.rows.at(-1)?.v).toBe("₹152.54");
    });

    it("copies the working as lines", () => {
        expect(working(gstCalc(BASE))).toBe(
            "Price with GST: ₹1,180\nPrice before GST: ₹1,000.00\nCGST 9%: ₹90.00\nSGST 9%: ₹90.00\nGST in total: ₹180.00",
        );
    });
});
