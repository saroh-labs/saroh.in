import { describe, expect, it } from "vitest";

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

describe("howToPayLines for a Global business (DEC-204)", () => {
    it("says Bank code, leaves out a UPI ID, and takes no code at all", () => {
        const global = {
            ...PAY,
            edition: "GLOBAL" as const,
            bankAccountNumber: "GB82WEST12345698765432",
            bankIfsc: "12-34-56",
            bankName: "Example Bank",
        };
        expect(howToPayLines({ standing: "ISSUED" }, global)).toEqual([
            "Bank transfer: Rye and Company · Account GB82 WEST 1234 5698 7654 32 · Bank code 12-34-56 · Example Bank",
            "Put the invoice number in the note.",
        ]);
        expect(
            howToPayLines(
                { standing: "ISSUED" },
                { ...global, bankIfsc: null },
            )?.[0],
        ).toBe(
            "Bank transfer: Rye and Company · Account GB82 WEST 1234 5698 7654 32 · Example Bank",
        );
    });
});
