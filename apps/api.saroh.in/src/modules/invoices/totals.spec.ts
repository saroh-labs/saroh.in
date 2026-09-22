import { BadRequestException } from "@nestjs/common";

import { fromCents, priceInvoice, toCents } from "./totals";

describe("invoice totals", () => {
    it("adds lines and tax in minor units", () => {
        // 1 × ₹1,200 + 2 × ₹500 + ₹396 tax = ₹2,596.00
        const t = priceInvoice(
            [
                {
                    description: "Monthly membership",
                    quantity: 1,
                    unitPrice: "1200",
                },
                { description: "Towel hire", quantity: 2, unitPrice: "500.00" },
            ],
            "396",
        );
        expect(t.subtotal).toBe("2200.00");
        expect(t.tax).toBe("396.00");
        expect(t.total).toBe("2596.00");
        expect(t.lines.map((l) => [l.position, l.amount])).toEqual([
            [0, "1200.00"],
            [1, "1000.00"],
        ]);
    });

    it("never sums a float", () => {
        // 0.1 + 0.2 as floats is 0.30000000000000004.
        const t = priceInvoice(
            [
                { description: "a", quantity: 1, unitPrice: "0.1" },
                { description: "b", quantity: 1, unitPrice: "0.2" },
            ],
            "0",
        );
        expect(t.total).toBe("0.30");
    });

    it("refuses an invoice with no lines", () => {
        expect(() => priceInvoice([], "0")).toThrow(BadRequestException);
    });

    it("refuses a total the column cannot hold", () => {
        expect(() =>
            priceInvoice(
                [
                    {
                        description: "x",
                        quantity: 9999,
                        unitPrice: "999999999.99",
                    },
                ],
                "0",
            ),
        ).toThrow(BadRequestException);
    });

    it("converts both ways exactly", () => {
        expect(toCents("12.5")).toBe(1250);
        expect(toCents("7")).toBe(700);
        expect(fromCents(5)).toBe("0.05");
        expect(fromCents(259600)).toBe("2596.00");
    });
});
