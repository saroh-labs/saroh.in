import { describe, expect, it } from "vitest";

import { isIntent, isReceipt } from "./checkout-shape";

/**
 * Code review of #322: the first version checked 4 of the receipt's 10
 * fields, so a 200 missing `subtotal` passed and the page drew
 * "GBP undefined". Each field the view reads is checked now.
 */
describe("checkout response shapes", () => {
    const receipt = {
        orderNumber: "NW-1042",
        currency: "GBP",
        subtotal: "40.00",
        tax: "8.00",
        shipping: "0.00",
        discount: "0.00",
        total: "48.00",
        paymentStatus: "UNPAID",
        fulfilmentStatus: "UNFULFILLED",
        latestPayment: null,
    };
    const intent = {
        paymentIntentId: "pi_1",
        provider: "RAZORPAY",
        providerIntentId: "order_1",
        amountCents: 4800,
        currency: "GBP",
        publicKey: null,
        clientParams: {},
    };

    it("accepts a complete receipt, with or without a payment", () => {
        expect(isReceipt(receipt)).toBe(true);
        expect(
            isReceipt({
                ...receipt,
                latestPayment: {
                    provider: "RAZORPAY",
                    status: "SUCCEEDED",
                    amountCents: 4800,
                    currency: "GBP",
                },
            }),
        ).toBe(true);
    });

    // Every field, derived from the valid receipt so a new field cannot be
    // left untested.
    it.each(Object.keys(receipt))("refuses a receipt missing %s", (field) => {
        const { [field]: _omit, ...rest } = receipt as Record<string, unknown>;
        expect(isReceipt(rest)).toBe(false);
    });

    it("refuses an unknown payment status, a half-built payment, and null", () => {
        expect(isReceipt({ ...receipt, paymentStatus: "MAYBE" })).toBe(false);
        expect(
            isReceipt({ ...receipt, latestPayment: { provider: "X" } }),
        ).toBe(false);
        expect(isReceipt(null)).toBe(false);
    });

    it("accepts a complete intent, with or without a public key", () => {
        expect(isIntent(intent)).toBe(true);
        expect(isIntent({ ...intent, publicKey: "rzp_test_1" })).toBe(true);
    });

    it.each(Object.keys(intent))("refuses an intent missing %s", (field) => {
        const { [field]: _omit, ...rest } = intent as Record<string, unknown>;
        expect(isIntent(rest)).toBe(false);
    });

    it("refuses an intent whose amount is not a number", () => {
        expect(isIntent({ ...intent, amountCents: "4800" })).toBe(false);
    });
});
