import { describe, expect, it } from "vitest";

import type { TaxSettings } from "@/lib/organizations/settings-service";

import type { InvoiceFormValues } from "./new-invoice";
import {
    centsOf,
    draftInput,
    dueFrom,
    EMPTY_LINE,
    invoiceFormSchema,
    issueLine,
    nextNumberOf,
    placeOf,
    priceOf,
    supplyLine,
} from "./new-invoice";
import type { PickableProduct } from "./new-invoice-lines";
import {
    halfRate,
    lineOfProduct,
    lineRateWords,
    pickRows,
    previewSums,
    splitInclusive,
} from "./new-invoice-lines";

const values = (over: Partial<InvoiceFormValues> = {}): InvoiceFormValues => ({
    contactId: "c_1",
    due: 14,
    billToGstin: "",
    billToState: "",
    billToAddress: "",
    lines: [
        {
            description: "Sourdough loaf (trade)",
            quantity: 12,
            unitPrice: "400",
            gstRate: "0",
            hsnSac: "19059010",
        },
        {
            description: "Butter croissant (trade)",
            quantity: 20,
            unitPrice: "150",
            gstRate: "18",
            hsnSac: "19059020",
        },
    ],
    ...over,
});

describe("the form's checks", () => {
    it("takes a filled-in invoice", () => {
        expect(invoiceFormSchema.safeParse(values()).success).toBe(true);
    });

    it("says who it's for is missing", () => {
        const res = invoiceFormSchema.safeParse(values({ contactId: "" }));
        expect(res.success).toBe(false);
        expect(res.error?.issues[0]?.message).toBe("Choose who it's for");
    });

    it("says what is wrong with a line, field by field", () => {
        const res = invoiceFormSchema.safeParse(
            values({
                lines: [
                    {
                        description: " ",
                        quantity: 0,
                        unitPrice: "4.555",
                        gstRate: "",
                        hsnSac: "12",
                    },
                ],
            }),
        );
        const said = res.error?.issues.map((i) => i.message) ?? [];
        expect(said).toEqual(
            expect.arrayContaining([
                "Say what it's for",
                "At least 1",
                "A price, with at most two decimals",
                "An HSN or SAC is 4 to 8 digits",
            ]),
        );
    });

    it("refuses a GSTIN that isn't in the register's shape, and none at all is fine", () => {
        expect(
            invoiceFormSchema.safeParse(values({ billToGstin: "29ABC" }))
                .success,
        ).toBe(false);
        expect(
            invoiceFormSchema.safeParse(
                values({ billToGstin: "29abcfb2207k1zl" }),
            ).success,
        ).toBe(true);
    });

    it("a draft keeps a line with no GST rate: the rate is asked for at issue", () => {
        const v = values();
        v.lines[0] = { ...v.lines[0], gstRate: "" };
        expect(invoiceFormSchema.safeParse(v).success).toBe(true);
    });
});

describe("what a save sends", () => {
    const now = new Date(2026, 9, 19, 10, 0, 0);

    it("a new invoice carries its currency; a draft's later saves don't", () => {
        const first = draftInput(values(), {
            registered: true,
            currency: "INR",
            saved: false,
            now,
        });
        expect(first.currency).toBe("INR");
        expect(first.tax).toBe("0");
        const later = draftInput(values(), {
            registered: true,
            currency: "INR",
            saved: true,
            now,
        });
        expect(later).not.toHaveProperty("currency");
        expect(later).not.toHaveProperty("tax");
    });

    it("sends each line's rate and HSN on a registered business, and the buyer's details", () => {
        const input = draftInput(
            values({
                billToGstin: " 29abcfb2207k1zl ",
                billToState: "29",
                billToAddress: " 7 27th Main ",
                lines: [
                    {
                        description: " Platter ",
                        quantity: 2,
                        unitPrice: " 450 ",
                        gstRate: "5",
                        hsnSac: "1905 9090",
                    },
                ],
            }),
            { registered: true, currency: "INR", saved: true, now },
        );
        expect(input.lines).toEqual([
            {
                description: "Platter",
                quantity: 2,
                unitPrice: "450",
                gstRate: "5",
                hsnSac: "19059090",
            },
        ]);
        expect(input.billToGstin).toBe("29ABCFB2207K1ZL");
        expect(input.billToState).toBe("29");
        expect(input.billToAddress).toBe("7 27th Main");
    });

    it("a business that isn't registered sends no GST at all", () => {
        const input = draftInput(values(), {
            registered: false,
            currency: "INR",
            saved: true,
            now,
        });
        expect(input.lines?.[1]).toEqual({
            description: "Butter croissant (trade)",
            quantity: 20,
            unitPrice: "150",
        });
        expect(input).not.toHaveProperty("billToGstin");
    });

    it("due in 14 days is the end of that day; a draft's own date is kept", () => {
        expect(
            draftInput(values(), {
                registered: false,
                currency: "INR",
                saved: true,
                now,
            }).dueAt,
        ).toBe(new Date(2026, 10, 2, 23, 59, 59).toISOString());
        expect(
            draftInput(values({ due: "kept" }), {
                registered: false,
                currency: "INR",
                saved: true,
                draftDueAt: "2026-10-24T18:29:59.000Z",
                now,
            }).dueAt,
        ).toBe("2026-10-24T18:29:59.000Z");
        expect(dueFrom(0, now)).toBe(
            new Date(2026, 9, 19, 23, 59, 59).toISOString(),
        );
    });

    it("in the business's zone, the due day ends at its own midnight, wherever the browser is", () => {
        const morning = new Date("2026-10-19T04:30:00Z"); // 10 am in India
        expect(dueFrom(14, morning, "Asia/Kolkata")).toBe(
            "2026-11-02T18:29:59.000Z",
        );
        // Late evening in India is already tomorrow there.
        const late = new Date("2026-10-19T19:00:00Z");
        expect(dueFrom(0, late, "Asia/Kolkata")).toBe(
            "2026-10-20T18:29:59.000Z",
        );
        expect(dueFrom(7, morning, "Europe/London")).toBe(
            "2026-10-26T23:59:59.000Z",
        );
    });
});

describe("the place of supply", () => {
    it("is the buyer's state, else their GSTIN's, else the business's", () => {
        expect(
            placeOf({ billToGstin: "", billToState: "27" }, "29")?.name,
        ).toBe("Maharashtra");
        expect(
            placeOf({ billToGstin: "33ABCFB2207K1ZL", billToState: "" }, "29")
                ?.name,
        ).toBe("Tamil Nadu");
        expect(placeOf({ billToGstin: "", billToState: "" }, "29")?.name).toBe(
            "Karnataka",
        );
        expect(placeOf({ billToGstin: "", billToState: "" }, null)).toBeNull();
    });

    it("reads as the design's line under who it's billed to", () => {
        expect(
            supplyLine(
                { billToGstin: "29abcfb2207k1zl", billToState: "" },
                "29",
            ),
        ).toBe("GSTIN 29ABCFB2207K1ZL · Karnataka: CGST + SGST");
        expect(supplyLine({ billToGstin: "", billToState: "27" }, "29")).toBe(
            "Maharashtra: IGST",
        );
        expect(supplyLine({ billToGstin: "", billToState: "" }, null)).toBe(
            null,
        );
    });
});

describe("the preview's GST lines", () => {
    it("splits each line as the API does: taxable, then CGST + SGST, the odd paisa to CGST", () => {
        const sums = previewSums(values(), {
            registered: true,
            businessState: "29",
        });
        // ₹4,800 nil-rated; ₹3,000 at 18% → 2,542.37 + 457.63.
        expect(sums.totalCents).toBe(780_000);
        expect(sums.taxableCents).toBe(734_237);
        expect(sums.cgstCents).toBe(22_882);
        expect(sums.sgstCents).toBe(22_881);
        expect(sums.igstCents).toBe(0);
        expect(sums.inter).toBe(false);
        expect(sums.taxed).toBe(true);
        expect(sums.oneRate).toBe("18");
        expect(sums.lines.map((l) => lineRateWords(l.rate))).toEqual([
            "Nil-rated",
            "GST 18%",
        ]);
    });

    it("another state is IGST, all of it", () => {
        const sums = previewSums(values({ billToState: "27" }), {
            registered: true,
            businessState: "29",
        });
        expect(sums.inter).toBe(true);
        expect(sums.igstCents).toBe(45_763);
        expect(sums.cgstCents + sums.sgstCents).toBe(0);
    });

    it("prints no GST rows while no line has a rate (DEC-072)", () => {
        const v = values();
        v.lines = v.lines.map((l) => ({ ...l, gstRate: "" }));
        const sums = previewSums(v, { registered: true, businessState: "29" });
        expect(sums.taxed).toBe(false);
        expect(sums.taxableCents).toBe(sums.totalCents);
    });

    it("leaves out a line still being typed, and a receipt carries no tax", () => {
        const v = values();
        v.lines.push({ ...EMPTY_LINE, description: "Half typed" });
        const sums = previewSums(v, { registered: false, businessState: "29" });
        expect(sums.lines).toHaveLength(2);
        expect(sums.lines.every((l) => l.rate === null)).toBe(true);
        expect(sums.cgstCents + sums.sgstCents + sums.igstCents).toBe(0);
    });

    it("a rate is halved for CGST and SGST", () => {
        expect(halfRate("18")).toBe("9");
        expect(halfRate("5")).toBe("2.5");
        expect(halfRate("0.25")).toBe("0.125");
        expect(splitInclusive(10_000, 0, false)).toEqual({
            taxable: 10_000,
            cgst: 0,
            sgst: 0,
            igst: 0,
        });
    });
});

describe("a product picked as a line", () => {
    const focaccia: PickableProduct = {
        id: "p_1",
        name: "Focaccia (trade)",
        price: "220",
        gstRate: "5",
        gstPriceMode: null,
        hsnCode: "19059090",
        variants: [],
    };

    it("fills the name, price, GST rate and HSN", () => {
        const [row] = pickRows([focaccia]);
        expect(
            lineOfProduct(row, { registered: true, priceMode: "INCLUDED" }),
        ).toEqual({
            description: "Focaccia (trade)",
            quantity: 1,
            unitPrice: "220",
            gstRate: "5",
            hsnSac: "19059090",
        });
    });

    it("a price GST is added to comes in with it added, as an order charges it", () => {
        const [row] = pickRows([{ ...focaccia, gstPriceMode: "ADDED" }]);
        expect(
            lineOfProduct(row, { registered: true, priceMode: "INCLUDED" })
                .unitPrice,
        ).toBe("231");
        const [byBusiness] = pickRows([focaccia]);
        expect(
            lineOfProduct(byBusiness, { registered: true, priceMode: "ADDED" })
                .unitPrice,
        ).toBe("231");
    });

    it("a business that isn't registered takes the price alone", () => {
        const [row] = pickRows([focaccia]);
        expect(
            lineOfProduct(row, { registered: false, priceMode: null }),
        ).toEqual({
            description: "Focaccia (trade)",
            quantity: 1,
            unitPrice: "220",
            gstRate: "",
            hsnSac: "",
        });
    });

    it("lists each variant priced its own way", () => {
        const rows = pickRows([
            {
                ...focaccia,
                name: "Tee",
                price: "500",
                variants: [
                    { id: "v_1", title: "Small", price: null },
                    { id: "v_2", title: "Large", price: "650.50" },
                ],
            },
        ]);
        expect(rows.map((r) => [r.name, r.price])).toEqual([
            ["Tee · Small", "500"],
            ["Tee · Large", "650.50"],
        ]);
    });

    it("keeps paise as a price box holds them", () => {
        expect(priceOf(centsOf("220.5"))).toBe("220.50");
        expect(priceOf(40_000)).toBe("400");
    });
});

describe("the next number", () => {
    const tax = (over: Partial<TaxSettings> = {}): TaxSettings => ({
        registered: true,
        state: "29",
        stateName: "Karnataka",
        invoicePrefix: "RC",
        deliveryRate: "18",
        deliverySac: null,
        invoiceNumber: {
            parts: ["PREFIX", "FY"],
            separator: "/",
            digits: 4,
            restart: "FY",
            custom: false,
            counters: { FY: 144, MONTH: 3, NEVER: 900 },
        },
        ...over,
    });

    it("is the next in the series, said under the paper", () => {
        const next = nextNumberOf(
            tax(),
            "Asia/Kolkata",
            new Date("2026-10-19T10:00:00+05:30"),
        );
        expect(next).toBe("RC/26-27/0145");
        expect(issueLine(next)).toBe(
            "Saved as you type. Issuing gives it the next number, RC/26-27/0145, and locks the lines.",
        );
    });

    it("isn't guessed when the series can't be read", () => {
        expect(nextNumberOf(undefined, null)).toBeNull();
        expect(issueLine(null)).toBe(
            "Saved as you type. Issuing gives it the next number and locks the lines.",
        );
    });
});
