import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Invoice, InvoiceGst, InvoiceLine } from "@/lib/invoices/service";

import { InvoicePaper } from "./invoice-paper";
import { LineRow } from "./invoice-quick-look";

// The first test draws the whole paper.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@/lib/invoices/actions", () => ({
    createPayLink: vi.fn(),
    readInvoice: vi.fn(),
}));

/**
 * Invoice Detail's paper under each way a business carries GST (the owner's
 * rule, 12 Oct 2026: "If the business says prices include GST, ₹1,000 will
 * be the full amount. If they say exclude, then ₹1,000 + GST").
 *
 * The lines are the ones the API serves for ₹1,000, 3 × ₹780 and 7 × ₹99.99
 * at 18% (its `invoices/added-line.spec.ts` builds the same papers and
 * pins these figures). A line GST was added to prints its rate and its
 * amount before GST; a line that includes GST, or records no mode, prints
 * as it always has.
 */

const gstOf = (cgst: string, sgst: string): InvoiceGst => ({
    sellerGstin: "29AAGCR4375J1ZU",
    sellerState: "29",
    placeOfSupply: { code: "29", name: "Karnataka" },
    taxType: "INTRA",
    cgst,
    sgst,
    igst: "0.00",
});

function line(over: Partial<InvoiceLine>): InvoiceLine {
    return {
        id: `l_${over.description ?? ""}`,
        description: "Face serum",
        quantity: 1,
        unitPrice: "0.00",
        amount: "0.00",
        discount: "0.00",
        gst: null,
        addedGst: null,
        orderItemId: null,
        ...over,
    };
}

const rated = (taxableValue: string, cgst: string, sgst: string) => ({
    hsnSac: "3304",
    rate: "18.00",
    taxableValue,
    cgst,
    sgst,
    igst: "0.00",
});

// Sold with GST added: ₹1,180, 3 × ₹920.40 and 7 × ₹117.99 to pay.
const ADDED: InvoiceLine[] = [
    line({
        description: "Face serum",
        unitPrice: "1180.00",
        amount: "1180.00",
        gst: rated("1000.00", "90.00", "90.00"),
        addedGst: {
            unitPrice: "1000.00",
            amount: "1000.00",
            gst: "180.00",
            discount: "0.00",
            unitPay: null,
        },
    }),
    line({
        description: "Soap",
        quantity: 3,
        unitPrice: "920.40",
        amount: "2761.20",
        gst: rated("2340.00", "210.60", "210.60"),
        addedGst: {
            unitPrice: "780.00",
            amount: "2340.00",
            gst: "421.20",
            discount: "0.00",
            unitPay: null,
        },
    }),
    line({
        // 7 × ₹99.99 is ₹699.93; the frozen taxable value is ₹699.94.
        description: "Lip balm",
        quantity: 7,
        unitPrice: "117.99",
        amount: "825.93",
        gst: rated("699.94", "63.00", "62.99"),
        addedGst: {
            unitPrice: "99.99",
            amount: "699.94",
            gst: "125.99",
            discount: "0.00",
            unitPay: "117.99",
        },
    }),
];

// The same typed prices, sold with GST inside them.
const included = (addedGst: null | undefined): InvoiceLine[] => {
    const lines = [
        line({
            description: "Face serum",
            unitPrice: "1000.00",
            amount: "1000.00",
            gst: rated("847.46", "76.27", "76.27"),
        }),
        line({
            description: "Soap",
            quantity: 3,
            unitPrice: "780.00",
            amount: "2340.00",
            gst: rated("1983.05", "178.48", "178.47"),
        }),
        line({
            description: "Lip balm",
            quantity: 7,
            unitPrice: "99.99",
            amount: "699.93",
            gst: rated("593.16", "53.39", "53.38"),
        }),
    ];
    // An older API sends no `addedGst` at all.
    return lines.map((l) => {
        if (addedGst === null) return l;
        const { addedGst: _none, ...rest } = l;
        return rest;
    });
};

function invoice(over: Partial<Invoice>): Invoice {
    return {
        id: "inv_1",
        number: "RC/26-27/0042",
        status: "ISSUED",
        standing: "ISSUED",
        contact: { id: "c_1", name: "Meera Iyer", email: "meera@example.com" },
        billTo: { name: "Meera Iyer", email: "meera@example.com" },
        kind: "INVOICE",
        title: "Tax invoice",
        exempt: false,
        related: null,
        gst: gstOf("0.00", "0.00"),
        sellerAddress: null,
        currency: "INR",
        subtotal: "0.00",
        tax: "0.00",
        total: "0.00",
        issuedAt: "2026-10-12T05:00:00Z",
        dueAt: null,
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        payment: null,
        source: "ORDER",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissuedAsId: null,
        issuedAutomatically: true,
        createdAt: "2026-10-12T05:00:00Z",
        updatedAt: "2026-10-12T05:00:00Z",
        summary: null,
        lines: [],
        ...over,
    };
}

const html = (i: Invoice) =>
    renderToStaticMarkup(
        <InvoicePaper invoice={i} business={null} businessName="Rye & Co." />,
    );

/** What a phone's second line says for each line, in order. */
const phoneLines = (out: string) =>
    Array.from(
        out.matchAll(/<span data-phone-line[^>]*>([^<]*)</g),
        (m) => m[1],
    );

/** What the desk (and print) says under each line's name, in order. */
const deskNotes = (out: string) =>
    Array.from(
        out.matchAll(
            /<span class="hidden sm:block print:block text-\[11\.5px\] text-muted-foreground">([^<]*)</g,
        ),
        (m) => m[1],
    );

/** The Amount column, in order. */
const amounts = (out: string) =>
    Array.from(
        out.matchAll(
            /<span class="text-right font-semibold tabular-nums">([^<]*)</g,
        ),
        (m) => m[1],
    );

/** The rows under the lines: [label, amount], the total last. */
const sums = (out: string) =>
    Array.from(
        out.matchAll(
            /<span class="flex-1">([^<]*)<\/span><span class="tabular-nums">([^<]*)</g,
        ),
        (m) => [m[1], m[2]],
    );

const ADDED_PAPER = invoice({
    gst: gstOf("363.60", "363.59"),
    subtotal: "4039.94",
    tax: "727.19",
    total: "4767.13",
    lines: ADDED,
});

const includedPaper = (addedGst: null | undefined) =>
    invoice({
        gst: gstOf("308.14", "308.12"),
        subtotal: "3423.67",
        tax: "616.26",
        total: "4039.93",
        lines: included(addedGst),
    });

describe("a paper GST was added to", () => {
    it("prints the typed price as the rate and the line before GST as the amount", () => {
        const out = html(ADDED_PAPER);
        expect(deskNotes(out)).toEqual([
            "GST 18% added, ₹180",
            "GST 18% added, ₹421.20 · ₹780 each",
            "GST 18% added, ₹125.99 · ₹99.99 each, ₹117.99 with GST",
        ]);
        expect(amounts(out)).toEqual(["₹1,000", "₹2,340", "₹699.94"]);
        expect(phoneLines(out)).toEqual([
            "HSN 3304 · GST 18% added, ₹180",
            "HSN 3304 · 3 × ₹780 · GST 18% added, ₹421.20",
            "HSN 3304 · 7 × ₹99.99, ₹117.99 each with GST · GST 18% added, ₹125.99",
        ]);
    });

    it("adds up: ₹1,000 + ₹2,340 + ₹699.94 = ₹4,039.94, + ₹727.19 GST = ₹4,767.13", () => {
        const out = html(ADDED_PAPER);
        expect(sums(out)).toEqual([
            ["Taxable value", "₹4,039.94"],
            ["CGST", "₹363.60"],
            ["SGST", "₹363.59"],
            ["Total", "₹4,767.13"],
        ]);
        // The amounts printed are the taxable value, and with the GST
        // printed they are the total: in paise, from the lines served.
        const paise = (a: string) => Math.round(Number(a) * 100);
        const printed = ADDED.map((l) => paise(l.addedGst?.amount ?? "0"));
        expect(printed).toEqual([100_000, 234_000, 69_994]);
        expect(printed.reduce((s, x) => s + x, 0)).toBe(403_994);
        expect(403_994 + 36_360 + 36_359).toBe(476_713);
        // Never the amount to pay in the Amount column.
        expect(amounts(out)).not.toContain("₹1,180");
        expect(amounts(out)).not.toContain("₹825.93");
    });

    it("says GST is added, never that prices include it", () => {
        const out = html(ADDED_PAPER);
        expect(out).toContain("GST is added to these prices.");
        expect(out).not.toContain("Prices include GST.");
    });

    it("a discount is printed before GST: ₹1,000 less ₹100 is ₹900, + ₹162 = ₹1,062", () => {
        const out = html(
            invoice({
                gst: gstOf("81.00", "81.00"),
                subtotal: "900.00",
                tax: "162.00",
                total: "1062.00",
                lines: [
                    line({
                        unitPrice: "1180.00",
                        amount: "1062.00",
                        discount: "118.00",
                        gst: rated("900.00", "81.00", "81.00"),
                        addedGst: {
                            unitPrice: "1000.00",
                            amount: "900.00",
                            gst: "162.00",
                            discount: "100.00",
                            unitPay: null,
                        },
                    }),
                ],
            }),
        );
        expect(deskNotes(out)).toEqual([
            "GST 18% added, ₹162 · less ₹100 discount",
        ]);
        expect(amounts(out)).toEqual(["₹900"]);
        expect(sums(out)).toEqual([
            ["Taxable value", "₹900"],
            ["CGST", "₹81"],
            ["SGST", "₹81"],
            ["Total", "₹1,062"],
        ]);
    });

    it("a credit note against it shows the rate its original showed", () => {
        const out = html(
            invoice({
                kind: "CREDIT_NOTE",
                title: "Credit note",
                related: { id: "inv_0", number: "RC/26-27/0041" },
                gst: gstOf("27.00", "27.00"),
                subtotal: "299.97",
                tax: "54.00",
                total: "353.97",
                lines: [
                    line({
                        description: "Lip balm",
                        quantity: 3,
                        unitPrice: "117.99",
                        amount: "353.97",
                        gst: rated("299.97", "27.00", "27.00"),
                        addedGst: {
                            unitPrice: "99.99",
                            amount: "299.97",
                            gst: "54.00",
                            discount: "0.00",
                            unitPay: null,
                        },
                    }),
                ],
            }),
        );
        expect(deskNotes(out)).toEqual(["GST 18% added, ₹54 · ₹99.99 each"]);
        expect(amounts(out)).toEqual(["₹299.97"]);
        expect(sums(out)).toEqual([
            ["Taxable value", "₹299.97"],
            ["CGST", "₹27"],
            ["SGST", "₹27"],
            ["Credited", "₹353.97"],
        ]);
        expect(out).toContain("GST is added to these prices.");
    });
});

describe("a paper whose prices include GST", () => {
    it("prints the amounts to pay and the tax inside, as it always has", () => {
        const out = html(includedPaper(null));
        expect(deskNotes(out)).toEqual([
            "GST 18% · taxable ₹847.46",
            "GST 18% · taxable ₹1,983.05 · ₹780 each",
            "GST 18% · taxable ₹593.16 · ₹99.99 each",
        ]);
        expect(amounts(out)).toEqual(["₹1,000", "₹2,340", "₹699.93"]);
        expect(phoneLines(out)).toEqual([
            "HSN 3304 · GST 18% · taxable ₹847.46",
            "HSN 3304 · 3 × ₹780 · GST 18% · taxable ₹1,983.05",
            "HSN 3304 · 7 × ₹99.99 · GST 18% · taxable ₹593.16",
        ]);
        expect(sums(out)).toEqual([
            ["Taxable value", "₹3,423.67"],
            ["CGST", "₹308.14"],
            ["SGST", "₹308.12"],
            ["Total", "₹4,039.93"],
        ]);
        expect(out).toContain("Prices include GST.");
        expect(out).not.toContain("GST is added");
    });

    it("is the same markup whether the API says no line was added to or says nothing (an older API)", () => {
        expect(html(includedPaper(undefined))).toBe(html(includedPaper(null)));
    });
});

describe("a paper with both kinds of line", () => {
    const mixed = invoice({
        gst: gstOf("94.58", "94.57"),
        subtotal: "1050.85",
        tax: "189.15",
        total: "1240.00",
        lines: [
            ADDED[0],
            line({
                // A delivery charge is charged as typed, GST inside.
                description: "Delivery",
                unitPrice: "60.00",
                amount: "60.00",
                gst: { ...rated("50.85", "4.58", "4.57"), hsnSac: "996813" },
            }),
        ],
    });

    it("each line says its own, and no sentence speaks for both", () => {
        const out = html(mixed);
        expect(deskNotes(out)).toEqual([
            "GST 18% added, ₹180",
            "GST 18% included · taxable ₹50.85",
        ]);
        expect(amounts(out)).toEqual(["₹1,000", "₹60"]);
        expect(out).not.toContain("Prices include GST.");
        expect(out).not.toContain("GST is added to these prices.");
    });

    it("adds up by what each line states: ₹1,000 + ₹50.85 = ₹1,050.85, + ₹189.15 GST = ₹1,240", () => {
        expect(sums(html(mixed))).toEqual([
            ["Taxable value", "₹1,050.85"],
            ["CGST", "₹94.58"],
            ["SGST", "₹94.57"],
            ["Total", "₹1,240"],
        ]);
        expect(100_000 + 5_085).toBe(105_085);
        expect(105_085 + 9_458 + 9_457).toBe(124_000);
    });
});

describe("the quick look's lines", () => {
    const money = (a: string) => `₹${a}`;
    const row = (l: InvoiceLine, taxed = true) =>
        renderToStaticMarkup(<LineRow line={l} taxed={taxed} money={money} />)
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    it("a line GST was added to reads before GST, as on its paper", () => {
        expect(row(ADDED[0])).toBe("Face serum ₹1000.00");
        expect(row(ADDED[1])).toBe("Soap 3 × ₹780.00 ₹2340.00");
        expect(row(ADDED[2])).toBe("Lip balm 7 × ₹99.99 ₹699.94");
    });

    it("a line that includes GST, or records nothing, reads as before", () => {
        const lines = included(null);
        expect(row(lines[0])).toBe("Face serum ₹1000.00");
        expect(row(lines[1])).toBe("Soap 3 × ₹780.00 ₹2340.00");
        expect(row(lines[2])).toBe("Lip balm 7 × ₹99.99 ₹699.93");
        expect(row(included(undefined)[2])).toBe("Lip balm 7 × ₹99.99 ₹699.93");
    });
});
