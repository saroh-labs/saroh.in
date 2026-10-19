import { describe, expect, it } from "vitest";

import { bookingMessage, smsHref, whatsAppHref } from "./booking-message";

const base = {
    customer: "Zara Ahmed",
    service: "Physio assessment",
    withName: "Dr. Meera Iyer",
    startAt: new Date("2026-10-20T10:00:00+05:30").toISOString(),
    timeZone: "Asia/Kolkata",
    zone: "IST",
    business: "Kaya Physio",
} as const;

describe("the message after booking (U8, Q12)", () => {
    it("says who, what, with whom and when, and how it is paid", () => {
        expect(
            bookingMessage({ ...base, pay: { kind: "visit", amount: "₹800" } }),
        ).toBe(
            "Hi Zara, you're booked for Physio assessment with Meera on Tue 20 Oct at 10:00 am (IST) at Kaya Physio. Pay ₹800 at the visit.",
        );
        expect(
            bookingMessage({
                ...base,
                pay: {
                    kind: "link",
                    amount: "₹800",
                    url: "https://pay.example.com/l/x",
                },
            }),
        ).toContain("Pay ₹800 here: https://pay.example.com/l/x");
        expect(
            bookingMessage({ ...base, pay: { kind: "paid", amount: "₹800" } }),
        ).toContain("We've got your ₹800, thank you.");
        expect(bookingMessage({ ...base, pay: { kind: "pack" } })).toContain(
            "It uses one class from your class pack.",
        );
    });

    it("leaves out what it doesn't know", () => {
        expect(
            bookingMessage({
                ...base,
                withName: null,
                business: null,
                zone: "",
                pay: { kind: "visit", amount: null },
            }),
        ).toBe(
            "Hi Zara, you're booked for Physio assessment on Tue 20 Oct at 10:00 am.",
        );
        expect(
            bookingMessage({
                ...base,
                pay: { kind: "link", amount: "₹800", url: null },
            }),
        ).toContain("Pay ₹800 before the visit.");
    });

    it("opens WhatsApp and Messages with it, to their number", () => {
        expect(whatsAppHref("+91 90000 54321", "Hi Zara")).toBe(
            "https://wa.me/919000054321?text=Hi%20Zara",
        );
        // Saved without its code: read as the phone field reads it.
        expect(whatsAppHref("90000 54321", "Hi")).toBe(
            "https://wa.me/919000054321?text=Hi",
        );
        expect(whatsAppHref(null, "Hi")).toBe("https://wa.me/?text=Hi");
        expect(smsHref("+91 90000 54321", "Hi Zara")).toBe(
            "sms:+919000054321?&body=Hi%20Zara",
        );
        expect(smsHref("", "Hi")).toBe("sms:?&body=Hi");
    });
});
