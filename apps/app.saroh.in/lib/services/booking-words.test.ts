import { describe, expect, it } from "vitest";

import { BOOKING_WORDS, outcomeWord } from "./booking-words";

describe("one word for each thing in Bookings (DEC-170, U18)", () => {
    it("says how a booking went: Came, Didn't come, Not marked yet", () => {
        expect(outcomeWord("ATTENDED")).toBe("Came");
        expect(outcomeWord("NO_SHOW")).toBe("Didn't come");
        expect(outcomeWord(null)).toBe("Not marked yet");
    });

    it("keeps the retired words out", () => {
        const said = Object.values(BOOKING_WORDS).join(" | ");
        for (const old of [
            "To confirm",
            "No-show",
            "Check in",
            "Attended",
            "Pay link",
            "session",
            "Create booking",
        ]) {
            expect(said).not.toContain(old);
        }
        expect(BOOKING_WORDS.awaitingPayment).toBe("Awaiting payment");
        expect(BOOKING_WORDS.paysAtVisit).toBe("Pays at the visit");
        expect(BOOKING_WORDS.markArrived).toBe("Mark arrived");
    });
});
