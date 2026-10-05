import { describe, expect, it, vi } from "vitest";

import {
    fetchInvoicePdf,
    fileNameFrom,
    hasCustomerPdf,
    payPdfHref,
    pdfFailure,
    pdfFileName,
    receiptPdfHref,
} from "./invoice-pdf";

describe("the customer's Download PDF (DEC-083)", () => {
    it("asks this app's own routes, never the API", () => {
        expect(payPdfHref("tok/1")).toBe("/pay/tok%2F1/pdf");
        expect(receiptPdfHref("inv_1")).toBe("/account/receipts/inv_1/pdf");
    });

    it("offers no PDF of a void invoice", () => {
        expect(hasCustomerPdf("VOID")).toBe(false);
        for (const s of ["ISSUED", "OVERDUE", "PAID", "CREDITED"]) {
            expect(hasCustomerPdf(s)).toBe(true);
        }
    });

    it("names the file as the API does", () => {
        expect(pdfFileName("KD/26-27/0012")).toBe("KD-26-27-0012.pdf");
        expect(pdfFileName(null)).toBe("invoice.pdf");
        expect(
            fileNameFrom('attachment; filename="RB-0001.pdf"', "ignored"),
        ).toBe("RB-0001.pdf");
        expect(fileNameFrom(null, "RB/0002")).toBe("RB-0002.pdf");
    });

    it("words a failure for the customer, by status", () => {
        expect(pdfFailure(404)).toMatch(/newer link/);
        expect(pdfFailure(429)).toMatch(/Wait a minute/);
        expect(pdfFailure(401)).toMatch(/Sign in/);
        expect(pdfFailure(502)).toMatch(/couldn't make the PDF/);
    });

    it("fetches the PDF and its name", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(new Uint8Array([37, 80, 68, 70]), {
                headers: {
                    "content-type": "application/pdf",
                    "content-disposition":
                        'attachment; filename="KD-26-27-0012.pdf"',
                },
            }),
        );
        const got = await fetchInvoicePdf(
            "/pay/tok/pdf",
            "KD/26-27/0012",
            fetchImpl,
        );
        expect(fetchImpl).toHaveBeenCalledWith("/pay/tok/pdf", {
            cache: "no-store",
        });
        expect(got.ok && got.fileName).toBe("KD-26-27-0012.pdf");
        expect(got.ok && got.blob.size).toBe(4);
    });

    it("a failed or unreachable download says why, never the API's words", async () => {
        const gone = await fetchInvoicePdf(
            "/pay/tok/pdf",
            "X",
            vi
                .fn()
                .mockResolvedValue(
                    Response.json(
                        { message: "Invoice not found" },
                        { status: 404 },
                    ),
                ),
        );
        expect(gone).toEqual({ ok: false, error: pdfFailure(404) });
        const offline = await fetchInvoicePdf(
            "/pay/tok/pdf",
            "X",
            vi.fn().mockRejectedValue(new TypeError("offline")),
        );
        expect(offline.ok).toBe(false);
        expect(!offline.ok && offline.error).toMatch(/connection/);
    });
});
