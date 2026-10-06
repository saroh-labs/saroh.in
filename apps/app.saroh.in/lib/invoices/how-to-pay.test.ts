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
