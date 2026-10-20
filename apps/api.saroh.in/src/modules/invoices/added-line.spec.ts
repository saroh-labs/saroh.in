/**
 * How a paper prints a line under each way a business carries GST (the
 * owner's rule, 12 Oct 2026: "If the business says prices include GST,
 * ₹1,000 will be the full amount. If they say exclude, then ₹1,000 + GST").
 *
 * Every paper here is built the way the API builds it (`sellUnit`, then
 * `buildOrderInvoice` and its corrections), stored as issuing stores it,
 * read back through `serializeInvoice` and drawn by `paperView`, with the
 * rupee figures written out. Each proves three things: the rate and the
 * amount a line prints, that the paper adds up (lines to the taxable
 * value, the taxable value and the GST to the total), and that no stored
 * amount moved.
 */
import { execFileSync } from "node:child_process";

import { addedLine, paperPrices, pricesSentence } from "./added-line";
import { bpsToRate, GST_RATES, rateToBps } from "./gst";
import type { GstPriceMode } from "./gst-price";
import { sellUnit, soldColumns, unitPayCents } from "./gst-price";
import type { PaperBusiness, PaperView } from "./invoice-paper-view";
import { paperView } from "./invoice-paper-view";
import { renderInvoicePdf } from "./invoice-pdf";
import { orderLineOnPaper } from "./line-gst-words";
import type {
    BuiltDocument,
    IssuedLine,
    OrderForInvoice,
    Original,
    TaxProfile,
} from "./order-invoice";
import {
    buildCorrection,
    buildCreditNote,
    buildOrderInvoice,
} from "./order-invoice";
import type { InvoiceRow, InvoiceViewModel } from "./serialize";
import { serializeInvoice } from "./serialize";
import { fromCents, toCents } from "./totals";

const NOW = new Date("2026-10-12T06:00:00Z");
const RYE: PaperBusiness = { name: "Rye & Co.", legalName: null, email: null };
const dec = (v: string) => ({ toString: () => v });

const PROFILE: TaxProfile = {
    registered: true,
    gstin: "29AAGCR4375J1ZU",
    state: "29",
    prefix: "RC",
    timezone: "Asia/Kolkata",
    deliveryRateBps: 1800,
    deliverySac: "996813",
    priceMode: "INCLUDED",
    address: "14 Hill Road, Bengaluru 560038, Karnataka",
    seller: {
        sellerName: "Rye & Co.",
        sellerLegalName: null,
        sellerEmail: null,
    },
};

interface Sold {
    name: string;
    /** The price typed, "99.99". */
    typed: string;
    quantity: number;
    mode: GstPriceMode;
    rate?: string;
}

/** An order of lines sold today under each line's mode, as the API sells. */
function orderOf(
    sold: Sold[],
    over: { shipping?: string; discount?: string } = {},
): OrderForInvoice {
    const items = sold.map((s, i) => {
        const unit = sellUnit(
            toCents(s.typed),
            { gstRate: s.rate ?? "18" },
            { registered: true, mode: s.mode },
        );
        const columns = soldColumns(unit);
        return {
            id: `item_${i + 1}`,
            quantity: s.quantity,
            price: dec(fromCents(unit.payCents)),
            gstPriceMode: columns.gstPriceMode,
            listPrice: columns.listPrice,
            product: {
                name: s.name,
                gstRate: dec(s.rate ?? "18"),
                hsnCode: "3304",
            },
            variant: null,
        };
    });
    const shipping = toCents(over.shipping ?? "0");
    const discount = toCents(over.discount ?? "0");
    const goods = items.reduce(
        (sum, i) => sum + i.quantity * toCents(i.price.toString()),
        0,
    );
    return {
        subtotal: dec(fromCents(goods)),
        tax: dec("0"),
        shipping: dec(fromCents(shipping)),
        discount: dec(fromCents(discount)),
        total: dec(fromCents(goods + shipping - discount)),
        fulfilment: shipping > 0 ? "LOCAL_DELIVERY" : "PICKUP",
        deliveryName: null,
        deliveryLine1: null,
        deliveryLine2: null,
        deliveryCity: null,
        deliveryState: null,
        deliveryPostalCode: null,
        customer: {
            firstName: "Meera",
            lastName: "Iyer",
            email: "meera.iyer@example.com",
        },
        items,
    };
}

/** A built document as issuing stores it (`writeLines`), then reads it. */
function rowOf(doc: BuiltDocument, over: Partial<InvoiceRow> = {}): InvoiceRow {
    return {
        id: "inv_1",
        number: "RC/26-27/0042",
        status: "ISSUED",
        contactId: null,
        contact: null,
        billToName: "Meera Iyer",
        billToEmail: "meera.iyer@example.com",
        currency: "INR",
        subtotal: fromCents(doc.subtotalCents),
        tax: fromCents(doc.taxCents),
        total: fromCents(doc.totalCents),
        issuedAt: new Date("2026-10-12T05:00:00Z"),
        dueAt: null,
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        paymentMethod: null,
        paymentReference: null,
        paymentNote: null,
        source: "ORDER",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissues: [],
        createdByUserId: null,
        createdAt: new Date("2026-10-12T05:00:00Z"),
        updatedAt: new Date("2026-10-12T05:00:00Z"),
        kind: "INVOICE",
        sellerGstin: doc.sellerGstin,
        sellerState: doc.sellerState,
        sellerAddress: doc.sellerAddress,
        sellerName: doc.sellerName,
        placeOfSupply: doc.placeOfSupply,
        taxType: doc.taxType,
        cgst: fromCents(doc.cgstCents),
        sgst: fromCents(doc.sgstCents),
        igst: fromCents(doc.igstCents),
        lines: doc.lines.map((l, position) => ({
            id: `line_${position}`,
            position,
            description: l.description,
            quantity: l.quantity,
            unitPrice: fromCents(l.unitCents),
            amount: fromCents(l.amountCents),
            discount: fromCents(l.discountCents),
            hsnSac: l.code,
            gstRate: l.rateBps === null ? null : bpsToRate(l.rateBps),
            taxableValue:
                l.taxableCents === null ? null : fromCents(l.taxableCents),
            cgst: fromCents(l.cgstCents),
            sgst: fromCents(l.sgstCents),
            igst: fromCents(l.igstCents),
            gstPriceMode: !l.rateBps ? null : (l.priceMode ?? null),
            orderItemId: l.orderItemId ?? null,
        })),
        ...over,
    };
}

function read(row: InvoiceRow): InvoiceViewModel & { number: string } {
    const i = serializeInvoice(row, NOW, { detail: true });
    return { ...i, number: i.number ?? "" };
}

const paper = (row: InvoiceRow): PaperView =>
    paperView(read(row), RYE, "Asia/Kolkata");

/** What a correction is against: the issued invoice's standing and lines. */
function originalOf(doc: BuiltDocument): Original {
    const lines: IssuedLine[] = doc.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: dec(fromCents(l.unitCents)),
        amount: dec(fromCents(l.amountCents)),
        gstRate: l.rateBps === null ? null : dec(bpsToRate(l.rateBps)),
        hsnSac: l.code,
        orderItemId: l.orderItemId ?? null,
        gstPriceMode: l.priceMode ?? null,
    }));
    return {
        sellerGstin: doc.sellerGstin,
        sellerState: doc.sellerState,
        sellerAddress: doc.sellerAddress,
        sellerName: doc.sellerName,
        sellerLegalName: doc.sellerLegalName,
        sellerEmail: doc.sellerEmail,
        placeOfSupply: doc.placeOfSupply,
        taxType: doc.taxType,
        tax: dec(fromCents(doc.taxCents)),
        total: dec(fromCents(doc.totalCents)),
        lines,
    };
}

/**
 * The paper's own sums, in paise, from the money it serves: what each line
 * states as its value before GST (its amount where GST was added, its
 * taxable value where it is included), the taxable value, the GST and the
 * total. `adds` is the whole chain: lines, taxable value, GST, total.
 */
function sumsOf(row: InvoiceRow) {
    const i = read(row);
    const lines = (i.lines ?? []).map((l) =>
        toCents(l.addedGst ? l.addedGst.amount : (l.gst?.taxableValue ?? "0")),
    );
    const lineGst = (i.lines ?? []).map(
        (l) =>
            toCents(l.gst?.cgst ?? "0") +
            toCents(l.gst?.sgst ?? "0") +
            toCents(l.gst?.igst ?? "0"),
    );
    const taxable = toCents(i.subtotal);
    const gst =
        toCents(i.gst?.cgst ?? "0") +
        toCents(i.gst?.sgst ?? "0") +
        toCents(i.gst?.igst ?? "0");
    const total = toCents(i.total);
    const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
    return {
        lines,
        taxable,
        gst,
        total,
        adds:
            sum(lines) === taxable &&
            sum(lineGst) === gst &&
            taxable + gst === total,
    };
}

const EXTRACT = `
const { PDFParse } = require(${JSON.stringify(require.resolve("pdf-parse"))});
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const result = await parser.getText();
    await parser.destroy();
    process.stdout.write(result.text);
});
`;

async function pdfText(row: InvoiceRow): Promise<string> {
    const file = await renderInvoicePdf(paper(row));
    return execFileSync(process.execPath, ["-e", EXTRACT], {
        input: file,
    })
        .toString()
        .replace(/\s+/g, " ");
}

describe("the typed price is read back from the frozen unit amount", () => {
    it("exactly, for every GST rate and every price from 1 paisa to ₹250", () => {
        const wrong: string[] = [];
        for (const rate of GST_RATES) {
            const bps = rateToBps(rate) ?? 0;
            if (bps === 0) continue;
            for (let typed = 1; typed <= 25_000; typed += 1) {
                const pay = unitPayCents(typed, bps, "ADDED");
                const back = addedLine({
                    quantity: 1,
                    unitPrice: fromCents(pay),
                    gstRate: rate,
                    taxableValue: "0.00",
                    gstPriceMode: "ADDED",
                });
                if (back?.unitPrice !== fromCents(typed)) {
                    wrong.push(`${rate}% of ${fromCents(typed)}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it("and for large prices: ₹1,000, ₹99,999.99, ₹12,34,567.89", () => {
        for (const typed of [100_000, 9_999_999, 123_456_789]) {
            for (const rate of [
                "0.25",
                "1.5",
                "3",
                "5",
                "12",
                "18",
                "28",
                "40",
            ]) {
                const pay = unitPayCents(typed, rateToBps(rate), "ADDED");
                expect(
                    addedLine({
                        quantity: 1,
                        unitPrice: fromCents(pay),
                        gstRate: rate,
                        taxableValue: "0.00",
                        gstPriceMode: "ADDED",
                    })?.unitPrice,
                ).toBe(fromCents(typed));
            }
        }
    });
});

describe("a line GST was added to, from its frozen sums", () => {
    it("₹1,000 at 18%: ₹1,000 + ₹180 = ₹1,180", () => {
        expect(
            addedLine({
                quantity: 1,
                unitPrice: "1180.00",
                discount: "0.00",
                gstRate: "18.00",
                taxableValue: "1000.00",
                cgst: "90.00",
                sgst: "90.00",
                igst: "0.00",
                gstPriceMode: "ADDED",
            }),
        ).toEqual({
            unitPrice: "1000.00",
            amount: "1000.00",
            gst: "180.00",
            discount: "0.00",
            unitPay: null,
        });
    });

    it("3 × ₹780 at 18%: ₹2,340 + ₹421.20 = ₹2,761.20", () => {
        expect(
            addedLine({
                quantity: 3,
                unitPrice: "920.40",
                gstRate: "18",
                taxableValue: "2340.00",
                cgst: "210.60",
                sgst: "210.60",
                gstPriceMode: "ADDED",
            }),
        ).toEqual({
            unitPrice: "780.00",
            amount: "2340.00",
            gst: "421.20",
            discount: "0.00",
            unitPay: null,
        });
    });

    it("7 × ₹99.99 at 18%: the frozen ₹699.94, not 7 × ₹99.99, and what one comes to with GST", () => {
        expect(
            addedLine({
                quantity: 7,
                unitPrice: "117.99",
                gstRate: "18",
                taxableValue: "699.94",
                cgst: "63.00",
                sgst: "62.99",
                gstPriceMode: "ADDED",
            }),
        ).toEqual({
            unitPrice: "99.99",
            amount: "699.94",
            gst: "125.99",
            discount: "0.00",
            unitPay: "117.99",
        });
    });

    it("a line recorded as includes, with no mode, with no rate, exempt, or on a receipt has none", () => {
        const line = {
            quantity: 1,
            unitPrice: "1000.00",
            gstRate: "18",
            taxableValue: "847.46",
            cgst: "76.27",
            sgst: "76.27",
        };
        expect(addedLine({ ...line, gstPriceMode: "INCLUDED" })).toBeNull();
        expect(addedLine({ ...line, gstPriceMode: null })).toBeNull();
        expect(addedLine(line)).toBeNull();
        expect(
            addedLine({ ...line, gstRate: null, gstPriceMode: "ADDED" }),
        ).toBeNull();
        expect(
            addedLine({ ...line, gstRate: "0", gstPriceMode: "ADDED" }),
        ).toBeNull();
        expect(
            addedLine({ ...line, taxableValue: null, gstPriceMode: "ADDED" }),
        ).toBeNull();
    });
});

describe("the sentence under the total", () => {
    const line = (rate: string | null, added = false) => ({ rate, added });

    it("every line includes GST, or nothing was recorded: Prices include GST.", () => {
        expect(paperPrices([line("18"), line("5")])).toBe("INCLUDED");
        expect(paperPrices([line("18"), line(null), line("0")])).toBe(
            "INCLUDED",
        );
        expect(pricesSentence("INCLUDED")).toBe("Prices include GST.");
    });

    it("GST was added to every line that carries it: the opposite", () => {
        expect(paperPrices([line("18", true), line("5", true)])).toBe("ADDED");
        // A nil-rated line and one with no rate have no say.
        expect(paperPrices([line("18", true), line("0"), line(null)])).toBe(
            "ADDED",
        );
        expect(pricesSentence("ADDED")).toBe("GST is added to these prices.");
    });

    it("both on one paper: no sentence, each line says its own", () => {
        expect(paperPrices([line("18", true), line("18")])).toBe("MIXED");
        expect(pricesSentence("MIXED")).toBeNull();
    });
});

describe("a paper whose prices include GST prints as it always has", () => {
    const sold = (mode: GstPriceMode | null): InvoiceRow => {
        const doc = buildOrderInvoice(
            orderOf([
                {
                    name: "Face serum",
                    typed: "1000.00",
                    quantity: 1,
                    mode: "INCLUDED",
                },
                {
                    name: "Soap",
                    typed: "780.00",
                    quantity: 3,
                    mode: "INCLUDED",
                },
                {
                    name: "Lip balm",
                    typed: "99.99",
                    quantity: 7,
                    mode: "INCLUDED",
                },
            ]),
            PROFILE,
        );
        const row = rowOf(doc);
        return {
            ...row,
            // Before the choice existed a line recorded no mode at all.
            lines: row.lines?.map((l) => ({ ...l, gstPriceMode: mode })),
        };
    };

    it("₹1,000, 3 × ₹780 and 7 × ₹99.99 at 18%: the amounts to pay, the tax inside", () => {
        const view = paper(sold("INCLUDED"));
        expect(view.lines).toEqual([
            {
                description: "Face serum",
                sub: "GST 18% · taxable ₹847.46",
                hsn: "3304",
                quantity: "1",
                amount: "₹1,000",
            },
            {
                description: "Soap",
                sub: "GST 18% · taxable ₹1,983.05 · ₹780 each",
                hsn: "3304",
                quantity: "3",
                amount: "₹2,340",
            },
            {
                description: "Lip balm",
                sub: "GST 18% · taxable ₹593.16 · ₹99.99 each",
                hsn: "3304",
                quantity: "7",
                amount: "₹699.93",
            },
        ]);
        // 847.46 + 1,983.05 + 593.16 = 3,423.67; GST 152.54 + 356.95 +
        // 106.77 = 616.26; 3,423.67 + 616.26 = 4,039.93.
        expect(view.sums).toEqual([
            ["Taxable value", "₹3,423.67"],
            ["CGST", "₹308.14"],
            ["SGST", "₹308.12"],
        ]);
        expect(view.total).toBe("₹4,039.93");
        expect(view.inclusive).toBe("Prices include GST.");
        expect(sumsOf(sold("INCLUDED"))).toEqual({
            lines: [84_746, 198_305, 59_316],
            taxable: 342_367,
            gst: 61_626,
            total: 403_993,
            adds: true,
        });
    });

    it("a line with no mode recorded prints the same paper, to the letter", () => {
        expect(paper(sold(null))).toEqual(paper(sold("INCLUDED")));
        for (const l of read(sold("INCLUDED")).lines ?? []) {
            expect(l.addedGst).toBeNull();
        }
        for (const l of read(sold(null)).lines ?? []) {
            expect(l.addedGst).toBeNull();
        }
    });
});

describe("a paper GST was added to prints the typed price as its rate", () => {
    const doc = buildOrderInvoice(
        orderOf([
            {
                name: "Face serum",
                typed: "1000.00",
                quantity: 1,
                mode: "ADDED",
            },
            { name: "Soap", typed: "780.00", quantity: 3, mode: "ADDED" },
            { name: "Lip balm", typed: "99.99", quantity: 7, mode: "ADDED" },
        ]),
        PROFILE,
    );
    const row = rowOf(doc);

    it("the stored lines are still the amounts to pay: ₹1,180, 3 × ₹920.40, 7 × ₹117.99", () => {
        expect(
            read(row).lines?.map((l) => [l.unitPrice, l.amount, l.discount]),
        ).toEqual([
            ["1180.00", "1180.00", "0.00"],
            ["920.40", "2761.20", "0.00"],
            ["117.99", "825.93", "0.00"],
        ]);
        expect(read(row).total).toBe("4767.13");
    });

    it("₹1,000, 3 × ₹780 and 7 × ₹99.99 at 18%: rate and amount before GST, GST on top", () => {
        const view = paper(row);
        expect(view.lines).toEqual([
            {
                description: "Face serum",
                sub: "GST 18% added, ₹180",
                hsn: "3304",
                quantity: "1",
                amount: "₹1,000",
            },
            {
                description: "Soap",
                sub: "GST 18% added, ₹421.20 · ₹780 each",
                hsn: "3304",
                quantity: "3",
                amount: "₹2,340",
            },
            {
                // 7 × ₹117.99 = ₹825.93; its taxable value is ₹699.94 and
                // its GST ₹125.99, one paisa over 7 × ₹99.99 = ₹699.93.
                description: "Lip balm",
                sub: "GST 18% added, ₹125.99 · ₹99.99 each, ₹117.99 with GST",
                hsn: "3304",
                quantity: "7",
                amount: "₹699.94",
            },
        ]);
        // 1,000 + 2,340 + 699.94 = 4,039.94; GST 180 + 421.20 + 125.99 =
        // 727.19; 4,039.94 + 727.19 = 4,767.13.
        expect(view.sums).toEqual([
            ["Taxable value", "₹4,039.94"],
            ["CGST", "₹363.60"],
            ["SGST", "₹363.59"],
        ]);
        expect(view.total).toBe("₹4,767.13");
        expect(view.inclusive).toBe("GST is added to these prices.");
    });

    it("adds up: lines to the taxable value, the taxable value and GST to the total", () => {
        expect(sumsOf(row)).toEqual({
            lines: [100_000, 234_000, 69_994],
            taxable: 403_994,
            gst: 72_719,
            total: 476_713,
            adds: true,
        });
        // And the total is what the order charged: 1,180 + 2,761.20 + 825.93.
        expect(118_000 + 276_120 + 82_593).toBe(476_713);
    });

    it("the PDF prints the same words", async () => {
        const text = await pdfText(row);
        expect(text).toContain("GST 18% added, ₹180");
        expect(text).toContain("GST 18% added, ₹421.20 · ₹780 each");
        expect(text).toContain("₹99.99 each, ₹117.99 with GST");
        expect(text).toContain("₹699.94");
        expect(text).toContain("₹4,039.94");
        expect(text).toContain("₹4,767.13");
        expect(text).toContain("GST is added to these prices.");
        expect(text).not.toContain("Prices include GST.");
    });

    it("100 × ₹99.99 at 18%: the units are 15 paise short of the frozen taxable value, and the paper says both", () => {
        const many = rowOf(
            buildOrderInvoice(
                orderOf([
                    {
                        name: "Lip balm",
                        typed: "99.99",
                        quantity: 100,
                        mode: "ADDED",
                    },
                ]),
                PROFILE,
            ),
        );
        // 100 × ₹117.99 = ₹11,799.00, of which ₹9,999.15 is the taxable
        // value and ₹1,799.85 the GST; 100 × ₹99.99 is ₹9,999.00.
        expect(paper(many).lines[0]).toMatchObject({
            sub: "GST 18% added, ₹1,799.85 · ₹99.99 each, ₹117.99 with GST",
            quantity: "100",
            amount: "₹9,999.15",
        });
        expect(sumsOf(many)).toEqual({
            lines: [999_915],
            taxable: 999_915,
            gst: 179_985,
            total: 1_179_900,
            adds: true,
        });
    });

    it("a discount is printed before GST, so the line still multiplies out: ₹1,000 less ₹100 is ₹900 + ₹162", () => {
        const discounted = rowOf(
            buildOrderInvoice(
                orderOf(
                    [
                        {
                            name: "Face serum",
                            typed: "1000.00",
                            quantity: 1,
                            mode: "ADDED",
                        },
                    ],
                    { discount: "118.00" },
                ),
                PROFILE,
            ),
        );
        // ₹1,180 less ₹118 is ₹1,062 paid: ₹900 and ₹162 GST.
        expect(read(discounted).lines?.[0]).toMatchObject({
            unitPrice: "1180.00",
            amount: "1062.00",
            discount: "118.00",
            addedGst: {
                unitPrice: "1000.00",
                amount: "900.00",
                gst: "162.00",
                discount: "100.00",
                unitPay: null,
            },
        });
        expect(paper(discounted).lines[0]).toMatchObject({
            sub: "GST 18% added, ₹162 · less ₹100 discount",
            amount: "₹900",
        });
        expect(sumsOf(discounted)).toEqual({
            lines: [90_000],
            taxable: 90_000,
            gst: 16_200,
            total: 106_200,
            adds: true,
        });
    });
});

describe("a paper with both kinds of line", () => {
    it("an added item and a delivery charge (GST inside): each line says its own, no sentence", () => {
        const row = rowOf(
            buildOrderInvoice(
                orderOf(
                    [
                        {
                            name: "Face serum",
                            typed: "1000.00",
                            quantity: 1,
                            mode: "ADDED",
                        },
                    ],
                    { shipping: "60.00" },
                ),
                PROFILE,
            ),
        );
        const view = paper(row);
        expect(view.lines).toEqual([
            {
                description: "Face serum",
                sub: "GST 18% added, ₹180",
                hsn: "3304",
                quantity: "1",
                amount: "₹1,000",
            },
            {
                // ₹60 with GST inside: ₹50.85 and ₹9.15.
                description: "Delivery",
                sub: "GST 18% included · taxable ₹50.85",
                hsn: "9968 13",
                quantity: "1",
                amount: "₹60",
            },
        ]);
        expect(view.sums).toEqual([
            ["Taxable value", "₹1,050.85"],
            ["CGST", "₹94.58"],
            ["SGST", "₹94.57"],
        ]);
        expect(view.total).toBe("₹1,240");
        expect(view.inclusive).toBeNull();
        // 1,000 + 50.85 = 1,050.85; + 180 + 9.15 = 1,240.
        expect(sumsOf(row)).toEqual({
            lines: [100_000, 5_085],
            taxable: 105_085,
            gst: 18_915,
            total: 124_000,
            adds: true,
        });
    });

    it("₹1,000 added and ₹1,000 included at 18%: ₹1,000 + ₹180, and ₹1,000 with ₹152.54 inside", () => {
        const row = rowOf(
            buildOrderInvoice(
                orderOf([
                    {
                        name: "Face serum",
                        typed: "1000.00",
                        quantity: 1,
                        mode: "ADDED",
                    },
                    {
                        name: "Gift box",
                        typed: "1000.00",
                        quantity: 1,
                        mode: "INCLUDED",
                    },
                ]),
                PROFILE,
            ),
        );
        const view = paper(row);
        expect(view.lines.map((l) => [l.sub, l.amount])).toEqual([
            ["GST 18% added, ₹180", "₹1,000"],
            ["GST 18% included · taxable ₹847.46", "₹1,000"],
        ]);
        expect(view.total).toBe("₹2,180");
        expect(view.inclusive).toBeNull();
        expect(sumsOf(row)).toEqual({
            lines: [100_000, 84_746],
            taxable: 184_746,
            gst: 33_254,
            total: 218_000,
            adds: true,
        });
    });
});

describe("a credit note and a supplementary invoice show the rate their original showed", () => {
    const original = buildOrderInvoice(
        orderOf([
            { name: "Lip balm", typed: "99.99", quantity: 7, mode: "ADDED" },
        ]),
        PROFILE,
    );

    it("a credit note for 3 of the 7: ₹99.99 each, ₹299.97 + ₹54 = ₹353.97", () => {
        const note = buildCreditNote(originalOf(original), 35_397, [
            { orderItemId: "item_1", quantity: 3, amountCents: 35_397 },
        ]);
        const row = rowOf(note, { kind: "CREDIT_NOTE" });
        expect(read(row).lines?.[0]).toMatchObject({
            unitPrice: "117.99",
            amount: "353.97",
            addedGst: {
                unitPrice: "99.99",
                amount: "299.97",
                gst: "54.00",
                discount: "0.00",
                unitPay: null,
            },
        });
        const view = paper(row);
        expect(view.lines[0]).toMatchObject({
            sub: "GST 18% added, ₹54 · ₹99.99 each",
            quantity: "3",
            amount: "₹299.97",
        });
        expect(view.totalLabel).toBe("Credited");
        expect(view.total).toBe("₹353.97");
        expect(view.inclusive).toBe("GST is added to these prices.");
        expect(sumsOf(row)).toMatchObject({ adds: true, total: 35_397 });
    });

    it("a credit note for all of it reverses the frozen ₹699.94 + ₹125.99 = ₹825.93", () => {
        const note = buildCreditNote(originalOf(original), 82_593);
        const row = rowOf(note, { kind: "CREDIT_NOTE" });
        expect(paper(row).lines[0]).toMatchObject({
            sub: "GST 18% added, ₹125.99",
            quantity: "1",
            amount: "₹699.94",
        });
        expect(sumsOf(row)).toEqual({
            lines: [69_994],
            taxable: 69_994,
            gst: 12_599,
            total: 82_593,
            adds: true,
        });
        // What the original froze, to the paisa.
        expect(sumsOf(rowOf(original))).toEqual(sumsOf(row));
    });

    it("a supplementary invoice for 2 more: ₹99.99 each, ₹199.98 + ₹36 = ₹235.98", () => {
        const more = buildCorrection(originalOf(original), [
            {
                description: "Lip balm",
                quantity: 2,
                unitCents: 11_799,
                rateBps: 1800,
                code: "3304",
                orderItemId: "item_1",
                priceMode: "ADDED",
            },
        ]);
        const row = rowOf(more, { kind: "SUPPLEMENTARY" });
        const view = paper(row);
        expect(view.lines[0]).toMatchObject({
            sub: "GST 18% added, ₹36 · ₹99.99 each",
            quantity: "2",
            amount: "₹199.98",
        });
        expect(view.total).toBe("₹235.98");
        expect(view.inclusive).toBe("GST is added to these prices.");
        expect(sumsOf(row)).toMatchObject({ adds: true, total: 23_598 });
    });

    it("a credit note against a paper that includes GST prints as it always has", () => {
        const included = buildOrderInvoice(
            orderOf([
                {
                    name: "Lip balm",
                    typed: "99.99",
                    quantity: 7,
                    mode: "INCLUDED",
                },
            ]),
            PROFILE,
        );
        const note = buildCreditNote(originalOf(included), 29_997, [
            { orderItemId: "item_1", quantity: 3, amountCents: 29_997 },
        ]);
        const view = paper(rowOf(note, { kind: "CREDIT_NOTE" }));
        // 3 × ₹99.99 = ₹299.97, of which ₹254.21 is the taxable value.
        expect(view.lines[0]).toMatchObject({
            sub: "GST 18% · taxable ₹254.21 · ₹99.99 each",
            quantity: "3",
            amount: "₹299.97",
        });
        expect(view.inclusive).toBe("Prices include GST.");
    });
});

describe("an order's line on its pay page", () => {
    const lineOf = (s: Sold) => {
        const order = orderOf([s]);
        return orderLineOnPaper(order.items[0]);
    };

    it("includes GST: the amount to pay, as before", () => {
        expect(
            lineOf({
                name: "Soap",
                typed: "780.00",
                quantity: 3,
                mode: "INCLUDED",
            }),
        ).toEqual({
            unitPrice: "780.00",
            amount: "2340.00",
            unitPay: null,
            gst: {
                mode: "INCLUDED",
                rate: "18",
                listCents: 234_000,
                gstCents: 35_695,
                payCents: 234_000,
            },
        });
    });

    it("no mode recorded (sold before the choice, or no GST charged): the amount to pay, nothing said", () => {
        expect(
            orderLineOnPaper({
                quantity: 2,
                price: dec("250.00"),
                gstPriceMode: null,
                product: { gstRate: dec("18") },
            }),
        ).toEqual({
            unitPrice: "250.00",
            amount: "500.00",
            unitPay: null,
            gst: null,
        });
    });

    it("GST added: ₹1,000 + ₹180 = ₹1,180", () => {
        expect(
            lineOf({
                name: "Face serum",
                typed: "1000.00",
                quantity: 1,
                mode: "ADDED",
            }),
        ).toEqual({
            unitPrice: "1000.00",
            amount: "1000.00",
            unitPay: null,
            gst: {
                mode: "ADDED",
                rate: "18",
                listCents: 100_000,
                gstCents: 18_000,
                payCents: 118_000,
            },
        });
    });

    it("GST added: 3 × ₹780 is ₹2,340 + ₹421.20 = ₹2,761.20", () => {
        expect(
            lineOf({
                name: "Soap",
                typed: "780.00",
                quantity: 3,
                mode: "ADDED",
            }),
        ).toEqual({
            unitPrice: "780.00",
            amount: "2340.00",
            unitPay: null,
            gst: {
                mode: "ADDED",
                rate: "18",
                listCents: 234_000,
                gstCents: 42_120,
                payCents: 276_120,
            },
        });
    });

    it("GST added: 7 × ₹99.99 is ₹699.94 + ₹125.99 = ₹825.93, and ₹117.99 each with GST", () => {
        const line = lineOf({
            name: "Lip balm",
            typed: "99.99",
            quantity: 7,
            mode: "ADDED",
        });
        expect(line).toEqual({
            unitPrice: "99.99",
            amount: "699.94",
            unitPay: "117.99",
            gst: {
                mode: "ADDED",
                rate: "18",
                listCents: 69_994,
                gstCents: 12_599,
                payCents: 82_593,
            },
        });
        expect(toCents(line.amount) + (line.gst?.gstCents ?? 0)).toBe(
            7 * 11_799,
        );
    });

    it("a line that kept no typed price reads it back from the unit's amount", () => {
        expect(
            orderLineOnPaper({
                quantity: 7,
                price: dec("117.99"),
                gstPriceMode: "ADDED",
                listPrice: null,
                product: { gstRate: dec("18") },
            }).unitPrice,
        ).toBe("99.99");
    });
});
