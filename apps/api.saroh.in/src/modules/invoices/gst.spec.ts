import {
    allocate,
    isGstRate,
    placeOfSupply,
    rateToBps,
    splitInclusive,
    taxLines,
    taxTypeFor,
} from "./gst";

/**
 * Worked examples first (ADR-008): prices include GST, tax is derived per
 * line from the inclusive amount and rounded to the paisa per line.
 */
describe("GST on one line", () => {
    it("₹118 pastry at 18% within the state → ₹100 + CGST ₹9 + SGST ₹9", () => {
        expect(splitInclusive(11800, 1800, "INTRA")).toEqual({
            taxableCents: 10000,
            cgstCents: 900,
            sgstCents: 900,
            igstCents: 0,
            taxCents: 1800,
        });
    });

    it("the same pastry to another state → IGST ₹18", () => {
        expect(splitInclusive(11800, 1800, "INTER")).toEqual({
            taxableCents: 10000,
            cgstCents: 0,
            sgstCents: 0,
            igstCents: 1800,
            taxCents: 1800,
        });
    });

    it("nil-rated bread carries no tax", () => {
        expect(splitInclusive(6000, 0, "INTRA")).toEqual({
            taxableCents: 6000,
            cgstCents: 0,
            sgstCents: 0,
            igstCents: 0,
            taxCents: 0,
        });
    });

    it("rounds to the paisa and the parts always add back to the line", () => {
        // ₹99.99 at 18%: 99.99 / 1.18 = 84.737… → ₹84.74, tax ₹15.25,
        // split 7.62 + 7.63 (the odd paisa goes to CGST).
        const s = splitInclusive(9999, 1800, "INTRA");
        expect(s.taxableCents).toBe(8474);
        expect(s.taxCents).toBe(1525);
        expect(s.cgstCents + s.sgstCents).toBe(1525);
        expect(Math.abs(s.cgstCents - s.sgstCents)).toBeLessThanOrEqual(1);
        expect(s.taxableCents + s.taxCents).toBe(9999);

        for (const cents of [1, 7, 101, 4999, 12345, 99999]) {
            for (const bps of [25, 300, 500, 1200, 1800, 2800, 4000]) {
                for (const t of ["INTRA", "INTER"] as const) {
                    const x = splitInclusive(cents, bps, t);
                    expect(
                        x.taxableCents +
                            x.cgstCents +
                            x.sgstCents +
                            x.igstCents,
                    ).toBe(cents);
                }
            }
        }
    });

    it("₹5 coffee at 5% keeps the halves within a paisa", () => {
        const s = splitInclusive(500, 500, "INTRA");
        expect(s.taxableCents).toBe(476);
        expect(s.cgstCents).toBe(12);
        expect(s.sgstCents).toBe(12);
    });
});

describe("rates", () => {
    it("reads a rate as basis points", () => {
        expect(rateToBps("18")).toBe(1800);
        expect(rateToBps("0.25")).toBe(25);
        expect(rateToBps("5.00")).toBe(500);
        expect(rateToBps(null)).toBeNull();
    });

    it("knows the rates GST has", () => {
        for (const r of [
            "0",
            "0.25",
            "3",
            "5",
            "12",
            "18",
            "28",
            "40",
            "18.00",
        ])
            expect(isGstRate(r)).toBe(true);
        for (const r of ["7", "-5", "abc", "100"])
            expect(isGstRate(r)).toBe(false);
    });
});

describe("spreading an amount across lines", () => {
    it("spreads in proportion and adds up exactly", () => {
        expect(allocate([10000, 5000, 5000], 1000)).toEqual([500, 250, 250]);
        const odd = allocate([3333, 3333, 3334], 100);
        expect(odd.reduce((a, b) => a + b, 0)).toBe(100);
        expect(allocate([100, 0, 300], 40)).toEqual([10, 0, 30]);
    });

    it("never takes a line below zero", () => {
        expect(allocate([100, 200], 1000)).toEqual([100, 200]);
    });
});

describe("place of supply", () => {
    it("bill-to state first, then delivery, then the business", () => {
        expect(
            placeOfSupply({
                billToState: "30",
                deliveryState: "27",
                businessState: "29",
            }),
        ).toBe("30");
        expect(
            placeOfSupply({
                billToState: null,
                deliveryState: "Maharashtra",
                businessState: "29",
            }),
        ).toBe("27");
        expect(
            placeOfSupply({
                billToState: null,
                deliveryState: null,
                businessState: "29",
            }),
        ).toBe("29");
    });

    it("a state it cannot read falls to the next", () => {
        expect(
            placeOfSupply({
                billToState: "Atlantis",
                deliveryState: null,
                businessState: "29",
            }),
        ).toBe("29");
    });

    it("a Karnataka business billing a Goa café is inter-state", () => {
        const pos = placeOfSupply({
            billToState: "Goa",
            deliveryState: null,
            businessState: "29",
        });
        expect(pos).toBe("30");
        expect(taxTypeFor(pos, "29")).toBe("INTER");
        expect(taxTypeFor("29", "29")).toBe("INTRA");
    });
});

describe("taxing an order's lines", () => {
    const bread = {
        description: "Country sourdough",
        quantity: 2,
        unitCents: 18000,
        rateBps: 0,
        code: "19059010",
    };
    const pastry = {
        description: "Almond croissant",
        quantity: 1,
        unitCents: 11800,
        rateBps: 1800,
        code: "19059020",
    };
    const coffee = {
        description: "Filter coffee",
        quantity: 2,
        unitCents: 12600,
        rateBps: 500,
        code: "21011120",
    };

    it("a mixed order totals exactly, nil-rated at 0%", () => {
        const t = taxLines([bread, pastry, coffee], {
            registered: true,
            taxType: "INTRA",
        });
        expect(t.totals.totalCents).toBe(36000 + 11800 + 25200);
        const [b, p, c] = t.lines;
        expect(b.taxCents).toBe(0);
        expect(b.taxableCents).toBe(36000);
        expect(p.cgstCents).toBe(900);
        expect(c.taxableCents).toBe(24000);
        expect(c.cgstCents + c.sgstCents).toBe(1200);
        expect(t.totals.taxableCents + t.totals.taxCents).toBe(
            t.totals.totalCents,
        );
        expect(t.totals.cgstCents).toBe(900 + 600);
        expect(t.totals.igstCents).toBe(0);
    });

    it("a discounted order with delivery → the invoice total is the order total, tax on the discounted amounts", () => {
        // Items 36000 + 11800 = 47800; ₹47.80 off (10%); delivery ₹59 at 18%.
        const t = taxLines(
            [
                bread,
                pastry,
                {
                    description: "Delivery",
                    quantity: 1,
                    unitCents: 5900,
                    rateBps: 1800,
                    code: "996813",
                    discountable: false,
                },
            ],
            { registered: true, taxType: "INTRA", discountCents: 4780 },
        );
        const orderTotal = 47800 - 4780 + 5900;
        expect(t.totals.totalCents).toBe(orderTotal);
        const [b, p, d] = t.lines;
        expect(b.discountCents).toBe(3600);
        expect(p.discountCents).toBe(1180);
        expect(d.discountCents).toBe(0);
        // 11800 − 1180 = 10620 inclusive at 18% → 9000 + 810 + 810.
        expect(p.amountCents).toBe(10620);
        expect(p.taxableCents).toBe(9000);
        expect(p.cgstCents).toBe(810);
        expect(d.taxableCents).toBe(5000);
        expect(d.cgstCents).toBe(450);
    });

    it("a discount larger than the items runs onto delivery, never below zero", () => {
        const t = taxLines(
            [
                { ...pastry },
                {
                    description: "Delivery",
                    quantity: 1,
                    unitCents: 5900,
                    rateBps: 1800,
                    code: "996813",
                    discountable: false,
                },
            ],
            { registered: true, taxType: "INTRA", discountCents: 12000 },
        );
        expect(t.lines[0].amountCents).toBe(0);
        expect(t.lines[1].amountCents).toBe(5700);
        expect(t.totals.totalCents).toBe(11800 + 5900 - 12000);
    });

    it("an unregistered business writes a receipt with no GST", () => {
        const t = taxLines([pastry, coffee], {
            registered: false,
            taxType: "INTRA",
        });
        expect(t.lines.every((l) => l.taxableCents === null)).toBe(true);
        expect(t.totals.taxCents).toBe(0);
        expect(t.totals.totalCents).toBe(11800 + 25200);
    });

    it("a line with no rate set is taxed at nothing", () => {
        const t = taxLines([{ ...pastry, rateBps: null }], {
            registered: true,
            taxType: "INTRA",
        });
        expect(t.lines[0].taxCents).toBe(0);
        expect(t.lines[0].rateBps).toBeNull();
    });
});
