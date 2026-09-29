jest.mock("../../env", () => ({
    env: { NODE_ENV: "test", RENDERER_URL: "https://saroh.app" },
}));

import { invoiceSentence } from "./thread-poster";

/**
 * The words of Saroh's invoice post into a customer's thread (A13, for
 * D17): the invoice, its amount and when it is due — never a pay link.
 */
const decimal = (s: string) => ({ toString: () => s });
const now = new Date("2026-10-10T06:00:00Z");

function invoice(over: Record<string, unknown> = {}) {
    return {
        number: "RC-0012",
        total: decimal("2400"),
        currency: "INR",
        dueAt: new Date("2026-10-15T06:00:00Z"),
        status: "ISSUED",
        ...over,
    };
}

describe("invoiceSentence", () => {
    it("a sent invoice says it is ready to pay, and by when", () => {
        expect(
            invoiceSentence("INVOICE_SENT", invoice(), "Asia/Kolkata", now),
        ).toBe(
            "Invoice RC-0012 for ₹2,400.00 is ready to pay. It's due by 15 Oct 2026.",
        );
    });

    it("a reminder about an overdue one says when it was due", () => {
        expect(
            invoiceSentence(
                "INVOICE_REMINDER",
                invoice({ dueAt: new Date("2026-10-01T06:00:00Z") }),
                "Asia/Kolkata",
                now,
            ),
        ).toBe(
            "A reminder: invoice RC-0012 for ₹2,400.00 is still to pay. It was due on 1 Oct 2026.",
        );
    });

    it("says nothing of a due date the invoice doesn't have", () => {
        expect(
            invoiceSentence(
                "INVOICE_SENT",
                invoice({ dueAt: null }),
                "Asia/Kolkata",
                now,
            ),
        ).toBe("Invoice RC-0012 for ₹2,400.00 is ready to pay.");
    });
});
