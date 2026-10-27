import { describe, expect, it } from "vitest";

import {
    addDays,
    amountInWords,
    gstinProblem,
    gstTotals,
    lineLabel,
    readDate,
    readLines,
    readPaise,
    readQty,
    showDate,
} from "./logic";

const line = (item: string, qty: string, rate: string, gst = "0", code = "") =>
    ({ item, code, qty, rate, gst }) as const;

describe("reading what's typed", () => {
    it("reads rupees to the paisa, and nothing finer", () => {
        expect(readPaise("1,500")).toBe(150000);
        expect(readPaise("₹ 1500.5")).toBe(150050);
        expect(readPaise("0.07")).toBe(7);
        expect(readPaise("1,000.505")).toBeNull();
        expect(readPaise("-5")).toBeNull();
        expect(readPaise("")).toBeNull();
    });

    it("reads quantities in thousandths", () => {
        expect(readQty("2")).toBe(2000);
        expect(readQty("1.5")).toBe(1500);
        expect(readQty("0")).toBeNull();
        expect(readQty("two")).toBeNull();
    });

    it("drops empty lines and labels the rest as the paper does", () => {
        const ls = readLines([
            line("Butter cookies, 250 g box", "2", "240", "0", "1905"),
            line("", "1", ""),
            line("Haircut", "1", "800", "5", "999721"),
        ]);
        expect(ls.map(lineLabel)).toEqual([
            "Butter cookies, 250 g box × 2 · HSN 1905",
            "Haircut · SAC 999721",
        ]);
        expect(ls[0]?.amount).toBe(48000);
    });
});

describe("gstTotals", () => {
    // GstInvoice board: Gulmohar Unisex Salon, ₹800 + ₹1,500 at 5%.
    const salon = readLines([
        line("Haircut & blow-dry (women)", "1", "800", "5"),
        line("D-Tan facial", "1", "1,500", "5"),
    ]);

    it("splits CGST and SGST in the seller's state", () => {
        const t = gstTotals(salon, false);
        expect(t.rows).toEqual([
            { k: "Taxable value", v: "₹2,300.00" },
            { k: "CGST 2.5%", v: "₹57.50" },
            { k: "SGST 2.5%", v: "₹57.50" },
        ]);
        expect(t.total).toBe(241500);
    });

    it("charges IGST at the full rate in another state", () => {
        const t = gstTotals(salon, true);
        expect(t.rows.slice(1)).toEqual([{ k: "IGST 5%", v: "₹115.00" }]);
        expect(t.total).toBe(241500);
    });

    it("charges nothing without a GSTIN", () => {
        expect(gstTotals(salon, false, false).total).toBe(230000);
    });

    it("gives an odd paisa to CGST, so the parts add up", () => {
        const t = gstTotals(readLines([line("Pen", "1", "0.07", "18")]), false);
        expect(t.rows.slice(1)).toEqual([
            { k: "CGST 9%", v: "₹0.01" },
            { k: "SGST 9%", v: "₹0.00" },
        ]);
        expect(t.tax).toBe(1);
    });
});

describe("amountInWords", () => {
    it("says the boards' totals the Indian way", () => {
        expect(amountInWords(143000)).toBe(
            "Rupees one thousand four hundred and thirty only",
        );
        expect(amountInWords(300000)).toBe("Rupees three thousand only");
        expect(amountInWords(45000)).toBe("Rupees four hundred and fifty only");
        expect(amountInWords(1234567850)).toBe(
            "Rupees one crore twenty-three lakh forty-five thousand six hundred and seventy-eight and fifty paise only",
        );
        expect(amountInWords(100500)).toBe("Rupees one thousand and five only");
    });
});

describe("gstinProblem", () => {
    it("passes the sample and an empty one", () => {
        expect(gstinProblem("29AAAAA0000A1ZY")).toBeNull();
        expect(gstinProblem("29aaaaa0000a1zy")).toBeNull();
        expect(gstinProblem("")).toBeNull();
    });

    it("says what's wrong", () => {
        expect(gstinProblem("29ABCDE1234F1Z")).toBe(
            "A GSTIN has 15 characters. This one has 14.",
        );
        expect(gstinProblem("29AAAAA0000A1Z5")).toBe(
            "The last character doesn't match the rest. Check it for a typo.",
        );
        expect(gstinProblem("99AAAAA0000A1ZY")).toMatch(/99 isn't one/);
        expect(gstinProblem("2AAAAAA0000A1ZY")).toMatch(/shape/);
    });
});

describe("dates", () => {
    it("shows and counts days", () => {
        expect(showDate("2026-10-26")).toBe("26 Oct 2026");
        expect(addDays("2026-10-26", 14)).toBe("2026-11-09");
        expect(showDate("")).toBe("");
    });

    it("reads a date typed the usual ways, and only real ones", () => {
        expect(readDate("26 Oct 2026")).toBe("2026-10-26");
        expect(readDate("9 november 2026")).toBe("2026-11-09");
        expect(readDate("26/10/2026")).toBe("2026-10-26");
        expect(readDate("2026-10-26")).toBe("2026-10-26");
        expect(readDate("31 Feb 2026")).toBeNull();
        expect(readDate("26 Foo 2026")).toBeNull();
        expect(readDate("tomorrow")).toBeNull();
    });
});
