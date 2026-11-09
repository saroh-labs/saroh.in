import { describe, expect, it } from "vitest";

import { indiaOnlyWord } from "./india-only";

describe("indiaOnlyWord (stage 9)", () => {
    it.each([
        ["GST invoices", "GST"],
        ["Your GSTIN on every bill", "GSTIN"],
        ["Take UPI payments", "UPI"],
        ["₹500 a month", "₹"],
        ["Prices in rupees", "rupee"],
        ["Rounded to the paise", "paise"],
        ["Razorpay checkout", "Razorpay"],
        ["Cashfree payouts", "Cashfree"],
        ["Delivery by PIN code", "PIN"],
    ])("finds it in %j", (text, word) => {
        expect(indiaOnlyWord(text)).toBe(word);
    });

    it("leaves ordinary words alone", () => {
        for (const text of [
            "Pin your best products",
            "Invoices with your tax ID",
            "Upgrade any time",
            "Gusty weather",
        ]) {
            expect(indiaOnlyWord(text)).toBeNull();
        }
    });
});
