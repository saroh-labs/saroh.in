import { describe, expect, it } from "vitest";

import {
    addedLineOf,
    lineEachNote,
    lineGstNote,
    lineRate,
    paperPrices,
    pricesSentence,
} from "./paper-title";
import type { InvoiceLine } from "./service";

/**
 * How Invoice Detail's paper reads a line by the way its price carried GST
 * (12 Oct 2026). The API's `invoices/added-line.ts` and
 * `invoice-paper-view.ts` say the same on the PDF; its
 * `added-line.spec.ts` pins the same words.
 */

const money = (a: string) => `₹${a}`;

const ADDED = {
    unitPrice: "99.99",
    amount: "699.94",
    gst: "125.99",
    discount: "0.00",
    unitPay: "117.99",
};

const gstAt = (rate: string | null): InvoiceLine["gst"] => ({
    hsnSac: null,
    rate,
    taxableValue: "1000.00",
    cgst: "0.00",
    sgst: "0.00",
    igst: "0.00",
});

describe("lineGstNote by how the price carried GST", () => {
    const gst = { rate: "18.00", taxableValue: "847.46" };

    it("a line that includes GST says what it always has", () => {
        expect(lineGstNote(true, gst, money)).toBe("GST 18% · taxable ₹847.46");
        expect(lineGstNote(true, gst, money, {})).toBe(
            "GST 18% · taxable ₹847.46",
        );
        expect(lineGstNote(true, gst, money, { added: null })).toBe(
            "GST 18% · taxable ₹847.46",
        );
    });

    it("a line GST was added to says the GST on top", () => {
        expect(lineGstNote(true, gst, money, { added: "180.00" })).toBe(
            "GST 18% added, ₹180.00",
        );
    });

    it("on a paper with both, a line that includes GST says so", () => {
        expect(lineGstNote(true, gst, money, { mixed: true })).toBe(
            "GST 18% included · taxable ₹847.46",
        );
        // Nil-rated and not set say nothing more on any paper.
        expect(
            lineGstNote(true, { ...gst, rate: "0" }, money, { mixed: true }),
        ).toBe("Nil-rated");
        expect(
            lineGstNote(true, { ...gst, rate: null }, money, { mixed: true }),
        ).toBeNull();
    });
});

describe("the rate a line prints", () => {
    const line = { quantity: 7, unitPrice: "117.99" };

    it("the unit price as it stands, unless GST was added to it", () => {
        expect(lineRate(line, null)).toBe("117.99");
        expect(lineRate(line, undefined)).toBe("117.99");
        expect(lineRate(line, ADDED)).toBe("99.99");
    });

    it("each: only for more than one, and what one comes to with GST where the units do not multiply out", () => {
        expect(lineEachNote({ ...line, quantity: 1 }, ADDED, money)).toBeNull();
        expect(lineEachNote(line, null, money)).toBe("₹117.99 each");
        expect(lineEachNote(line, { ...ADDED, unitPay: null }, money)).toBe(
            "₹99.99 each",
        );
        expect(lineEachNote(line, ADDED, money)).toBe(
            "₹99.99 each, ₹117.99 with GST",
        );
    });

    it("only a paper that charges GST has a line it was added to", () => {
        expect(addedLineOf(true, { addedGst: ADDED })).toBe(ADDED);
        expect(addedLineOf(false, { addedGst: ADDED })).toBeNull();
        expect(addedLineOf(true, { addedGst: null })).toBeNull();
        expect(addedLineOf(true, {})).toBeNull();
    });
});

describe("the sentence under the total", () => {
    const included = (rate: string | null) => ({ gst: gstAt(rate) });
    const added = (rate: string) => ({ gst: gstAt(rate), addedGst: ADDED });

    it("every line includes GST, or says nothing: Prices include GST.", () => {
        expect(paperPrices([included("18.00"), included("5.00")])).toBe(
            "INCLUDED",
        );
        expect(paperPrices([included("18.00"), included(null)])).toBe(
            "INCLUDED",
        );
        expect(paperPrices(undefined)).toBe("INCLUDED");
        expect(pricesSentence("INCLUDED")).toBe("Prices include GST.");
    });

    it("GST was added to every line that carries it: GST is added to these prices.", () => {
        expect(paperPrices([added("18.00"), added("5.00")])).toBe("ADDED");
        // A nil-rated line and one with no rate have no say.
        expect(
            paperPrices([added("18.00"), included("0.00"), included(null)]),
        ).toBe("ADDED");
        expect(pricesSentence("ADDED")).toBe("GST is added to these prices.");
    });

    it("both on one paper: no sentence", () => {
        expect(paperPrices([added("18.00"), included("18.00")])).toBe("MIXED");
        expect(pricesSentence("MIXED")).toBeNull();
    });
});
