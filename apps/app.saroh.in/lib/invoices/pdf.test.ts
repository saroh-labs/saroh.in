import { afterEach, describe, expect, it, vi } from "vitest";

import {
    downloadInvoicePdf,
    fileNameFrom,
    hasPdf,
    pdfFailure,
    pdfFileName,
} from "./pdf";

describe("Download PDF (D16)", () => {
    it("only an issued paper, which has a number, has a PDF", () => {
        expect(hasPdf({ number: "RYE/26-27/0012", standing: "ISSUED" })).toBe(
            true,
        );
        expect(hasPdf({ number: "RYE/26-27/0012", standing: "PAID" })).toBe(
            true,
        );
        expect(hasPdf({ number: "RYE/26-27/0012", standing: "VOID" })).toBe(
            true,
        );
        expect(hasPdf({ number: null, standing: "DRAFT" })).toBe(false);
        // Voided without ever being numbered: nothing to download.
        expect(hasPdf({ number: null, standing: "VOID" })).toBe(false);
    });

    it("names the file for the number, as the API does", () => {
        expect(pdfFileName("RYE/26-27/0012")).toBe("RYE-26-27-0012.pdf");
        expect(pdfFileName(null)).toBe("invoice.pdf");
        expect(
            fileNameFrom('attachment; filename="KD-26-27-0004.pdf"', "x"),
        ).toBe("KD-26-27-0004.pdf");
        expect(fileNameFrom(null, "INV-0042")).toBe("INV-0042.pdf");
    });

    it("says why a download failed", () => {
        expect(pdfFailure(403)).toBe("Your role can't download this invoice.");
        expect(pdfFailure(409)).toBe("A draft has no PDF yet. Issue it first.");
        expect(pdfFailure(500)).toBe("Couldn't make the PDF. Try again.");
    });

    describe("downloading", () => {
        afterEach(() => vi.unstubAllGlobals());

        it("hands the API's refusal to the screen", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(() =>
                    Promise.resolve(
                        Response.json(
                            {
                                error: "A draft has no PDF yet. Issue it first.",
                            },
                            { status: 409 },
                        ),
                    ),
                ),
            );
            expect(
                await downloadInvoicePdf({ id: "inv_1", number: null }),
            ).toEqual({
                ok: false,
                error: "A draft has no PDF yet. Issue it first.",
            });
        });

        it("says so when Saroh can't be reached", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(() => Promise.reject(new TypeError("offline"))),
            );
            const res = await downloadInvoicePdf({ id: "inv_1", number: "A" });
            expect(res.ok).toBe(false);
        });

        it("saves the file under the API's name", async () => {
            const fetch = vi.fn(() =>
                Promise.resolve(
                    new Response(new Uint8Array([37, 80, 68, 70]), {
                        headers: {
                            "content-type": "application/pdf",
                            "content-disposition":
                                'attachment; filename="RYE-26-27-0012.pdf"',
                        },
                    }),
                ),
            );
            const a = {
                href: "",
                download: "",
                click: vi.fn(),
                remove: vi.fn(),
            };
            vi.stubGlobal("fetch", fetch);
            vi.stubGlobal("document", {
                createElement: () => a,
                body: { appendChild: vi.fn() },
            });
            vi.stubGlobal("URL", {
                createObjectURL: () => "blob:pdf",
                revokeObjectURL: vi.fn(),
            });

            expect(
                await downloadInvoicePdf({
                    id: "inv 1",
                    number: "RYE/26-27/0012",
                }),
            ).toEqual({ ok: true });
            expect(fetch).toHaveBeenCalledWith("/api/invoices/inv%201/pdf", {
                cache: "no-store",
            });
            expect(a.download).toBe("RYE-26-27-0012.pdf");
            expect(a.click).toHaveBeenCalled();
        });
    });
});
