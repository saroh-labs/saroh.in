import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Invoice, InvoiceGst, InvoiceLine } from "@/lib/invoices/service";

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
        expect(out.match(/Nil-rated/g)).toHaveLength(1);
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
