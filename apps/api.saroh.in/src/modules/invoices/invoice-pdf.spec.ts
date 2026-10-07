/**
 * D16: the invoice PDF says what the printed paper says — its title, number,
 * GSTIN, place of supply, lines and total — for a tax invoice (CGST + SGST,
 * or IGST), a bill of supply, a credit note and an unregistered business's
 * invoice or receipt; a long invoice runs onto numbered pages. The text is
 * read back out of the PDF, so what is checked is what a reader sees.
 */
import { execFileSync } from "node:child_process";

import type { PaperBusiness } from "./invoice-paper-view";
import { paperDay, paperMoney, paperView } from "./invoice-paper-view";
import { pdfFileName, renderInvoicePdf } from "./invoice-pdf";
import type { InvoiceRow } from "./serialize";
import { serializeInvoice } from "./serialize";

const GSTIN = "29AAGCR1234M1Z5";
const BUYER_GSTIN = "27AAACB2345N1Z3";
const NOW = new Date("2026-09-20T06:00:00Z");
const ZONE = "Asia/Kolkata";

const RYE: PaperBusiness = {
    name: "Rye & Co.",
    legalName: "Rye and Company Bakery LLP",
    email: "hello@rye.example",
};

type Line = NonNullable<InvoiceRow["lines"]>[number];

function line(over: Partial<Line> = {}): Line {
    return {
        id: `line_${Math.random().toString(36).slice(2)}`,
        position: 0,
        description: "Sourdough loaf",
        quantity: 1,
        unitPrice: "2400.00",
        amount: "2400.00",
        discount: "0.00",
        hsnSac: null,
        gstRate: null,
        taxableValue: null,
        cgst: "0.00",
        sgst: "0.00",
        igst: "0.00",
        orderItemId: null,
        ...over,
    };
}

function row(over: Partial<InvoiceRow> = {}): InvoiceRow {
    return {
        id: "inv_1",
        number: "RYE/26-27/0012",
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
        subtotal: "2400.00",
        tax: "0.00",
        total: "2400.00",
        issuedAt: new Date("2026-09-05T05:00:00Z"),
        dueAt: new Date("2026-09-19T05:00:00Z"),
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        paymentMethod: null,
        paymentReference: null,
        paymentNote: null,
        source: "MANUAL",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissues: [],
        createdByUserId: "user_1",
        createdAt: new Date("2026-09-05T05:00:00Z"),
        updatedAt: new Date("2026-09-05T05:00:00Z"),
        kind: "INVOICE",
        lines: [line()],
        ...over,
    };
}

/** A registered bakery's tax invoice: ₹2,832 at 18%, within Karnataka. */
function taxInvoice(over: Partial<InvoiceRow> = {}): InvoiceRow {
    return row({
        sellerGstin: GSTIN,
        sellerState: "29",
        sellerAddress: "22 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
        placeOfSupply: "29",
        taxType: "INTRA",
        subtotal: "2400.00",
        cgst: "216.00",
        sgst: "216.00",
        igst: "0.00",
        tax: "432.00",
        total: "2832.00",
        lines: [
            line({
                description: "Celebration cake",
                quantity: 2,
                unitPrice: "1416.00",
                amount: "2832.00",
                hsnSac: "19059010",
                gstRate: "18.00",
                taxableValue: "2400.00",
                cgst: "216.00",
                sgst: "216.00",
            }),
        ],
        ...over,
    });
}

function view(r: InvoiceRow, business: PaperBusiness = RYE) {
    const i = serializeInvoice(r, NOW, { detail: true });
    return paperView({ ...i, number: i.number! }, business, ZONE);
}

/**
 * pdf-parse (pdf.js) starts its worker with a dynamic `import()`, which
 * Jest's CommonJS runtime refuses, so the text is read in a plain Node.
 */
const EXTRACT = `
const { PDFParse } = require(${JSON.stringify(require.resolve("pdf-parse"))});
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const result = await parser.getText();
    const meta = await parser.getInfo();
    await parser.destroy();
    process.stdout.write(JSON.stringify({ text: result.text, pages: result.total, info: meta.info }));
});
`;

/** The PDF's text, as a reader copying it out would get it. */
async function pdfText(r: InvoiceRow, business: PaperBusiness = RYE) {
    const file = await renderInvoicePdf(view(r, business));
    const out = execFileSync(process.execPath, ["-e", EXTRACT], {
        input: file,
    });
    const { text, pages, info } = JSON.parse(out.toString()) as {
        text: string;
        pages: number;
        info: Record<string, string>;
    };
    return { file, text, pages, info };
}

describe("the PDF file's own details", () => {
    it("names the business as its maker, never Saroh", async () => {
        const { info } = await pdfText(taxInvoice());
        expect(info.Author).toBe(RYE.name);
        expect(info.Creator).toBe(RYE.name);
        expect(info.Producer).toBe(RYE.name);
    });
});

describe("the invoice's paper as words", () => {
    it("formats money and dates as the screen does, with the year", () => {
        expect(paperMoney("2832.00", "INR")).toBe("₹2,832");
        expect(paperMoney("2832.50", "INR")).toBe("₹2,832.50");
        // Late on the 30th in UTC is already October in India.
        expect(paperDay("2026-09-30T20:00:00Z", ZONE)).toBe("1 Oct 2026");
        expect(paperDay("2026-09-05T05:00:00Z", ZONE)).toBe("5 Sep 2026");
    });

    it("a tax invoice splits CGST and SGST and names the place of supply", () => {
        const v = view(taxInvoice());
        expect(v.title).toBe("Tax invoice");
        expect(v.seller).toEqual({
            name: "Rye & Co.",
            lines: [
                "Rye and Company Bakery LLP",
                "22 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
                "hello@rye.example",
            ],
            tax: `GSTIN ${GSTIN} · Karnataka (29)`,
        });
        expect(v.dates).toBe("Issued 5 Sep 2026 · due 19 Sep 2026");
        expect(v.placeOfSupply).toBe("Karnataka (29) — CGST + SGST");
        expect(v.sums).toEqual([
            ["Taxable value", "₹2,400"],
            ["CGST", "₹216"],
            ["SGST", "₹216"],
        ]);
        expect(v.lines).toEqual([
            {
                description: "Celebration cake",
                sub: "GST 18% · taxable ₹2,400 · ₹1,416 each",
                hsn: "1905 90 10",
                quantity: "2",
                amount: "₹2,832",
            },
        ]);
        expect(v.total).toBe("₹2,832");
        expect(v.inclusive).toBe("Prices include GST.");
        expect(v.footer).toBe(
            "Tax invoice under section 31, CGST Act. Reverse charge does not apply.",
        );
    });

    it("an interstate buyer's invoice is IGST, with the buyer's GSTIN", () => {
        const v = view(
            taxInvoice({
                billToGstin: BUYER_GSTIN,
                billToAddress: "4 Marine Drive, Mumbai 400002",
                placeOfSupply: "27",
                taxType: "INTER",
                cgst: "0.00",
                sgst: "0.00",
                igst: "432.00",
            }),
        );
        expect(v.placeOfSupply).toBe("Maharashtra (27) — IGST");
        expect(v.sums).toEqual([
            ["Taxable value", "₹2,400"],
            ["IGST", "₹432"],
        ]);
        expect(v.billedTo).toEqual({
            name: "Asha Rao",
            detail: "4 Marine Drive, Mumbai 400002",
            gstin: BUYER_GSTIN,
        });
    });

    it("a bill of supply keeps the GSTIN and SAC and drops the tax (Kavi Dental)", () => {
        const v = view(
            taxInvoice({
                number: "KD/26-27/0004",
                cgst: "0.00",
                sgst: "0.00",
                tax: "0.00",
                subtotal: "1800.00",
                total: "1800.00",
                lines: [
                    line({
                        description: "Scaling and polishing",
                        unitPrice: "1800.00",
                        amount: "1800.00",
                        hsnSac: "9993",
                        gstRate: "0",
                        taxableValue: "1800.00",
                    }),
                ],
            }),
            { name: "Kavi Dental", legalName: null, email: null },
        );
        expect(v.title).toBe("Bill of supply");
        expect(v.seller.tax).toBe(`GSTIN ${GSTIN} · Karnataka (29)`);
        expect(v.hsnColumn).toBe(true);
        expect(v.lines[0]).toMatchObject({ hsn: "9993", sub: null });
        expect(v.placeOfSupply).toBeNull();
        expect(v.sums).toEqual([]);
        expect(v.inclusive).toBeNull();
        expect(v.footer).toBe(
            "Bill of supply under section 31(3)(c), CGST Act. Supply exempt from GST.",
        );
    });

    it("a credit note says what it is against, and reads Credited", () => {
        const v = view(
            taxInvoice({
                number: "RYE/26-27/0013",
                kind: "CREDIT_NOTE",
                relatedInvoice: { id: "inv_0", number: "RYE/26-27/0012" },
            }),
        );
        expect(v.title).toBe("Credit note");
        expect(v.related).toBe("Against RYE/26-27/0012");
        // A credit note is not due.
        expect(v.dates).toBe("Issued 5 Sep 2026");
        expect(v.totalLabel).toBe("Credited");
        expect(v.footer).toBe(
            "Credit note under section 34, CGST Act, against RYE/26-27/0012. Reverse charge does not apply.",
        );
    });

    it("an unregistered business's invoice says so, and a paid one is a receipt", () => {
        const pulse = { name: "Pulse Studio", legalName: null, email: null };
        const due = view(row({ number: "PS-0007" }), pulse);
        expect(due.title).toBe("Invoice");
        expect(due.seller.tax).toBe("Not registered for GST");
        expect(due.hsnColumn).toBe(false);
        expect(due.lines[0]!.hsn).toBe("");
        expect(due.sums).toEqual([]);
        expect(due.footer).toBe(
            "Pulse Studio is not registered for GST, so no tax is charged.",
        );

        const paid = view(
            row({
                number: "PS-0007",
                status: "PAID",
                paidAt: new Date("2026-09-06T05:00:00Z"),
            }),
            pulse,
        );
        expect(paid.title).toBe("Receipt");
        expect(paid.footer).toBe(
            "Receipt — paid in full. Pulse Studio is not registered for GST, so no tax is charged.",
        );

        // The receipt says how it was paid (UX-082).
        const byUpi = view(
            row({
                number: "PS-0007",
                status: "PAID",
                paidAt: new Date("2026-09-06T05:00:00Z"),
                paymentMethod: "UPI",
            }),
            pulse,
        );
        expect(byUpi.footer).toBe(
            "Receipt — paid in full by UPI. Pulse Studio is not registered for GST, so no tax is charged.",
        );
    });

    it("an unregistered paper with a typed tax shows its subtotal and tax", () => {
        const v = view(
            row({ subtotal: "2400.00", tax: "120.00", total: "2520.00" }),
        );
        expect(v.sums).toEqual([
            ["Subtotal", "₹2,400"],
            ["Tax", "₹120"],
        ]);
        expect(v.footer).toBe("Rye & Co. is not registered for GST.");
    });

    it("an order's invoice has no due date: the order is the ledger", () => {
        const v = view(taxInvoice({ order: { id: "o_1", orderId: "1042" } }));
        expect(v.dates).toBe("Issued 5 Sep 2026");
    });
});

describe("the PDF", () => {
    it("is named for the invoice's number", () => {
        expect(pdfFileName("RYE/26-27/0012")).toBe("RYE-26-27-0012.pdf");
        expect(pdfFileName("INV-0042")).toBe("INV-0042.pdf");
        expect(pdfFileName("//")).toBe("invoice.pdf");
    });

    it("a tax invoice carries its number, GSTIN, CGST and SGST and total", async () => {
        const { file, text, pages } = await pdfText(taxInvoice());
        expect(file.subarray(0, 5).toString()).toBe("%PDF-");
        expect(pages).toBe(1);
        for (const words of [
            "TAX INVOICE",
            "RYE/26-27/0012",
            `GSTIN ${GSTIN} · Karnataka (29)`,
            "Asha Rao",
            "Karnataka (29) — CGST + SGST",
            "Celebration cake",
            "1905 90 10",
            "Taxable value",
            "CGST",
            "SGST",
            "₹216",
            "₹2,832",
            "Prices include GST.",
            "Tax invoice under section 31, CGST Act.",
        ]) {
            expect(text).toContain(words);
        }
        expect(text).not.toContain("IGST");
    });

    it("a bill of supply prints no tax columns", async () => {
        const { text } = await pdfText(
            taxInvoice({
                number: "KD/26-27/0004",
                cgst: "0.00",
                sgst: "0.00",
                total: "1800.00",
                lines: [
                    line({
                        description: "Scaling and polishing",
                        unitPrice: "1800.00",
                        amount: "1800.00",
                        hsnSac: "9993",
                        gstRate: "0",
                        taxableValue: "1800.00",
                    }),
                ],
            }),
            { name: "Kavi Dental", legalName: null, email: null },
        );
        expect(text).toContain("BILL OF SUPPLY");
        expect(text).toContain(GSTIN);
        expect(text).toContain("9993");
        expect(text).toContain("₹1,800");
        expect(text).not.toContain("CGST +");
        expect(text).not.toContain("Taxable value");
    });

    it("an unregistered receipt says it is not registered for GST", async () => {
        const { text } = await pdfText(
            row({ number: "PS-0007", status: "PAID" }),
            { name: "Pulse Studio", legalName: null, email: null },
        );
        expect(text).toContain("RECEIPT");
        expect(text).toContain("Not registered for GST");
        expect(text).toContain("₹2,400");
        expect(text).not.toContain("GSTIN");
    });

    it("a 40-line invoice runs onto numbered pages, every line on one", async () => {
        const lines = Array.from({ length: 40 }, (_, n) =>
            line({
                position: n,
                description: `Class ${n + 1}`,
                unitPrice: "500.00",
                amount: "500.00",
            }),
        );
        const { text, pages } = await pdfText(
            row({ lines, subtotal: "20000.00", total: "20000.00" }),
        );
        expect(pages).toBeGreaterThan(1);
        for (let n = 1; n <= 40; n++) {
            expect(text).toMatch(new RegExp(`Class ${n}\\b`));
        }
        expect(text).toContain("Invoice RYE/26-27/0012, continued");
        expect(text).toContain(`RYE/26-27/0012 · page ${pages} of ${pages}`);
        expect(text).toContain("₹20,000");
    });
});

describe("an issued paper names the seller as it was at issue (DEC-082)", () => {
    /** What Rye's paper froze when it was issued. */
    const FROZEN = {
        sellerName: "Rye & Co.",
        sellerLegalName: "Rye and Company Bakery LLP",
        sellerEmail: "hello@rye.example",
    };
    /** The business since: renamed, a new legal name and email. */
    const RENAMED: PaperBusiness = {
        name: "Rye Bakehouse",
        legalName: "Rye Bakehouse Private Limited",
        email: "orders@ryebakehouse.example",
    };

    it("prints the frozen name, legal name and email, not today's settings", () => {
        const v = view(taxInvoice(FROZEN), RENAMED);
        expect(v.seller.name).toBe("Rye & Co.");
        expect(v.seller.lines).toEqual([
            "Rye and Company Bakery LLP",
            "22 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
            "hello@rye.example",
        ]);
    });

    it("a receipt's footer names the business as it was", () => {
        const v = view(row(FROZEN), RENAMED);
        expect(v.footer).toBe(
            "Rye & Co. is not registered for GST, so no tax is charged.",
        );
    });

    it("a legal name or email left blank at issue stays blank", () => {
        const v = view(
            taxInvoice({
                sellerName: "Rye & Co.",
                sellerLegalName: null,
                sellerEmail: null,
            }),
            RENAMED,
        );
        expect(v.seller.name).toBe("Rye & Co.");
        expect(v.seller.lines).toEqual([
            "22 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
        ]);
    });

    it("falls back to today's settings only for a row that froze none", () => {
        const v = view(taxInvoice(), RENAMED);
        expect(v.seller.name).toBe("Rye Bakehouse");
        expect(v.seller.lines).toContain("orders@ryebakehouse.example");
    });

    it("the PDF's text carries the frozen seller after a rename", async () => {
        const { text } = await pdfText(taxInvoice(FROZEN), RENAMED);
        expect(text).toContain("Rye & Co.");
        expect(text).toContain("Rye and Company Bakery LLP");
        expect(text).toContain("hello@rye.example");
        expect(text).not.toContain("Rye Bakehouse");
        expect(text).not.toContain("orders@ryebakehouse.example");
    });
});

describe("How to pay us on an unpaid invoice (#833)", () => {
    const PAY = {
        upiId: "rye@okhdfc",
        bankAccountName: "Rye and Company",
        bankAccountNumber: "123456789012",
        bankIfsc: "HDFC0001234",
        bankName: "HDFC Bank",
        note: "Put the invoice number in the note.",
    };
    const paper = (r: InvoiceRow, pay: typeof PAY | null = PAY) => {
        const i = serializeInvoice(r, NOW, { detail: true });
        return paperView({ ...i, number: i.number! }, RYE, ZONE, pay);
    };

    it("prints the UPI ID, the bank transfer and the note while it is owed", () => {
        expect(paper(row()).howToPay).toEqual([
            "UPI: rye@okhdfc",
            "Bank transfer: Rye and Company · A/c 1234 5678 9012 · IFSC HDFC0001234 · HDFC Bank",
            "Put the invoice number in the note.",
        ]);
        // Overdue asks to be paid too.
        expect(
            paper(row({ dueAt: new Date("2026-09-10T05:00:00Z") })).howToPay,
        ).not.toBeNull();
    });

    it("prints nothing on paid, void or credit paper, or when none is set", () => {
        expect(paper(row({ status: "PAID" })).howToPay).toBeNull();
        expect(paper(row({ status: "VOID" })).howToPay).toBeNull();
        expect(paper(row({ kind: "CREDIT_NOTE" })).howToPay).toBeNull();
        expect(paper(row(), null).howToPay).toBeNull();
        expect(view(row()).howToPay).toBeNull();
    });

    it("leaves out what isn't set", () => {
        expect(
            paper(row(), {
                ...PAY,
                bankAccountName: null,
                bankAccountNumber: null,
                bankIfsc: null,
                bankName: null,
                note: null,
            }).howToPay,
        ).toEqual(["UPI: rye@okhdfc"]);
    });

    it("the PDF's text carries it", async () => {
        const file = await renderInvoicePdf(paper(row()));
        const out = execFileSync(process.execPath, ["-e", EXTRACT], {
            input: file,
        });
        const { text } = JSON.parse(out.toString()) as { text: string };
        expect(text.replace(/\s+/g, "")).toContain("HOWTOPAYUS");
        expect(text).toContain("UPI: rye@okhdfc");
        expect(text).toContain("IFSC HDFC0001234");
    });
});
