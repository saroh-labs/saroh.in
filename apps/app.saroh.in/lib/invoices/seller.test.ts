import { describe, expect, it } from "vitest";

import { printedSeller } from "./seller";

const TODAY = {
    name: "Rye Bakehouse",
    legalName: "Rye Bakehouse Private Limited",
    email: "orders@ryebakehouse.example",
};

describe("printedSeller (DEC-082)", () => {
    it("issued paper prints the seller frozen on it, not today's", () => {
        expect(
            printedSeller(
                {
                    status: "ISSUED",
                    sellerName: "Rye & Co.",
                    sellerLegalName: "Rye and Company Bakery LLP",
                    sellerEmail: "hello@rye.example",
                },
                TODAY,
            ),
        ).toEqual({
            name: "Rye & Co.",
            legalName: "Rye and Company Bakery LLP",
            email: "hello@rye.example",
        });
    });

    it("a legal name or email blank at issue stays blank", () => {
        expect(
            printedSeller(
                {
                    status: "PAID",
                    sellerName: "Rye & Co.",
                    sellerLegalName: null,
                    sellerEmail: null,
                },
                TODAY,
            ),
        ).toEqual({ name: "Rye & Co.", legalName: null, email: null });
    });

    it("a draft follows today's settings", () => {
        expect(
            printedSeller(
                {
                    status: "DRAFT",
                    sellerName: "Rye & Co.",
                    sellerLegalName: null,
                    sellerEmail: null,
                },
                TODAY,
            ),
        ).toEqual(TODAY);
    });

    it("an issued row that froze none falls back to today's", () => {
        expect(printedSeller({ status: "ISSUED" }, TODAY)).toEqual(TODAY);
    });
});
