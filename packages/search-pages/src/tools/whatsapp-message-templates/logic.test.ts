import { describe, expect, it } from "vitest";

import { allMessages, gapNote, message } from "./logic";

const RYE = {
    biz: "Rye Studio",
    name: "Priya",
    what: "Haircut and blow-dry",
    when: "Sat 1 Nov, 11:30 am",
    amount: "2,415",
    visit: "25 Oct",
    upi: "saroh-sample-upi-id@okaxis",
};

describe("WhatsApp message templates", () => {
    it("fills the boards' booking confirmation and payment reminder to the letter", () => {
        expect(message("booking", RYE)).toBe(
            "Hi Priya, your Haircut and blow-dry at Rye Studio is booked for Sat 1 Nov, 11:30 am. Reply here if you need to change it. See you then.",
        );
        expect(message("payment", RYE)).toBe(
            "Hi Priya, a gentle reminder that ₹2,415 for your visit on 25 Oct is still due. You can pay by UPI to saroh-sample-upi-id@okaxis. Thank you, Rye Studio.",
        );
    });

    it("shows each empty detail in brackets", () => {
        expect(message("booking", {})).toBe(
            "Hi [first name], your [what they booked] at [your business] is booked for [date and time]. Reply here if you need to change it. See you then.",
        );
        expect(message("booking", { ...RYE, when: " " })).toContain(
            "booked for [date and time].",
        );
    });

    it("names what's still empty", () => {
        expect(gapNote("booking", { ...RYE, when: "" })).toBe(
            "Date and time is still empty. Fill it in, or the message goes with a gap.",
        );
        expect(gapNote("booking", {})).toBe(
            "Fill in your details and the brackets fill themselves.",
        );
        expect(gapNote("booking", RYE)).toBeNull();
    });

    it("fills all four for the full set", () => {
        expect(allMessages(RYE).map((m) => m.label)).toEqual([
            "Booking confirmation",
            "Payment reminder",
            "Order ready",
            "Thank-you",
        ]);
    });
});
