import { describe, expect, it } from "vitest";

import type { GstOnPrice } from "./on-price";
import {
    addedSum,
    gstIsAdded,
    gstOnPriceOf,
    paidAtPrice,
    payCentsFor,
    payOf,
    setPriceWords,
} from "./on-price";

/**
 * One figure, one kind (12 Oct 2026): a price the business set says its GST
 * beside it, money expected is the amount to pay, and the numbers are the
 * API's. ₹2,000 at 18%, written out.
 */

const ADDED: GstOnPrice = {
    mode: "ADDED",
    rate: "18",
    listCents: 200_000,
    gstCents: 36_000,
    payCents: 236_000,
};
const INCLUDED: GstOnPrice = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 200_000,
    gstCents: 30_508,
    payCents: 200_000,
};

describe("the amount to pay for a price the business set", () => {
    it("GST is added: ₹2,000 is ₹2,360 to pay, the API's own sum", () => {
        expect(payOf("2000.00", ADDED)).toBe("2360.00");
    });

    it("prices include GST: the price is the amount to pay, to the paisa", () => {
        expect(payOf("2000.00", INCLUDED)).toBe("2000.00");
    });

    it("nothing said about GST (not registered, no rate, an older API): the price", () => {
        expect(payOf("2000.00", null)).toBe("2000.00");
        expect(payOf("2000.00", undefined)).toBe("2000.00");
        expect(payOf("1999.50", null)).toBe("1999.50");
    });

    it("keeps the paise of an amount to pay", () => {
        expect(
            payOf("99.99", {
                ...ADDED,
                listCents: 9_999,
                gstCents: 1_800,
                payCents: 11_799,
            }),
        ).toBe("117.99");
    });

    it("a strange answer is nothing said, never a wrong amount", () => {
        expect(gstOnPriceOf({ mode: "ADDED", rate: 18 })).toBeNull();
        expect(payOf("2000.00", { mode: "ADDED", rate: 18 })).toBe("2000.00");
        expect(gstIsAdded("ADDED")).toBe(false);
    });
});

describe("how a price the business set says its GST", () => {
    it("GST is added: + GST right beside it", () => {
        expect(setPriceWords("₹2,000", ADDED)).toBe("₹2,000 + GST");
        expect(setPriceWords("₹2,000 / month", ADDED)).toBe(
            "₹2,000 / month + GST",
        );
    });

    it("prices include GST, or none is said: the price as it always read", () => {
        expect(setPriceWords("₹2,000", INCLUDED)).toBe("₹2,000");
        expect(setPriceWords("₹2,000", null)).toBe("₹2,000");
        expect(setPriceWords("₹2,000", undefined)).toBe("₹2,000");
    });

    it("the whole sum, where there is room, in the desk dialogs' words", () => {
        expect(addedSum(ADDED, "INR")).toBe(
            "₹2,000 + ₹360 GST (18%) = ₹2,360 to pay",
        );
        expect(addedSum(INCLUDED, "INR")).toBeNull();
        expect(addedSum(null, "INR")).toBeNull();
    });
});

describe("whether an amount paid is what a price comes to", () => {
    it("the price with its GST on top is that price", () => {
        expect(paidAtPrice("2360.00", "2000.00", ADDED)).toBe(true);
    });

    it("the price itself is that price: sold before GST was added to it", () => {
        expect(paidAtPrice("2000.00", "2000.00", ADDED)).toBe(true);
        expect(paidAtPrice("2000.00", "2000.00", INCLUDED)).toBe(true);
        expect(paidAtPrice("2000.00", "2000.00", null)).toBe(true);
    });

    it("another amount is another price", () => {
        expect(paidAtPrice("1500.00", "2000.00", ADDED)).toBe(false);
        expect(paidAtPrice("2360.00", "2000.00", INCLUDED)).toBe(false);
        expect(paidAtPrice("2360.00", "2000.00", null)).toBe(false);
    });

    it("an older price of the same thing is taken at the same rate", () => {
        // ₹1,500 + ₹270.
        expect(payCentsFor(150_000, ADDED)).toBe(177_000);
        expect(paidAtPrice("1770.00", "1500.00", ADDED)).toBe(true);
        expect(payCentsFor(150_000, INCLUDED)).toBe(150_000);
        expect(payCentsFor(150_000, null)).toBe(150_000);
    });

    it("something that isn't an amount matches nothing", () => {
        expect(paidAtPrice(null, "2000.00", ADDED)).toBe(false);
        expect(paidAtPrice("2000.00", "", ADDED)).toBe(false);
    });
});
