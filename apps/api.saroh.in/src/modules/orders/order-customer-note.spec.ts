import { cancelNote, fulfilmentNote, handBackOf } from "./order-customer-note";

/**
 * The note a customer gets when how their order is fulfilled changes (U5,
 * #1136): it says the money is coming back only when the refund went.
 */
const note = (
    differenceCents: number,
    handBack: Parameters<typeof fulfilmentNote>[0]["handBack"],
) =>
    fulfilmentNote({
        orderNumber: "1063",
        currency: "INR",
        type: "PICKUP",
        differenceCents,
        handBack,
    });

describe("the fulfilment change note", () => {
    it("a refund the provider took is coming back", () => {
        const said = note(-4000, { kind: "REFUNDED", refundCents: 4000 });
        expect(said).toMatch(/^Your order #1063 is now for pick-up\./);
        expect(said).toMatch(/of the delivery charge is coming back to you\.$/);
    });

    it("a failed refund says it hasn't gone through, never coming back", () => {
        const said = note(-4000, { kind: "REFUND_FAILED", refundCents: 4000 });
        expect(said).toMatch(
            /We'll refund .+40.*; it hasn't gone through yet\.$/,
        );
        expect(said).not.toMatch(/coming back/);
    });

    it("an unpaid order's total is just lower", () => {
        const said = note(-4000, { kind: "NOT_PAID" });
        expect(said).toMatch(/Your total is .+40.* less\.$/);
        expect(said).not.toMatch(/coming back|refund/);
    });

    it("paid by hand, it is given back by hand", () => {
        expect(note(-4000, { kind: "COUNTER" })).toMatch(
            /We'll give you .+40.* of the delivery charge back\.$/,
        );
    });

    it("more to pay, or no change, says nothing about a refund", () => {
        expect(note(4000, { kind: "NOT_PAID" })).toMatch(
            /more to pay for delivery\.$/,
        );
        expect(note(0, { kind: "NOT_PAID" })).toBe(
            "Your order #1063 is now for pick-up.",
        );
    });
});

describe("what the note may say about money going back", () => {
    it("is a refund only when the provider took it", () => {
        expect(
            handBackOf(
                { settleCents: -4000, byHand: false },
                { amountCents: 4000 },
                null,
            ),
        ).toEqual({ kind: "REFUNDED", refundCents: 4000 });
    });

    it("is a failed refund when handing it back threw", () => {
        expect(
            handBackOf(
                { settleCents: -4000, byHand: false },
                null,
                "Razorpay refused the refund",
            ),
        ).toEqual({ kind: "REFUND_FAILED", refundCents: 4000 });
    });

    it("is by hand when it was paid by hand, and nothing when nothing is owed back", () => {
        expect(
            handBackOf({ settleCents: 0, byHand: true }, null, null),
        ).toEqual({ kind: "COUNTER" });
        expect(
            handBackOf({ settleCents: 0, byHand: false }, null, null),
        ).toEqual({ kind: "NOT_PAID" });
    });
});

describe("the cancel note says what happened to the money (U13, #1144)", () => {
    it("refunded, partly refunded, by hand, nothing paid", () => {
        expect(
            cancelNote(
                "1063",
                { state: "REFUNDING", amountMinor: 120_000, currency: "INR" },
                "Hill Road Bakery",
            ),
        ).toBe(
            "Your order #1063 has been cancelled. ₹1,200 is being refunded to how you paid.",
        );
        expect(
            cancelNote(
                "1063",
                {
                    state: "PARTLY_REFUNDED",
                    amountMinor: 70_000,
                    restMinor: 50_000,
                    currency: "INR",
                },
                "Hill Road Bakery",
            ),
        ).toBe(
            "Your order #1063 has been cancelled. ₹700 is being refunded to how you paid; Hill Road Bakery will return the other ₹500.",
        );
        expect(
            cancelNote(
                "1063",
                { state: "BY_HAND", amountMinor: 61_000, currency: "INR" },
                "Hill Road Bakery",
            ),
        ).toBe(
            "Your order #1063 has been cancelled. Hill Road Bakery will return the ₹610 you paid.",
        );
        expect(
            cancelNote("1063", { state: "NOTHING_TAKEN" }, "Hill Road Bakery"),
        ).toBe("Your order #1063 has been cancelled. No payment was taken.");
        expect(cancelNote("1063", null, "Hill Road Bakery")).toBe(
            "Your order #1063 has been cancelled.",
        );
    });
});
