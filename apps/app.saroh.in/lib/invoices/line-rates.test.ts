import { describe, expect, it } from "vitest";

import { linesMissingRate, linesWithRates } from "./line-rates";
import type { InvoiceLine } from "./service";

describe("linesMissingRate", () => {
    const lines = [{ gstRate: "18" }, { gstRate: "" }, { gstRate: "0" }];

    it("is the places of a registered business's lines with no rate", () => {
        expect(linesMissingRate(lines, true)).toEqual([1]);
    });

    it("counts 0% as a rate somebody chose", () => {
        expect(linesMissingRate([{ gstRate: "0" }], true)).toEqual([]);
    });

    it("asks nothing of a business that isn't registered", () => {
        expect(linesMissingRate(lines, false)).toEqual([]);
    });
});

describe("linesWithRates", () => {
    const line = (over: Partial<InvoiceLine>): InvoiceLine => ({
        id: "l",
        description: "Croissants",
        quantity: 2,
        unitPrice: "59.00",
        amount: "118.00",
        ...over,
    });
    const gst = (rate: string | null, hsnSac: string | null = null) => ({
        hsnSac,
        rate,
        taxableValue: null,
        cgst: "0.00",
        sgst: "0.00",
        igst: "0.00",
    });

    it("fills in the chosen rates by place and sends every other line as it was", () => {
        expect(
            linesWithRates(
                [
                    line({ gst: gst("18", "19059020") }),
                    line({ description: "Catering", gst: gst(null) }),
                    line({ description: "Delivery", gst: gst(null, "996813") }),
                ],
                { 1: "5", 2: "0" },
            ),
        ).toEqual([
            {
                description: "Croissants",
                quantity: 2,
                unitPrice: "59.00",
                gstRate: "18",
                hsnSac: "19059020",
            },
            {
                description: "Catering",
                quantity: 2,
                unitPrice: "59.00",
                gstRate: "5",
            },
            {
                description: "Delivery",
                quantity: 2,
                unitPrice: "59.00",
                gstRate: "0",
                hsnSac: "996813",
            },
        ]);
    });

    it("leaves a line with no rate chosen without one", () => {
        expect(linesWithRates([line({ gst: gst(null) })], {})).toEqual([
            { description: "Croissants", quantity: 2, unitPrice: "59.00" },
        ]);
    });
});
