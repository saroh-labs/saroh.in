import { describe, expect, it } from "vitest";

import {
    isPayInvoice,
    payChargingOf,
    payContactOf,
    payDate,
    payMoney,
    payOffer,
    payOnlineOf,
    payTitle,
} from "./invoice-pay-shape";

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

describe("without online payment (DEC-070)", () => {
    const at = { at: "2026-09-10T04:30:00.000Z" };

    it("reads payOnline only as a real boolean", () => {
        expect(payOnlineOf(false)).toBe(false);
        expect(payOnlineOf(true)).toBe(true);
        expect(payOnlineOf("false")).toBeUndefined();
        expect(payOnlineOf(undefined)).toBeUndefined();
    });

    it("offers Pay only when the business takes payment online", () => {
        expect(payOffer({ status: "ISSUED", payOnline: true })).toBe("pay");
        expect(payOffer({ status: "OVERDUE", payOnline: false })).toBe(
            "elsewhere",
        );
        expect(payOffer({ status: "ISSUED", payOnline: false })).toBe(
            "elsewhere",
        );
    });

    it("an older API sends no payOnline: Pay, as before", () => {
        expect(payOffer({ status: "ISSUED" })).toBe("pay");
    });

    it("settled, or charging, whatever payOnline says", () => {
        expect(payOffer({ status: "PAID", payOnline: false })).toBe("settled");
        expect(payOffer({ status: "VOID" })).toBe("settled");
        expect(payOffer({ status: "ISSUED", autopayCharging: at })).toBe(
            "charging",
        );
    });
});

describe("isPayInvoice", () => {
    it("accepts the API's allow-listed invoice", () => {
        expect(isPayInvoice(INVOICE)).toBe(true);
        expect(isPayInvoice({ ...INVOICE, status: "OVERDUE" })).toBe(true);
        expect(
            isPayInvoice({ ...INVOICE, theme: { "--site-bg": "#fff" } }),
        ).toBe(true);
    });

    it("reads whether it is a bill of supply, and an older API without it (D15)", () => {
        expect(isPayInvoice({ ...INVOICE, billOfSupply: true })).toBe(true);
        expect(isPayInvoice({ ...INVOICE, billOfSupply: false })).toBe(true);
        expect(isPayInvoice({ ...INVOICE, billOfSupply: "yes" })).toBe(false);
    });

    it("names the paper as the business's copy does", () => {
        expect(payTitle({ billOfSupply: true })).toBe("Bill of supply");
        expect(payTitle({ billOfSupply: false })).toBe("Invoice");
        expect(payTitle({})).toBe("Invoice");
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

describe("an autopay charge under way (D13)", () => {
    it("reads the day it is asked for, and anything strange as none", () => {
        expect(payChargingOf({ at: "2026-10-02T10:00:00.000Z" })).toEqual({
            at: "2026-10-02T10:00:00.000Z",
        });
        expect(payChargingOf({ at: "soon" })).toBeNull();
        expect(payChargingOf(null)).toBeNull();
        expect(payChargingOf(undefined)).toBeNull();
    });
});

describe("payContactOf (UX-007)", () => {
    it("keeps a phone and an email that look right", () => {
        expect(
            payContactOf({ phone: "+919800000000", email: "hi@shop.example" }),
        ).toEqual({ phone: "+919800000000", email: "hi@shop.example" });
        expect(payContactOf({ phone: null, email: "hi@shop.example" })).toEqual(
            { phone: null, email: "hi@shop.example" },
        );
    });

    it("drops what is strange, and is none when nothing is left", () => {
        expect(payContactOf({ phone: "call me", email: "nope" })).toBeNull();
        expect(payContactOf({ phone: "+919800000000", email: 4 })).toEqual({
            phone: "+919800000000",
            email: null,
        });
        expect(payContactOf(null)).toBeNull();
        expect(payContactOf("x")).toBeNull();
    });
});
