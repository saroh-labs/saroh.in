import { describe, expect, it } from "vitest";

import { isIntent } from "./checkout-shape";

/**
 * Code review of #322: every field the pay page hands to the provider's
 * window is checked, so a 200 in the wrong shape never reaches it.
 */
describe("a payment's start", () => {
    const intent = {
        paymentIntentId: "pi_1",
        provider: "RAZORPAY",
        providerIntentId: "order_1",
        amountCents: 4800,
        currency: "GBP",
        publicKey: null,
        clientParams: {},
    };

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
