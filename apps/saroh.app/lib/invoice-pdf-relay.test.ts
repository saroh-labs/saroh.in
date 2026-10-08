import { describe, expect, it } from "vitest";

import { pdfUnavailable, relayPdf } from "./invoice-pdf-relay";

describe("relaying the invoice PDF (DEC-083)", () => {
    it("passes the bytes through as a private, unsniffed attachment", async () => {
        const res = relayPdf(
            new Response(new Uint8Array([37, 80, 68, 70]), {
                headers: {
                    "content-type": "application/pdf",
                    "content-disposition":
                        'attachment; filename="KD-26-27-0012.pdf"',
                },
            }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("application/pdf");
        expect(res.headers.get("content-disposition")).toBe(
            'attachment; filename="KD-26-27-0012.pdf"',
        );
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(
            new Uint8Array([37, 80, 68, 70]),
        );
    });

    it("never passes on a strange file name", () => {
        const res = relayPdf(
            new Response("x", {
                headers: {
                    "content-disposition": 'inline; filename="../evil.html"',
                },
            }),
        );
        expect(res.headers.get("content-disposition")).toBe(
            'attachment; filename="invoice.pdf"',
        );
    });

    it("keeps 401, 404 and 429; anything else is a 502, with none of the API's words", async () => {
        for (const [from, to] of [
            [401, 401],
            [404, 404],
            [429, 429],
            [409, 502],
            [500, 502],
        ] as const) {
            const res = relayPdf(
                Response.json(
                    { message: "Invoice not found" },
                    { status: from },
                ),
            );
            expect(res.status).toBe(to);
            expect(await res.text()).not.toContain("Invoice not found");
            expect(res.headers.get("cache-control")).toBe("private, no-store");
        }
        expect(pdfUnavailable(502).status).toBe(502);
    });
});
