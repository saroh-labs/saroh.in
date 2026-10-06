import { describe, expect, it } from "vitest";

import { isPayOrder, orderPayOffer } from "./order-pay-shape";

const ORDER = {
    businessName: "Northwind",
    orderNumber: "1063",
    firstName: "Asha",
    lines: [
        {
            name: "Sourdough",
            quantity: 2,
            unitPrice: "250.00",
            amount: "500.00",
        },
    ],
    total: "500.00",
    due: "500.00",
    currency: "INR",
    status: "DUE",
    theme: null,
};

describe("isPayOrder", () => {
    it("accepts the API's allow-listed order", () => {
        expect(isPayOrder(ORDER)).toBe(true);
        expect(isPayOrder({ ...ORDER, status: "PAID", due: "0.00" })).toBe(
            true,
        );
        expect(isPayOrder({ ...ORDER, firstName: null })).toBe(true);
        expect(isPayOrder({ ...ORDER, theme: { "--site-bg": "#fff" } })).toBe(
            true,
        );
    });

    it("refuses a body in the wrong shape rather than drawing it", () => {
        expect(isPayOrder(null)).toBe(false);
        expect(isPayOrder({ ...ORDER, status: "UNPAID" })).toBe(false);
        expect(isPayOrder({ ...ORDER, due: 500 })).toBe(false);
        expect(isPayOrder({ ...ORDER, lines: [{ name: "x" }] })).toBe(false);
        const { orderNumber: _n, ...noNumber } = ORDER;
        expect(isPayOrder(noNumber)).toBe(false);
    });
});

describe("orderPayOffer (R33)", () => {
    it("offers Pay when it's due and can be paid online, or an older API says nothing", () => {
        expect(orderPayOffer({ status: "DUE", payOnline: true })).toBe("pay");
        expect(orderPayOffer({ status: "DUE" })).toBe("pay");
    });

    it("is view-only — pay the business directly — when it can't be paid online", () => {
        expect(orderPayOffer({ status: "DUE", payOnline: false })).toBe(
            "elsewhere",
        );
    });

    it("has nothing to do once paid or closed, online or not", () => {
        expect(orderPayOffer({ status: "PAID", payOnline: false })).toBe(
            "settled",
        );
        expect(orderPayOffer({ status: "CLOSED", payOnline: true })).toBe(
            "settled",
        );
    });

    it("still accepts the order with payOnline in it", () => {
        expect(isPayOrder({ ...ORDER, payOnline: false })).toBe(true);
    });
});
