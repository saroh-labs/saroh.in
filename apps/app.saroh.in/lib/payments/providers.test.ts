import { describe, expect, it } from "vitest";

import { opensCheckout } from "./providers";

describe("opensCheckout (DEC-054)", () => {
    it("counts a connected provider that can open the checkout window", () => {
        expect(
            opensCheckout({
                provider: "RAZORPAY",
                status: "CONNECTED",
                publicKey: "rzp_test_1",
            }),
        ).toBe(true);
        expect(
            opensCheckout({
                provider: "CASHFREE",
                status: "CONNECTED",
                publicKey: null,
            }),
        ).toBe(true);
    });

    it("leaves out a Razorpay connection still missing its public key id", () => {
        expect(
            opensCheckout({
                provider: "RAZORPAY",
                status: "CONNECTED",
                publicKey: null,
            }),
        ).toBe(false);
        expect(
            opensCheckout({
                provider: "razorpay",
                status: "CONNECTED",
                publicKey: "  ",
            }),
        ).toBe(false);
    });

    it("leaves out a connection that isn't connected", () => {
        expect(
            opensCheckout({
                provider: "CASHFREE",
                status: "DISABLED",
                publicKey: null,
            }),
        ).toBe(false);
    });
});
