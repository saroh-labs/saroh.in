import { describe, expect, it } from "vitest";

import { decodeQr } from "../../test-qr";
import { isUpiId, readAmount, upiLink } from "./logic";

// The boards' sample: Annapurna Sweets, Jaipur, on the sample UPI ID.
const SAMPLE = {
    upiId: "saroh-sample-upi-id@okaxis",
    name: "Annapurna Sweets, Jaipur",
};

describe("upiLink", () => {
    it("writes the board's sample as the UPI deep link, with no amount", () => {
        expect(upiLink(SAMPLE)).toBe(
            "upi://pay?pa=saroh-sample-upi-id@okaxis&pn=Annapurna%20Sweets%2C%20Jaipur&cu=INR",
        );
    });

    it("adds the amount with paise and the note, in NPCI's order", () => {
        expect(
            upiLink({ ...SAMPLE, amount: 250, note: "Order 1042 & tip" }),
        ).toBe(
            "upi://pay?pa=saroh-sample-upi-id@okaxis&pn=Annapurna%20Sweets%2C%20Jaipur&am=250.00&cu=INR&tn=Order%201042%20%26%20tip",
        );
    });

    it("draws a code a camera reads back as the same link", () => {
        const link = upiLink({ ...SAMPLE, amount: 99.5 });
        expect(decodeQr(link)).toBe(link);
    });
});

describe("isUpiId", () => {
    it("takes name@bank and nothing else", () => {
        expect(isUpiId("saroh-sample-upi-id@okaxis")).toBe(true);
        expect(isUpiId(" 9876543210@ybl ")).toBe(true);
        expect(isUpiId("saroh-sample-upi-id okaxis")).toBe(false);
        expect(isUpiId("a@@okaxis")).toBe(false);
        expect(isUpiId("name@bank.com")).toBe(false);
        expect(isUpiId("@okaxis")).toBe(false);
    });
});

describe("readAmount", () => {
    it("reads rupees with up to two decimals, above zero", () => {
        expect(readAmount("1,250")).toBe(1250);
        expect(readAmount("₹ 99.50")).toBe(99.5);
        expect(readAmount("0")).toBeNull();
        expect(readAmount("9.999")).toBeNull();
        expect(readAmount("ten")).toBeNull();
    });
});
