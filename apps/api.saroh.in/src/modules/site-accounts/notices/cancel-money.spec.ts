import type { CancelMoney } from "./cancel-money";
import {
    cancelMoneyWords,
    orderCancelMoney,
    windowWords,
} from "./cancel-money";

/**
 * Every cancel notice's money line (DEC-174 U13, #1144): one set of words
 * for a booking, a class and an order, never claiming a refund that isn't
 * happening.
 */
const words = (m: CancelMoney | null, classCancelled = false) =>
    cancelMoneyWords(m, "Hill Road Bakery", { classCancelled });

describe("cancel money words (U13)", () => {
    it("refunded, partly refunded, kept, credit back, nothing paid", () => {
        expect(
            words({
                state: "REFUNDING",
                amountMinor: 120_000,
                currency: "INR",
            }),
        ).toBe("₹1,200 is being refunded to how you paid.");
        expect(
            words({
                state: "PARTLY_REFUNDED",
                amountMinor: 70_000,
                restMinor: 50_000,
                currency: "INR",
            }),
        ).toBe(
            "₹700 is being refunded to how you paid; Hill Road Bakery will return the other ₹500.",
        );
        expect(
            words({
                state: "KEPT",
                amountMinor: 50_000,
                currency: "INR",
                window: "24 hours",
            }),
        ).toBe("As the cancel was within 24 hours, the ₹500 is kept.");
        expect(words({ state: "PACK_BACK", left: 4 })).toBe(
            "Your class credit is back: 4 left.",
        );
        expect(words({ state: "NOTHING_TAKEN" })).toBe("No payment was taken.");
    });

    it("says what is true when no refund is going", () => {
        expect(
            words({
                state: "KEPT",
                amountMinor: 50_000,
                currency: "INR",
                window: null,
            }),
        ).toBe("As it was cancelled late, the ₹500 is kept.");
        expect(
            words({ state: "BY_HAND", amountMinor: 61_000, currency: "INR" }),
        ).toBe("Hill Road Bakery will return the ₹610 you paid.");
        expect(words({ state: "PACK_USED", window: "24 hours" })).toBe(
            "As the cancel was within 24 hours, the class from your pack is used.",
        );
        expect(words({ state: "PACK_USED", window: null })).toBe(
            "As it was cancelled late, the class from your pack is used.",
        );
        expect(
            words({
                state: "REFUND_FAILED",
                amountMinor: 50_000,
                currency: "INR",
            }),
        ).toBe(
            "The refund of ₹500 didn't go through. Ask Hill Road Bakery about it.",
        );
        expect(words(null)).toBeNull();
    });

    it("a class the business cancelled keeps U17's pack words", () => {
        expect(words({ state: "PACK_BACK", left: 1 }, true)).toBe(
            "The class is back in your pack: 1 class left.",
        );
    });

    it("the window reads in hours, in days from two of them", () => {
        expect(windowWords(1)).toBe("1 hour");
        expect(windowWords(24)).toBe("24 hours");
        expect(windowWords(36)).toBe("36 hours");
        expect(windowWords(72)).toBe("3 days");
    });
});

describe("an order cancel's money, from the outcome the sheet shows (U13)", () => {
    it("all of it going back online", () => {
        expect(
            orderCancelMoney({
                refund: { amountCents: 120_000, currency: "INR" },
                byHand: null,
                nothingTaken: false,
            }),
        ).toEqual({
            state: "REFUNDING",
            amountMinor: 120_000,
            currency: "INR",
        });
    });

    it("part refused: only the part on its way is said as refunded", () => {
        expect(
            orderCancelMoney({
                refund: {
                    amountCents: 70_000,
                    currency: "INR",
                    refusedCents: 50_000,
                },
                byHand: null,
                nothingTaken: false,
            }),
        ).toEqual({
            state: "PARTLY_REFUNDED",
            amountMinor: 70_000,
            restMinor: 50_000,
            currency: "INR",
        });
    });

    it("all of it refused: never 'is being refunded'", () => {
        expect(
            orderCancelMoney({
                refund: {
                    amountCents: 0,
                    currency: "INR",
                    refusedCents: 50_000,
                },
                byHand: null,
                nothingTaken: false,
            }),
        ).toEqual({
            state: "REFUND_FAILED",
            amountMinor: 50_000,
            currency: "INR",
        });
    });

    it("paid by hand, unpaid, and already all handed back", () => {
        expect(
            orderCancelMoney({
                refund: null,
                byHand: { amountCents: 61_000, currency: "INR" },
                nothingTaken: false,
            }),
        ).toEqual({ state: "BY_HAND", amountMinor: 61_000, currency: "INR" });
        expect(
            orderCancelMoney({
                refund: null,
                byHand: null,
                nothingTaken: true,
            }),
        ).toEqual({ state: "NOTHING_TAKEN" });
        // Paid, and everything already went back: nothing to claim.
        expect(
            orderCancelMoney({
                refund: null,
                byHand: null,
                nothingTaken: false,
            }),
        ).toBeNull();
    });
});
