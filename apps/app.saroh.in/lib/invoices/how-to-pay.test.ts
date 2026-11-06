import { EDITION_PROFILES } from "@saroh/edition";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { howToPayLines } from "./how-to-pay";

const PAY = {
    upiId: "rye@okhdfc",
    bankAccountName: "Rye and Company",
    bankAccountNumber: "123456789012",
    bankIfsc: "HDFC0001234",
    bankName: "HDFC Bank",
    note: "Put the invoice number in the note.",
};

describe("howToPayLines (#833)", () => {
    it("prints the UPI ID, the bank transfer and the note on an unpaid invoice, as the PDF does", () => {
        expect(howToPayLines({ standing: "ISSUED" }, PAY)).toEqual([
            "UPI: rye@okhdfc",
            "Bank transfer: Rye and Company · A/c 1234 5678 9012 · IFSC HDFC0001234 · HDFC Bank",
            "Put the invoice number in the note.",
        ]);
        expect(howToPayLines({ standing: "OVERDUE" }, PAY)).not.toBeNull();
    });

    it("prints nothing once nothing is owed, on a credit note, or when none is set", () => {
        for (const standing of ["DRAFT", "PAID", "VOID", "CREDITED"] as const) {
            expect(howToPayLines({ standing }, PAY)).toBeNull();
        }
        expect(
            howToPayLines({ standing: "ISSUED", kind: "CREDIT_NOTE" }, PAY),
        ).toBeNull();
        expect(howToPayLines({ standing: "ISSUED" }, null)).toBeNull();
        expect(
            howToPayLines(
                { standing: "ISSUED" },
                {
                    upiId: null,
                    bankAccountName: null,
                    bankAccountNumber: null,
                    bankIfsc: null,
                    bankName: null,
                    note: "  ",
                },
            ),
        ).toBeNull();
    });

    it("leaves bank details out unless they are whole", () => {
        expect(
            howToPayLines(
                { standing: "ISSUED" },
                { ...PAY, bankIfsc: null, note: null },
            ),
        ).toEqual(["UPI: rye@okhdfc"]);
    });
});

describe("howToPayLines while Global takes Stripe only (DEC-208)", () => {
    it("prints nothing for a Global business, whatever it saved, and India's as before", () => {
        expect(
            howToPayLines(
                { standing: "ISSUED" },
                {
                    ...PAY,
                    edition: "GLOBAL",
                    bankAccountNumber: "GB82WEST12345698765432",
                    bankIfsc: null,
                    country: "GB",
                },
            ),
        ).toBeNull();
        expect(howToPayLines({ standing: "ISSUED" }, PAY)).not.toBeNull();
    });
});

describe("howToPayLines for a Global business (DEC-204)", () => {
    // Its per-country lines stay, off: judged as they'll be when back on.
    beforeAll(() => {
        EDITION_PROFILES.GLOBAL.payInstructionsOffered = true;
    });
    afterAll(() => {
        EDITION_PROFILES.GLOBAL.payInstructionsOffered = false;
    });

    it("names the numbers as its country does, and leaves out a UPI ID", () => {
        const global = {
            ...PAY,
            edition: "GLOBAL" as const,
            bankAccountNumber: "GB82WEST12345698765432",
            bankIfsc: null,
            bankSwift: "NWBKGB2L",
            bankName: "Example Bank",
            country: "GB",
            bankLabels: { account: "IBAN", code: null, swift: "SWIFT/BIC" },
        };
        expect(howToPayLines({ standing: "ISSUED" }, global)).toEqual([
            "Bank transfer: Rye and Company · IBAN GB82 WEST 1234 5698 7654 32 · SWIFT/BIC NWBKGB2L · Example Bank",
            "Put the invoice number in the note.",
        ]);
        expect(
            howToPayLines(
                { standing: "ISSUED" },
                {
                    ...global,
                    bankAccountNumber: "12345678",
                    bankIfsc: "062-000",
                    bankSwift: null,
                    country: "AU",
                    bankLabels: {
                        account: "Account number",
                        code: "BSB",
                        swift: "SWIFT/BIC",
                    },
                },
            )?.[0],
        ).toBe(
            "Bank transfer: Rye and Company · Account number 1234 5678 · BSB 062-000 · Example Bank",
        );
    });
});
