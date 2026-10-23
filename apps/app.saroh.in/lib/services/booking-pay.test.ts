import { describe, expect, it } from "vitest";

import { offersOnlinePay } from "@/lib/billing/access";
import { offlinePlan, onlinePlan } from "@/lib/billing/fixtures.test-data";

import {
    bookerFor,
    defaultPay,
    PAID_BY_MISSING,
    paidByNote,
    paidWithFor,
    payChoices,
    payInput,
    payNote,
    payProblem,
} from "@/lib/services/booking-pay";

describe("how a booking made by hand is paid (E4)", () => {
    it("offers Pays at the visit first, and as the default, even when a link can be sent (DEC-170)", () => {
        expect(payChoices(true).map((c) => c.label)).toEqual([
            "Pays at the visit",
            "Send a payment link",
            "Paid now",
        ]);
        expect(defaultPay(true)).toBe("DESK");
        // Unpriced, no invoice:write, or no provider: not offered at all.
        expect(payChoices(false).map((c) => c.key)).toEqual(["DESK", "PAID"]);
        expect(defaultPay(false)).toBe("DESK");
    });

    it("books a link unpaid, and says it shows Awaiting payment", () => {
        expect(paidWithFor("LINK")).toBeUndefined();
        expect(paidWithFor("DESK")).toBe("DESK");
        expect(paidWithFor("PAID")).toBe("PAID");
        expect(payNote("LINK")).toBe(
            "You share it on WhatsApp or SMS. Shows Awaiting payment until paid.",
        );
        expect(payNote("DESK", "₹800")).toBe("₹800 to take when they come");
        expect(payNote("PAID")).toBe("Cash, UPI or card, taken already");
    });

    it("says how Paid now was paid, and sends it only with Paid now", () => {
        expect(paidByNote("CASH")).toBe(
            "Recorded as paid in cash. It goes in the till.",
        );
        expect(paidByNote("UPI", "₹800")).toBe(
            "Record it once ₹800 shows on your UPI app.",
        );
        expect(paidByNote("CARD")).toBe(
            "Record it once the card machine approves.",
        );
        expect(payInput("PAID", "UPI")).toEqual({
            paidWith: "PAID",
            paidBy: "UPI",
        });
        expect(payInput("DESK", "UPI")).toEqual({ paidWith: "DESK" });
        expect(payInput("LINK", null)).toEqual({});
    });

    it("names the gap when Paid now has no way picked", () => {
        expect(payProblem("PAID", null)).toBe(PAID_BY_MISSING);
        expect(payProblem("PAID", "CASH")).toBeNull();
        expect(payProblem("DESK", null)).toBeNull();
    });

    it("books someone new by name and phone when there is no email (DEC-170)", () => {
        expect(
            bookerFor({
                kind: "new",
                name: "Zara Ahmed",
                email: "",
                phone: "+91 90000 54321",
            }),
        ).toEqual({ bookerPhone: "+91 90000 54321", bookerName: "Zara Ahmed" });
        // Neither an email nor a phone: nobody to book.
        expect(
            bookerFor({ kind: "new", name: "Zara", email: "", phone: "" }),
        ).toBeNull();
    });

    it("books a contact by id, and someone new by email with what else was given", () => {
        expect(
            bookerFor({
                kind: "contact",
                id: "c_1",
                name: "Priya",
                email: null,
                phone: null,
            }),
        ).toEqual({ contactId: "c_1" });
        expect(
            bookerFor({
                kind: "new",
                name: "Priya Raman",
                email: "priya@example.com",
                phone: "",
            }),
        ).toEqual({
            bookerEmail: "priya@example.com",
            bookerName: "Priya Raman",
        });
    });

    it("can't book nobody, or a walk-in with no record", () => {
        expect(bookerFor(null)).toBeNull();
        expect(bookerFor({ kind: "walk-in", name: "Ravi", phone: "" })).toBe(
            null,
        );
    });
});

describe("New booking's choices on each plan (R33)", () => {
    // What the bookings pages pass as `people.payLink`, a provider connected.
    const offerLink = (plan: Parameters<typeof offersOnlinePay>[0]) =>
        offersOnlinePay(plan, true);

    it("on a plan without online payments: no link, and pays at the visit first", () => {
        const link = offerLink(offlinePlan());
        expect(payChoices(link).map((c) => c.key)).toEqual(["DESK", "PAID"]);
        expect(defaultPay(link)).toBe("DESK");
    });

    it("on a plan with online payments: the link, but Pays at the visit first", () => {
        const link = offerLink(onlinePlan());
        expect(payChoices(link).map((c) => c.key)).toEqual([
            "DESK",
            "LINK",
            "PAID",
        ]);
        expect(defaultPay(link)).toBe("DESK");
    });
});
