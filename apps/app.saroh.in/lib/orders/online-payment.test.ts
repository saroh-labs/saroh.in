import { describe, expect, it } from "vitest";

import { onlinePaymentLine, onlinePaymentWords } from "./online-payment";

/**
 * An order's online payment in words (#122): what happened, and the next
 * step — never a colour alone.
 */
describe("onlinePaymentWords", () => {
    it("a failed payment says so, names the provider and offers a new pay link", () => {
        const words = onlinePaymentWords(
            { state: "FAILED", provider: "RAZORPAY" },
            true,
        );
        expect(words.word).toBe("Payment failed");
        expect(words.next).toBe("send a new pay link");
        expect(words.tone).toBe("act");
        expect(words.detail).toBe(
            "Razorpay said the payment didn't go through, so nothing was taken. Send a new pay link, or take it at the counter.",
        );
    });

    it("waiting names the provider and asks only to wait", () => {
        const words = onlinePaymentWords(
            { state: "WAITING", provider: "CASHFREE" },
            true,
        );
        expect(words.word).toBe("Waiting for Cashfree");
        expect(words.next).toBe("the customer started paying");
        expect(words.tone).toBe("wait");
        expect(words.detail).toContain("once Cashfree confirms it");
    });

    it("a payment not finished offers a new pay link", () => {
        const words = onlinePaymentWords(
            { state: "NOT_FINISHED", provider: "RAZORPAY" },
            true,
        );
        expect(words.word).toBe("Payment not finished");
        expect(words.next).toBe("send a new pay link");
        expect(words.tone).toBe("act");
    });

    it("without a pay link to send, the next step is not to start it", () => {
        for (const state of ["FAILED", "NOT_FINISHED"] as const) {
            const words = onlinePaymentWords(
                { state, provider: "RAZORPAY" },
                false,
            );
            expect(words.next).toBe("not paid yet");
            expect(words.detail).toContain("Don't start it until it's paid.");
            expect(words.detail).not.toContain("pay link");
        }
    });
});

describe("onlinePaymentLine", () => {
    it("is the row's one line, or nothing", () => {
        expect(
            onlinePaymentLine({ state: "FAILED", provider: "RAZORPAY" }, true),
        ).toEqual({
            text: "Payment failed — send a new pay link",
            tone: "act",
        });
        expect(
            onlinePaymentLine(
                { state: "WAITING", provider: "RAZORPAY" },
                false,
            ),
        ).toEqual({
            text: "Waiting for Razorpay — the customer started paying",
            tone: "wait",
        });
        expect(onlinePaymentLine(null, true)).toBeNull();
        expect(onlinePaymentLine(undefined, true)).toBeNull();
    });
});
