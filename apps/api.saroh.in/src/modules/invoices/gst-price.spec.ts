import { depositCents } from "../bookings/service-fields";
import { taxLines } from "./gst";
import {
    businessPriceMode,
    effectivePriceMode,
    gstInsidePaid,
    gstOnPrice,
    isGstPriceMode,
    priceCharge,
    unitPayCents,
} from "./gst-price";

/**
 * How a price carries GST (12 Oct 2026): the sums, written out in paise.
 * ₹1,000 is 100000.
 */

/** The parts of a charge a paper prints. */
function sums(c: ReturnType<typeof priceCharge>) {
    return {
        mode: c.mode,
        unitPay: c.unitPayCents,
        unitGst: c.unitGstCents,
        pay: c.payCents,
        taxable: c.taxableCents,
        tax: c.taxCents,
        cgst: c.cgstCents,
        sgst: c.sgstCents,
        igst: c.igstCents,
    };
}

describe("a price that includes GST: ₹1,000 typed, ₹1,000 to pay", () => {
    it.each([
        // rate, taxable, tax, cgst, sgst
        [500, 95238, 4762, 2381, 2381],
        [1200, 89286, 10714, 5357, 5357],
        [1800, 84746, 15254, 7627, 7627],
        // ₹781.25 + ₹218.75: the odd paisa of tax goes to CGST.
        [2800, 78125, 21875, 10938, 10937],
    ])("at %i bps", (rateBps, taxable, tax, cgst, sgst) => {
        expect(
            sums(priceCharge({ listCents: 100000, rateBps, mode: "INCLUDED" })),
        ).toEqual({
            mode: "INCLUDED",
            unitPay: 100000,
            unitGst: tax,
            pay: 100000,
            taxable,
            tax,
            cgst,
            sgst,
            igst: 0,
        });
    });

    it("exempt (0%): ₹1,000 to pay, no tax, and nothing said about GST", () => {
        expect(
            sums(
                priceCharge({
                    listCents: 100000,
                    rateBps: 0,
                    mode: "INCLUDED",
                }),
            ),
        ).toEqual({
            mode: null,
            unitPay: 100000,
            unitGst: 0,
            pay: 100000,
            taxable: 100000,
            tax: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
        });
    });
});

describe("GST added to a price: ₹1,000 typed", () => {
    it.each([
        // rate, GST, to pay
        [500, 5000, 105000],
        [1200, 12000, 112000],
        [1800, 18000, 118000],
        [2800, 28000, 128000],
    ])("at %i bps adds %i and asks for %i", (rateBps, gst, pay) => {
        expect(
            sums(priceCharge({ listCents: 100000, rateBps, mode: "ADDED" })),
        ).toEqual({
            mode: "ADDED",
            unitPay: pay,
            unitGst: gst,
            pay,
            // The taxable value is the typed price, exactly.
            taxable: 100000,
            tax: gst,
            cgst: gst / 2,
            sgst: gst / 2,
            igst: 0,
        });
    });

    it("exempt (0%): nothing is added and nothing is said", () => {
        expect(
            sums(priceCharge({ listCents: 100000, rateBps: 0, mode: "ADDED" })),
        ).toEqual({
            mode: null,
            unitPay: 100000,
            unitGst: 0,
            pay: 100000,
            taxable: 100000,
            tax: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
        });
    });

    it("another state: the whole of it is IGST", () => {
        const c = priceCharge({
            listCents: 100000,
            rateBps: 1800,
            mode: "ADDED",
            taxType: "INTER",
        });
        expect(c.igstCents).toBe(18000);
        expect(c.cgstCents + c.sgstCents).toBe(0);
        expect(c.payCents).toBe(118000);
    });
});

describe("quantities", () => {
    it("3 × ₹1,000 + 18% is ₹3,540: ₹3,000 taxable, ₹540 GST", () => {
        expect(
            sums(
                priceCharge({
                    listCents: 100000,
                    rateBps: 1800,
                    mode: "ADDED",
                    quantity: 3,
                }),
            ),
        ).toEqual({
            mode: "ADDED",
            unitPay: 118000,
            unitGst: 18000,
            pay: 354000,
            taxable: 300000,
            tax: 54000,
            cgst: 27000,
            sgst: 27000,
            igst: 0,
        });
    });

    it("3 × ₹1,000 including 18% is ₹3,000: ₹2,542.37 taxable, ₹457.63 GST", () => {
        expect(
            sums(
                priceCharge({
                    listCents: 100000,
                    rateBps: 1800,
                    mode: "INCLUDED",
                    quantity: 3,
                }),
            ),
        ).toEqual({
            mode: "INCLUDED",
            unitPay: 100000,
            unitGst: 15254,
            pay: 300000,
            taxable: 254237,
            tax: 45763,
            cgst: 22882,
            sgst: 22881,
            igst: 0,
        });
    });

    it.each([
        // typed, rate, qty → unit to pay, line to pay, taxable, tax
        // 1 × the five rates at an awkward price, ₹99.99.
        [9999, 500, 1, 10499, 10499, 9999, 500],
        [9999, 1200, 1, 11199, 11199, 9999, 1200],
        [9999, 1800, 1, 11799, 11799, 9999, 1800],
        [9999, 2800, 1, 12799, 12799, 9999, 2800],
        // 2, 5 and 10 of them at 18%.
        [9999, 1800, 2, 11799, 23598, 19998, 3600],
        [9999, 1800, 5, 11799, 58995, 49996, 8999],
        [9999, 1800, 10, 11799, 117990, 99992, 17998],
        // ₹250 × 4 at each rate: whole rupees never round.
        [25000, 500, 4, 26250, 105000, 100000, 5000],
        [25000, 1200, 4, 28000, 112000, 100000, 12000],
        [25000, 1800, 4, 29500, 118000, 100000, 18000],
        [25000, 2800, 4, 32000, 128000, 100000, 28000],
    ])(
        "added: %i at %i bps × %i",
        (listCents, rateBps, quantity, unitPay, pay, taxable, tax) => {
            const c = priceCharge({
                listCents,
                rateBps,
                mode: "ADDED",
                quantity,
            });
            expect([
                c.unitPayCents,
                c.payCents,
                c.taxableCents,
                c.taxCents,
            ]).toEqual([unitPay, pay, taxable, tax]);
            expect(c.payCents).toBe(quantity * c.unitPayCents);
        },
    );

    it.each([
        // typed, rate, qty → to pay, taxable, tax
        [9999, 500, 3, 29997, 28569, 1428],
        [9999, 1200, 3, 29997, 26783, 3214],
        [9999, 1800, 3, 29997, 25421, 4576],
        [9999, 2800, 3, 29997, 23435, 6562],
        [25000, 1800, 4, 100000, 84746, 15254],
    ])(
        "included: %i at %i bps × %i",
        (listCents, rateBps, quantity, pay, taxable, tax) => {
            const c = priceCharge({
                listCents,
                rateBps,
                mode: "INCLUDED",
                quantity,
            });
            expect([c.payCents, c.taxableCents, c.taxCents]).toEqual([
                pay,
                taxable,
                tax,
            ]);
        },
    );
});

describe("rounding", () => {
    it("rounds the added GST of one unit to the paisa, half up", () => {
        // ₹49.50 at 5% is ₹2.475 → ₹2.48.
        expect(unitPayCents(4950, 500, "ADDED")).toBe(5198);
        // ₹99.99 at 18% is ₹17.9982 → ₹18.00.
        expect(unitPayCents(9999, 1800, "ADDED")).toBe(11799);
        // ₹33.33 at 28% is ₹9.3324 → ₹9.33.
        expect(unitPayCents(3333, 2800, "ADDED")).toBe(4266);
        // ₹10.03 at 0.25% is ₹0.025075 → ₹0.03.
        expect(unitPayCents(1003, 25, "ADDED")).toBe(1006);
        // One paisa at 18% adds nothing.
        expect(unitPayCents(1, 1800, "ADDED")).toBe(1);
    });

    it("a line is the quantity times the unit amount: 7 × ₹117.99 is ₹825.93", () => {
        const c = priceCharge({
            listCents: 9999,
            rateBps: 1800,
            mode: "ADDED",
            quantity: 7,
        });
        expect(c.unitPayCents).toBe(11799);
        expect(c.payCents).toBe(82593);
        // The tax in the line is derived from what is paid, as every
        // paper derives it: 82593 / 1.18 = 69994.07 → ₹699.94, a paisa
        // over 7 × ₹99.99, and the tax is the rest.
        expect(c.taxableCents).toBe(69994);
        expect(c.taxCents).toBe(12599);
        expect(c.cgstCents).toBe(6300);
        expect(c.sgstCents).toBe(6299);
    });

    it("12 × ₹19.99 + 12%: ₹22.39 each, ₹268.68 to pay", () => {
        const c = priceCharge({
            listCents: 1999,
            rateBps: 1200,
            mode: "ADDED",
            quantity: 12,
        });
        expect(c.unitPayCents).toBe(2239);
        expect(c.payCents).toBe(26868);
        expect(c.taxableCents).toBe(23989);
        expect(c.taxCents).toBe(2879);
    });

    it("one unit of an added price always has the typed price as its taxable value", () => {
        for (const bps of [25, 300, 500, 1200, 1800, 2800, 4000]) {
            for (let list = 1; list <= 30_000; list += 7) {
                const c = priceCharge({
                    listCents: list,
                    rateBps: bps,
                    mode: "ADDED",
                });
                expect(c.taxableCents).toBe(list);
                expect(c.taxCents).toBe(Math.round((list * bps) / 10_000));
                expect(c.unitGstCents).toBe(c.taxCents);
                expect(c.payCents).toBe(list + c.taxCents);
            }
        }
    });

    it("the parts always add back to the amount to pay, in both modes", () => {
        for (const mode of ["INCLUDED", "ADDED"] as const) {
            for (const bps of [0, 25, 500, 1200, 1800, 2800]) {
                for (const list of [1, 7, 101, 4999, 9999, 12345, 99999]) {
                    for (const quantity of [1, 2, 3, 7, 12, 99]) {
                        for (const taxType of ["INTRA", "INTER"] as const) {
                            const c = priceCharge({
                                listCents: list,
                                rateBps: bps,
                                mode,
                                quantity,
                                taxType,
                            });
                            expect(
                                c.taxableCents +
                                    c.cgstCents +
                                    c.sgstCents +
                                    c.igstCents,
                            ).toBe(c.payCents);
                            expect(c.payCents).toBe(quantity * c.unitPayCents);
                            expect(
                                Math.abs(c.cgstCents - c.sgstCents),
                            ).toBeLessThanOrEqual(1);
                        }
                    }
                }
            }
        }
    });

    it("a paper built from the amount to pay says exactly what the charge said", () => {
        // What `OrderItem.price` and a booking's snapshot record is the
        // unit amount to pay; the invoice derives its tax from it.
        for (const bps of [500, 1200, 1800, 2800]) {
            for (const quantity of [1, 3, 10]) {
                const c = priceCharge({
                    listCents: 9999,
                    rateBps: bps,
                    mode: "ADDED",
                    quantity,
                });
                const paper = taxLines(
                    [
                        {
                            description: "x",
                            quantity,
                            unitCents: c.unitPayCents,
                            rateBps: bps,
                            code: null,
                        },
                    ],
                    { registered: true, taxType: "INTRA" },
                );
                expect(paper.totals.totalCents).toBe(c.payCents);
                expect(paper.totals.taxCents).toBe(c.taxCents);
                expect(paper.lines[0].taxableCents).toBe(c.taxableCents);
            }
        }
    });
});

describe("when no GST is charged", () => {
    it("a business that is not registered pays the typed price, whatever is stored", () => {
        for (const mode of ["INCLUDED", "ADDED"] as const) {
            const c = priceCharge({
                listCents: 100000,
                rateBps: 1800,
                mode,
                registered: false,
            });
            expect(c.mode).toBeNull();
            expect(c.payCents).toBe(100000);
            expect(c.taxCents).toBe(0);
            expect(c.taxableCents).toBe(100000);
        }
    });

    it("an item with no rate chosen pays the typed price", () => {
        const c = priceCharge({
            listCents: 100000,
            rateBps: null,
            mode: "ADDED",
        });
        expect(c.mode).toBeNull();
        expect(c.payCents).toBe(100000);
        expect(c.taxCents).toBe(0);
    });
});

describe("which mode applies", () => {
    it("reads a stored business mode, and anything else as INCLUDED", () => {
        expect(businessPriceMode("ADDED")).toBe("ADDED");
        expect(businessPriceMode("INCLUDED")).toBe("INCLUDED");
        expect(businessPriceMode(null)).toBe("INCLUDED");
        expect(businessPriceMode(undefined)).toBe("INCLUDED");
        expect(businessPriceMode("added")).toBe("INCLUDED");
    });

    it("an item's own mode wins; null is the business's", () => {
        expect(effectivePriceMode("INCLUDED", null)).toBe("INCLUDED");
        expect(effectivePriceMode("ADDED", null)).toBe("ADDED");
        expect(effectivePriceMode("ADDED", "INCLUDED")).toBe("INCLUDED");
        expect(effectivePriceMode("INCLUDED", "ADDED")).toBe("ADDED");
        expect(effectivePriceMode(undefined, undefined)).toBe("INCLUDED");
        expect(effectivePriceMode("ADDED", "nonsense")).toBe("ADDED");
    });

    it("knows the two modes", () => {
        expect(isGstPriceMode("INCLUDED")).toBe(true);
        expect(isGstPriceMode("ADDED")).toBe(true);
        expect(isGstPriceMode("EXCLUSIVE")).toBe(false);
        expect(isGstPriceMode(null)).toBe(false);
    });
});

describe("what the customer is told", () => {
    it("includes: ₹1,000, includes ₹152.54 GST (18%)", () => {
        expect(
            gstOnPrice({ listCents: 100000, rateBps: 1800, mode: "INCLUDED" }),
        ).toEqual({
            mode: "INCLUDED",
            rate: "18",
            listCents: 100000,
            gstCents: 15254,
            payCents: 100000,
        });
    });

    it("added: ₹1,000 + ₹180 GST (18%), ₹1,180 to pay", () => {
        expect(
            gstOnPrice({ listCents: 100000, rateBps: 1800, mode: "ADDED" }),
        ).toEqual({
            mode: "ADDED",
            rate: "18",
            listCents: 100000,
            gstCents: 18000,
            payCents: 118000,
        });
    });

    it("says nothing for exempt, no rate, or a business not registered", () => {
        expect(
            gstOnPrice({ listCents: 100000, rateBps: 0, mode: "ADDED" }),
        ).toBeNull();
        expect(
            gstOnPrice({ listCents: 100000, rateBps: null, mode: "INCLUDED" }),
        ).toBeNull();
        expect(
            gstOnPrice({
                listCents: 100000,
                rateBps: 1800,
                mode: "ADDED",
                registered: false,
            }),
        ).toBeNull();
    });

    it("writes a quarter-percent rate as it is typed", () => {
        expect(
            gstOnPrice({ listCents: 100000, rateBps: 25, mode: "ADDED" }),
        ).toMatchObject({ rate: "0.25", gstCents: 250, payCents: 100250 });
    });
});

describe("a deposit is a share of the amount to pay", () => {
    it("25% of ₹1,000 + 18% is 25% of ₹1,180: ₹295, of which ₹45 is GST", () => {
        const pay = priceCharge({
            listCents: 100000,
            rateBps: 1800,
            mode: "ADDED",
        }).payCents;
        const deposit = depositCents(pay, "PERCENT_25");
        expect(deposit).toBe(29500);
        expect(
            gstInsidePaid({
                payCents: deposit ?? 0,
                rateBps: 1800,
                mode: "ADDED",
            }),
        ).toEqual({
            mode: "ADDED",
            rate: "18",
            listCents: 25000,
            gstCents: 4500,
            payCents: 29500,
        });
    });

    it("25% of ₹1,000 including 18% is ₹250, of which ₹38.14 is GST", () => {
        const deposit = depositCents(100000, "PERCENT_25");
        expect(deposit).toBe(25000);
        expect(
            gstInsidePaid({
                payCents: 25000,
                rateBps: 1800,
                mode: "INCLUDED",
            }),
        ).toEqual({
            mode: "INCLUDED",
            rate: "18",
            listCents: 25000,
            gstCents: 3814,
            payCents: 25000,
        });
    });

    it("keeps the deposit's own rounding: half of ₹117.99 is ₹59.00", () => {
        // 11799 / 2 = 5899.5 → 5900, half up (`depositCents`).
        expect(depositCents(11799, "PERCENT_50")).toBe(5900);
    });

    it("says nothing about an amount with no GST in it", () => {
        expect(
            gstInsidePaid({ payCents: 29500, rateBps: 0, mode: "ADDED" }),
        ).toBeNull();
        expect(
            gstInsidePaid({ payCents: 29500, rateBps: null, mode: null }),
        ).toBeNull();
        expect(
            gstInsidePaid({
                payCents: 29500,
                rateBps: 1800,
                mode: "ADDED",
                registered: false,
            }),
        ).toBeNull();
    });

    it("an amount from before the choice existed reads as including GST", () => {
        expect(
            gstInsidePaid({ payCents: 118000, rateBps: 1800, mode: null }),
        ).toMatchObject({
            mode: "INCLUDED",
            listCents: 118000,
            gstCents: 18000,
        });
    });
});
