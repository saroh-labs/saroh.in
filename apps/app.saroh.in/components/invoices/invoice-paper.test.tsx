import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Invoice, InvoiceGst, InvoiceLine } from "@/lib/invoices/service";
import type { InvoiceBusiness } from "@/lib/invoices/tax";

import { InvoicePaper } from "./invoice-paper";

/**
 * DEC-072 on Invoice Detail's paper: GST shows only when it applies. A plan
 * renewal's line on a registered business's tax invoice has no rate set,
 * so it prints no rate and no "Nil-rated"; only a line recorded at 0% is
 * nil-rated; an unregistered business's receipt says nothing about GST on
 * any line.
 */

const GST: InvoiceGst = {
    sellerGstin: "29AAGCR1234M1Z5",
    sellerState: "29",
    placeOfSupply: { code: "29", name: "Karnataka" },
    taxType: "INTRA",
    cgst: "216.00",
    sgst: "216.00",
    igst: "0.00",
};

function line(over: Partial<InvoiceLine> = {}): InvoiceLine {
    return {
        id: `l_${Math.random().toString(36).slice(2)}`,
        description: "Bread club · Sep 2026",
        quantity: 1,
        unitPrice: "1200.00",
        amount: "1200.00",
        discount: "0.00",
        gst: {
            hsnSac: null,
            rate: null,
            taxableValue: "1200.00",
            cgst: "0.00",
            sgst: "0.00",
            igst: "0.00",
        },
        orderItemId: null,
        ...over,
    };
}

function invoice(over: Partial<Invoice>): Invoice {
    return {
        id: "inv_1",
        number: "RYE/26-27/0031",
        status: "ISSUED",
        standing: "ISSUED",
        contact: { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
        billTo: { name: "Asha Rao", email: "asha@example.com" },
        kind: "INVOICE",
        title: "Tax invoice",
        exempt: false,
        related: null,
        gst: GST,
        sellerAddress: null,
        currency: "INR",
        subtotal: "3600.00",
        tax: "432.00",
        total: "4032.00",
        issuedAt: "2026-09-05T05:00:00Z",
        dueAt: "2026-09-19T05:00:00Z",
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        payment: null,
        source: "SUBSCRIPTION",
        subscriptionId: "sub_1",
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissuedAsId: null,
        issuedAutomatically: true,
        createdAt: "2026-09-05T05:00:00Z",
        updatedAt: "2026-09-05T05:00:00Z",
        summary: null,
        lines: [line()],
        ...over,
    };
}

const html = (i: Invoice) =>
    renderToStaticMarkup(
        <InvoicePaper invoice={i} business={null} businessName="Rye & Co." />,
    );

describe("InvoicePaper line GST (DEC-072)", () => {
    it("a registered renewal line with no rate set prints no rate and no Nil-rated", () => {
        const out = html(invoice({}));
        expect(out).toContain("Bread club · Sep 2026");
        expect(out).toContain("Tax invoice");
        expect(out).not.toContain("Nil-rated");
        expect(out).not.toMatch(/GST \d/);
        expect(out).not.toContain("0%");
    });

    it("beside it, an 18% line names its rate and a 0% line is nil-rated", () => {
        const out = html(
            invoice({
                lines: [
                    line(),
                    line({
                        description: "Celebration cake",
                        amount: "2832.00",
                        gst: {
                            hsnSac: "19059010",
                            rate: "18.00",
                            taxableValue: "2400.00",
                            cgst: "216.00",
                            sgst: "216.00",
                            igst: "0.00",
                        },
                    }),
                    line({
                        description: "Sourdough loaf",
                        gst: {
                            hsnSac: "19059010",
                            rate: "0.00",
                            taxableValue: "1200.00",
                            cgst: "0.00",
                            sgst: "0.00",
                            igst: "0.00",
                        },
                    }),
                ],
            }),
        );
        expect(out).toContain("GST 18% · taxable");
        // One line is nil-rated: once under its name on the desk, once on
        // a phone's second line.
        expect(out.match(/Nil-rated/g)).toHaveLength(2);
        expect(out.match(/data-phone-line[^>]*>[^<]*Nil-rated/g)).toHaveLength(
            1,
        );
        expect(out).toMatch(/Sourdough loaf<span[^>]*>Nil-rated/);
        expect(out).toMatch(/Bread club · Sep 2026<\/span>/);
    });

    it("an unregistered business's receipt says nothing about GST on its lines", () => {
        const out = html(
            invoice({
                gst: null,
                title: "Receipt",
                standing: "PAID",
                status: "PAID",
                tax: "0.00",
                lines: [
                    line({
                        gst: {
                            hsnSac: null,
                            rate: "18.00",
                            taxableValue: null,
                            cgst: "0.00",
                            sgst: "0.00",
                            igst: "0.00",
                        },
                    }),
                ],
            }),
        );
        expect(out).toContain("Not registered for GST");
        expect(out).not.toContain("Nil-rated");
        expect(out).not.toMatch(/GST \d/);
        expect(out).not.toContain("HSN / SAC");
        expect(out).not.toContain("CGST");
    });
});

describe("InvoicePaper GST totals (DEC-072)", () => {
    const rated = (rate: string) =>
        line({
            description: "Celebration cake",
            gst: {
                hsnSac: "19059010",
                rate,
                taxableValue: "1200.00",
                cgst: "0.00",
                sgst: "0.00",
                igst: "0.00",
            },
        });

    it("no line with a rate set: just the total, no GST rows", () => {
        const out = html(invoice({ tax: "0.00", total: "1200.00" }));
        expect(out).toContain("Tax invoice");
        expect(out).toContain("Total");
        expect(out).not.toContain("Taxable value");
        expect(out).not.toMatch(/>(CGST|SGST|IGST)</);
        expect(out).not.toContain("Prices include GST");
    });

    it("an inter-state paper with no rate set has no IGST row either", () => {
        const out = html(
            invoice({ gst: { ...GST, taxType: "INTER" }, tax: "0.00" }),
        );
        expect(out).not.toMatch(/>IGST</);
        expect(out).not.toContain("Taxable value");
    });

    it("one rated line, even at 0%, keeps the rows", () => {
        for (const rate of ["18.00", "0.00"]) {
            const out = html(invoice({ lines: [line(), rated(rate)] }));
            expect(out).toContain("Taxable value");
            expect(out).toMatch(/>CGST</);
            expect(out).toMatch(/>SGST</);
            expect(out).toContain("Prices include GST.");
        }
    });
});

describe("InvoicePaper's seller (DEC-082)", () => {
    /** The business today: renamed since the paper was issued. */
    const TODAY: InvoiceBusiness = {
        name: "Rye Bakehouse",
        legalName: "Rye Bakehouse Private Limited",
        email: "orders@ryebakehouse.example",
        registered: true,
        gstin: GST.sellerGstin,
        state: { code: "29", name: "Karnataka" },
        address: "1 New Road, Bengaluru 560001, Karnataka",
        logo: "https://cdn.example/rye-logo.png",
    };
    const FROZEN = {
        sellerName: "Rye & Co.",
        sellerLegalName: "Rye and Company Bakery LLP",
        sellerEmail: "hello@rye.example",
        sellerAddress: "22 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
    };
    const paper = (i: Invoice) =>
        renderToStaticMarkup(
            <InvoicePaper
                invoice={i}
                business={TODAY}
                businessName={TODAY.name}
            />,
        );

    it("issued paper prints the seller as it was at issue after a rename", () => {
        const out = paper(invoice(FROZEN));
        expect(out).toContain("Rye &amp; Co.");
        expect(out).toContain("Rye and Company Bakery LLP");
        expect(out).toContain("hello@rye.example");
        expect(out).toContain("22 Hill Road");
        expect(out).not.toContain("Rye Bakehouse");
        expect(out).not.toContain("orders@ryebakehouse.example");
        // The logo is branding, not frozen: today's.
        expect(out).toContain("https://cdn.example/rye-logo.png");
    });

    it("a draft still follows today's settings", () => {
        const out = paper(
            invoice({
                status: "DRAFT",
                standing: "DRAFT",
                number: null,
                // A draft's view carries no frozen seller (the API's rule).
                sellerName: null,
                sellerLegalName: null,
                sellerEmail: null,
                sellerAddress: null,
            }),
        );
        expect(out).toContain("Rye Bakehouse");
        expect(out).toContain("Rye Bakehouse Private Limited");
        expect(out).toContain("orders@ryebakehouse.example");
        expect(out).toContain("1 New Road");
    });

    it("an issued row without a frozen seller falls back to today's", () => {
        const out = paper(invoice({ sellerName: null }));
        expect(out).toContain("Rye Bakehouse");
    });
});

describe("InvoicePaper's lines on a phone (T6)", () => {
    const croissant = line({
        description: "Almond croissant (trade)",
        quantity: 20,
        unitPrice: "300.00",
        amount: "6000.00",
        gst: {
            hsnSac: "19059020",
            rate: "18.00",
            taxableValue: "5084.75",
            cgst: "457.63",
            sgst: "457.63",
            igst: "0.00",
        },
    });

    it("a phone's second line carries HSN, quantity × price and GST", () => {
        const out = html(invoice({ lines: [croissant] }));
        const phone = /<span data-phone-line[^>]*>([^<]*)</.exec(out);
        expect(phone?.[0]).toContain("sm:hidden");
        expect(phone?.[1]).toBe(
            "HSN 1905 90 20 · 20 × ₹300 · GST 18% · taxable ₹5,084.75",
        );
        // The desk keeps its HSN and Qty columns.
        expect(out).toContain("HSN / SAC");
        expect(out).toMatch(/hidden sm:block print:block[^"]*">20</);
    });

    it("no line with an HSN: no HSN column, on the desk either", () => {
        const out = html(invoice({}));
        expect(out).toContain("Tax invoice");
        expect(out).not.toContain("HSN / SAC");
        expect(out).toContain("sm:grid-cols-[minmax(0,3fr)_56px_90px]");
        expect(out).not.toContain("70px");
        // A line of one with no rate has nothing for a second line.
        expect(out).not.toContain("data-phone-line");
    });
});

describe("InvoicePaper's How to pay us (#833)", () => {
    const pay = {
        upiId: "rye@okhdfc",
        bankAccountName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        bankName: null,
        note: "Put the invoice number in the note.",
    };

    it("unpaid paper prints how to pay, so a printed copy carries it", () => {
        const out = html(invoice({ payInstructions: pay }));
        expect(out).toContain("How to pay us");
        expect(out).toContain("UPI: rye@okhdfc");
        expect(out).toContain("Put the invoice number in the note.");
    });

    it("paid paper, or none set, prints none", () => {
        expect(
            html(
                invoice({
                    status: "PAID",
                    standing: "PAID",
                    payInstructions: pay,
                }),
            ),
        ).not.toContain("How to pay us");
        expect(html(invoice({ payInstructions: null }))).not.toContain(
            "How to pay us",
        );
    });
});
