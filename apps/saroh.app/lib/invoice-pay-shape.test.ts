import { describe, expect, it } from "vitest";

import { isPayInvoice, payDate, payMoney } from "./invoice-pay-shape";

const INVOICE = {
    businessName: "Lotus Yoga",
    number: "INV-0007",
    issuedAt: "2026-09-01T10:00:00.000Z",
    dueAt: "2026-09-08T10:00:00.000Z",
    lines: [
        {
            description: "Monthly membership",
            quantity: 1,
            unitPrice: "1200.00",
            amount: "1200.00",
        },
    ],
    tax: "200.00",
    total: "1400.00",
    currency: "INR",
    status: "ISSUED",
    billedTo: "Asha Rao",
    theme: null,
};

describe("isPayInvoice", () => {
    it("accepts the API's allow-listed invoice", () => {
        expect(isPayInvoice(INVOICE)).toBe(true);
        expect(isPayInvoice({ ...INVOICE, status: "OVERDUE" })).toBe(true);
        expect(
            isPayInvoice({ ...INVOICE, theme: { "--site-bg": "#fff" } }),
        ).toBe(true);
    });

    it("refuses a body in the wrong shape rather than drawing it", () => {
        expect(isPayInvoice(null)).toBe(false);
        expect(isPayInvoice({ ...INVOICE, status: "DRAFT" })).toBe(false);
        expect(isPayInvoice({ ...INVOICE, total: 1400 })).toBe(false);
        expect(
            isPayInvoice({ ...INVOICE, lines: [{ description: "x" }] }),
        ).toBe(false);
        const { number: _number, ...noNumber } = INVOICE;
        expect(isPayInvoice(noNumber)).toBe(false);
    });
});

describe("payMoney and payDate", () => {
    it("keeps an invoice's decimals", () => {
        expect(payMoney("1400", "INR")).toBe("₹1,400.00");
    });

    it("falls back rather than throwing on an unknown currency", () => {
        expect(payMoney("abc", "INR")).toBe("INR abc");
    });

    it("writes the day in words, and nothing for a missing date", () => {
        expect(payDate("2026-09-08T10:00:00.000Z")).toBe("8 September 2026");
        expect(payDate(null)).toBeNull();
    });
});
