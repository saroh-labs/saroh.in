/**
 * DEC-072: GST shows only when it applies. A line's GST note on the paper
 * and the PDF — no note when the business is not registered or the paper
 * is a bill of supply, no note when a line's rate was never set (a plan
 * renewal's line), "Nil-rated" only for a rate recorded as exactly 0, and
 * "GST 18% · taxable …" above that. The PDF's text is read back out.
 */
import { execFileSync } from "node:child_process";

import type { PaperBusiness } from "./invoice-paper-view";
import { lineGstNote, paperMoney, paperView } from "./invoice-paper-view";
import { renderInvoicePdf } from "./invoice-pdf";
import type { InvoiceRow } from "./serialize";
import { serializeInvoice } from "./serialize";

const GSTIN = "29AAGCR1234M1Z5";
const NOW = new Date("2026-09-20T06:00:00Z");
const RYE: PaperBusiness = { name: "Rye & Co.", legalName: null, email: null };
const money = (a: string) => paperMoney(a, "INR");

type Line = NonNullable<InvoiceRow["lines"]>[number];

function line(over: Partial<Line> = {}): Line {
    return {
        id: `line_${Math.random().toString(36).slice(2)}`,
        position: 0,
        description: "Bread club · Sep 2026",
        quantity: 1,
        unitPrice: "1200.00",
        amount: "1200.00",
        discount: "0.00",
        hsnSac: null,
        gstRate: null,
        taxableValue: "1200.00",
        cgst: "0.00",
        sgst: "0.00",
        igst: "0.00",
        orderItemId: null,
        ...over,
    };
}

/** A registered bakery's paper, as issuing freezes it. */
function registered(lines: Line[], over: Partial<InvoiceRow> = {}): InvoiceRow {
    return {
        id: "inv_1",
        number: "RYE/26-27/0031",
        status: "ISSUED",
        contactId: "c_1",
        contact: {
            id: "c_1",
            firstName: "Asha",
            lastName: "Rao",
            email: "asha@example.com",
        },
        billToName: "Asha Rao",
        billToEmail: "asha@example.com",
        currency: "INR",
        subtotal: "1200.00",
        tax: "0.00",
        total: "1200.00",
        issuedAt: new Date("2026-09-05T05:00:00Z"),
        dueAt: new Date("2026-09-19T05:00:00Z"),
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        paymentMethod: null,
        paymentReference: null,
        paymentNote: null,
        source: "SUBSCRIPTION",
        subscriptionId: "sub_1",
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissues: [],
        createdByUserId: null,
        createdAt: new Date("2026-09-05T05:00:00Z"),
        updatedAt: new Date("2026-09-05T05:00:00Z"),
        kind: "INVOICE",
        sellerGstin: GSTIN,
        sellerState: "29",
        placeOfSupply: "29",
        taxType: "INTRA",
        cgst: "0.00",
        sgst: "0.00",
        igst: "0.00",
        lines,
        ...over,
    };
}

function view(r: InvoiceRow) {
    const i = serializeInvoice(r, NOW, { detail: true });
    return paperView({ ...i, number: i.number! }, RYE, "Asia/Kolkata");
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

async function pdfText(r: InvoiceRow): Promise<string> {
    const file = await renderInvoicePdf(view(r));
    return execFileSync(process.execPath, ["-e", EXTRACT], {
        input: file,
    }).toString();
}

describe("lineGstNote (DEC-072)", () => {
    const at = (
        rate: string | null,
        taxableValue: string | null = "2400.00",
    ) => ({ rate, taxableValue });

    it("a registered paper: a rate above 0 names it and the taxable value", () => {
        expect(lineGstNote(true, at("18.00"), money)).toBe(
            "GST 18% · taxable ₹2,400",
        );
        expect(lineGstNote(true, at("0.25"), money)).toBe(
            "GST 0.25% · taxable ₹2,400",
        );
    });

    it("a registered paper: a rate recorded as 0 is nil-rated", () => {
        expect(lineGstNote(true, at("0"), money)).toBe("Nil-rated");
        expect(lineGstNote(true, at("0.00"), money)).toBe("Nil-rated");
    });

    it("a registered paper: a rate never set says nothing — not nil-rated, not 0%", () => {
        expect(lineGstNote(true, at(null), money)).toBeNull();
        expect(lineGstNote(true, at(""), money)).toBeNull();
        expect(lineGstNote(true, null, money)).toBeNull();
    });

    it("no tax charged on the paper (unregistered, bill of supply): nothing, whatever the rate", () => {
        for (const rate of [null, "0", "18.00"]) {
            expect(lineGstNote(false, at(rate), money)).toBeNull();
        }
        expect(lineGstNote(false, null, money)).toBeNull();
    });
});

describe("a plan renewal's paper (registered, rate never set)", () => {
    it("prints no rate and no Nil-rated on its line, and stays a tax invoice", () => {
        const v = view(registered([line()]));
        expect(v.title).toBe("Tax invoice");
        expect(v.lines[0]!.sub).toBeNull();
    });

    it("beside an 18% line and a 0% line, only those two carry a note", () => {
        const v = view(
            registered([
                line(),
                line({
                    description: "Celebration cake",
                    amount: "2832.00",
                    unitPrice: "2832.00",
                    gstRate: "18.00",
                    taxableValue: "2400.00",
                    cgst: "216.00",
                    sgst: "216.00",
                }),
                line({ description: "Sourdough loaf", gstRate: "0" }),
            ]),
        );
        expect(v.lines.map((l) => l.sub)).toEqual([
            null,
            "GST 18% · taxable ₹2,400",
            "Nil-rated",
        ]);
    });

    it("its PDF has no Nil-rated and no rate", async () => {
        const text = await pdfText(registered([line()]));
        expect(text).toContain("Bread club · Sep 2026");
        expect(text).toContain("TAX INVOICE");
        expect(text).not.toContain("Nil-rated");
        expect(text).not.toMatch(/GST \d/);
        expect(text).not.toContain("0%");
    });
});

describe("an unregistered business's paper", () => {
    it("says nothing about GST on a line, even one holding a rate", () => {
        const v = view(
            registered([line({ gstRate: "18.00" }), line({ gstRate: "0" })], {
                sellerGstin: null,
                sellerState: null,
                placeOfSupply: null,
                taxType: null,
            }),
        );
        expect(v.title).toBe("Invoice");
        expect(v.hsnColumn).toBe(false);
        expect(v.placeOfSupply).toBeNull();
        expect(v.sums).toEqual([]);
        expect(v.lines.map((l) => l.sub)).toEqual([null, null]);
    });
});
