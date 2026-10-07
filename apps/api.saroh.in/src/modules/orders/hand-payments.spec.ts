import { heldCents, refundedByHandNote } from "./hand-payments";

/**
 * Record as refunded (UX-061): the timeline says how much went back and
 * how — the amount is what the order still held of what was paid.
 */
const dec = (v: string) => ({ toString: () => v });

describe("what a refund by hand hands back", () => {
    it("is what was paid by hand", () => {
        expect(
            heldCents({
                total: dec("500.00"),
                paymentStatus: "PAID",
                paidByHand: dec("450.00"),
                paymentIntents: [],
            }),
        ).toBe(45_000);
    });

    it("is the total when it was marked paid before amounts were kept", () => {
        expect(
            heldCents({
                total: dec("120.00"),
                paymentStatus: "PAID",
                paidByHand: null,
                paymentIntents: [],
            }),
        ).toBe(12_000);
    });

    it("is online money less what was refunded already", () => {
        expect(
            heldCents({
                total: dec("300.00"),
                paymentStatus: "PAID",
                paidByHand: null,
                paymentIntents: [
                    { amountCents: 30_000, refunds: [{ amountCents: 5_000 }] },
                ],
            }),
        ).toBe(25_000);
    });
});

describe("how a refund by hand reads", () => {
    it("says how it went back, with no amount", () => {
        expect(refundedByHandNote("CASH")).toBe("Handed back in cash");
        expect(refundedByHandNote("UPI")).toBe("Handed back by UPI");
        expect(refundedByHandNote(undefined)).toBe(
            "Recorded as refunded by hand",
        );
    });
});
