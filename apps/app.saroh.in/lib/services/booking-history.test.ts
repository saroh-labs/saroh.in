import { describe, expect, it } from "vitest";

import { namesWho, systemEventTitle } from "./booking-history";

describe("booking history: lines nobody's hand made (#1137)", () => {
    it("a lapsed hold reads as a lapse, not a cancel", () => {
        expect(systemEventTitle({ type: "LAPSED" })).toBe(
            "Lapsed: not paid in time",
        );
    });

    it("a refund names its amount and where it went", () => {
        expect(
            systemEventTitle({
                type: "REFUNDED",
                data: {
                    amountCents: 50_000,
                    currency: "INR",
                    refundId: "r1",
                    outcome: "SENT",
                },
            }),
        ).toBe("Refunded ₹500 to how they paid");
    });

    it("a refund with no readable amount still says it was refunded", () => {
        expect(systemEventTitle({ type: "REFUNDED", data: null })).toBe(
            "Refunded to how they paid",
        );
        expect(
            systemEventTitle({ type: "REFUNDED", data: { currency: "INR" } }),
        ).toBe("Refunded to how they paid");
    });

    it("a refused refund says it failed", () => {
        expect(
            systemEventTitle({
                type: "REFUND_FAILED",
                data: { amountCents: 50_000, currency: "INR" },
            }),
        ).toBe("Refund failed");
    });

    it("leaves every other kind to the card", () => {
        expect(systemEventTitle({ type: "CANCELLED" })).toBeNull();
        expect(systemEventTitle({ type: "BOOKED" })).toBeNull();
    });

    it("names who did it only for a person's change", () => {
        expect(namesWho({ type: "CANCELLED" })).toBe(true);
        expect(namesWho({ type: "BOOKED" })).toBe(true);
        expect(namesWho({ type: "LAPSED" })).toBe(false);
        expect(namesWho({ type: "REFUNDED" })).toBe(false);
        expect(namesWho({ type: "REFUND_FAILED" })).toBe(false);
    });
});
