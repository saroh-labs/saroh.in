import { describe, expect, it } from "vitest";

import { payingWords } from "./look-paying";
import {
    cancelDeadline,
    cancelText,
    finalLabel,
    HOLD_MINUTES,
    holdBeforeText,
    lookGstText,
    lookSteps,
    nextLabel,
    stepCount,
    stepCountText,
    stepTitle,
} from "./look-words";
import type { BookingService } from "./model";

/** The words a look's booking says (DEC-172, plan U10), pure. */

const ZONE = "Asia/Kolkata";
const START = "2026-10-22T02:30:00.000Z"; // Thu 22 Oct, 8 am

const SERVICE: BookingService = {
    id: "s",
    name: "Private session",
    description: null,
    durationMinutes: 60,
    kind: "one",
    capacity: 1,
    priceCents: 250_000,
    currency: "INR",
    online: false,
    staff: ["Meera Iyer"],
    gst: {
        mode: "INCLUDED",
        rate: "18",
        listCents: 250_000,
        gstCents: 38_136,
        payCents: 250_000,
    },
};

describe("the steps a customer sees, counted honestly", () => {
    it("asks Who only with a choice of person, and Pay only with a way to choose", () => {
        expect(lookSteps({ asksWho: true, asksPay: true })).toEqual([
            "what",
            "who",
            "when",
            "details",
            "pay",
        ]);
        expect(lookSteps({ asksWho: false, asksPay: false })).toEqual([
            "what",
            "when",
            "details",
        ]);
    });

    it("counts from the step they arrived on", () => {
        const steps = lookSteps({ asksWho: true, asksPay: true });
        expect(stepCount(steps, "who", "what")).toEqual({ at: 2, of: 5 });
        expect(stepCount(steps, "details", "details")).toEqual({
            at: 1,
            of: 2,
        });
        expect(stepCountText({ at: 1, of: 2 })).toBe("Step 1 of 2");
        expect(stepCountText({ at: 1, of: 1 })).toBe("Last step");
        // Gone back before where they arrived: the count grows to hold it.
        expect(stepCount(steps, "what", "when")).toEqual({ at: 1, of: 5 });
    });

    it("asks each step's question the same in every look", () => {
        expect(stepTitle("what", null)).toBe("What would you like to book?");
        expect(stepTitle("who", null)).toBe("Who would you like?");
        expect(stepTitle("when", SERVICE)).toBe("When suits you?");
        expect(stepTitle("when", { ...SERVICE, visits: 3 })).toBe(
            "When suits you for your first visit?",
        );
        expect(stepTitle("pay", null)).toBe("How would you like to pay?");
    });
});

describe("the step's button", () => {
    it("says what happens and how much", () => {
        expect(
            finalLabel({ pay: "NOW", payingNow: "₹2,500", waitMode: null }),
        ).toBe("Pay ₹2,500 and book");
        expect(
            finalLabel({ pay: "DEPOSIT", payingNow: "₹500", waitMode: null }),
        ).toBe("Pay ₹500 and book");
        expect(
            finalLabel({ pay: "DESK", payingNow: "₹2,500", waitMode: null }),
        ).toBe("Confirm booking");
        expect(
            finalLabel({ pay: "CREDIT", payingNow: "", waitMode: null }),
        ).toBe("Confirm booking");
        expect(
            finalLabel({ pay: "DESK", payingNow: "", waitMode: "join" }),
        ).toBe("Join the waitlist");
        expect(nextLabel("when")).toBe("Next: pick a time");
        expect(nextLabel("pay")).toBe("Next: pay");
    });
});

describe("the free-cancel deadline", () => {
    it("is the start less the business's own window", () => {
        expect(cancelDeadline(START, 6)?.toISOString()).toBe(
            "2026-10-21T20:30:00.000Z",
        );
        expect(cancelDeadline(START, null)).toBeNull();
    });

    it("is said in the business's time, and not once it has passed", () => {
        const before = Date.parse("2026-10-20T00:00:00.000Z");
        expect(cancelText(START, 6, ZONE, before)).toBe(
            "Move or cancel free until Thu 22 Oct, 2:00 am.",
        );
        const after = Date.parse("2026-10-21T21:00:00.000Z");
        expect(cancelText(START, 6, ZONE, after)).toBeNull();
        expect(cancelText(START, null, ZONE, before)).toBeNull();
    });
});

describe("money until the receipt", () => {
    it("says the GST with no paise", () => {
        const words = lookGstText(SERVICE);
        expect(words).toBe(
            "Includes GST at 18%. The receipt shows the exact amount.",
        );
        expect(words).not.toMatch(/\.\d\d/);
        expect(lookGstText({ ...SERVICE, gst: null })).toBeNull();
    });

    it("holds a pay-now time for 15 minutes from the press", () => {
        expect(HOLD_MINUTES).toBe(15);
        expect(holdBeforeText("8 am")).toBe(
            "Paying now? We hold 8 am for you for 15 minutes from when you press Pay.",
        );
    });
});

describe("paying says only what is known", () => {
    const words = (status: Parameters<typeof payingWords>[0]["status"]) =>
        payingWords({ status, started: true, payError: null });

    it("paid but not confirmed yet: wait, and don't pay twice", () => {
        expect(words("paid").title).toBe(
            "Waiting for your payment to come through",
        );
        expect(words("paid").body).toMatch(/no need to pay again/);
        expect(words("paid").problem).toBe(false);
    });

    it("refused: try again or pay at the desk", () => {
        expect(words("failed")).toEqual({
            title: "The payment didn't go through",
            body: "Try again, or pay at the desk instead.",
            problem: true,
        });
    });

    it("the window open, closed, or not starting", () => {
        expect(words("open").title).toBe("Pay in the payment window");
        expect(words("closed").body).toBe(
            "Nothing was paid. Pay when you're ready.",
        );
        expect(
            payingWords({ status: "idle", started: false, payError: null })
                .title,
        ).toBe("Starting the payment…");
        expect(
            payingWords({
                status: "idle",
                started: true,
                payError: "No provider",
            }),
        ).toMatchObject({ body: "No provider", problem: true });
    });

    it("never claims a payment went through, nor that a UPI app was used", () => {
        for (const status of [
            "open",
            "closed",
            "failed",
            "unavailable",
        ] as const) {
            expect(words(status).title).not.toMatch(/paid|received/i);
        }
        expect(words("open").body).not.toMatch(/UPI/);
    });
});
