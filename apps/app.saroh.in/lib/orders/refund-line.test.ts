import { describe, expect, it } from "vitest";

import { refundLines } from "./refund-line";

/**
 * B9 (DEC-067): after a cancel, the refund reads "Refund on its way" until
 * the provider's webhook confirms it — never "Refunded" before then.
 */
const f = (a: number) => `₹${a.toFixed(0)}`;
const none = { refundsBeingConfirmed: [], refundsOnTheWay: [] };

describe("refundLines", () => {
    it("a cancel the provider accepted reads Refund on its way, not Refunded", () => {
        expect(
            refundLines(
                {
                    refunded: "480.00",
                    refundsBeingConfirmed: [],
                    refundsOnTheWay: [{ id: "r1", amount: "480.00" }],
                },
                "REFUNDED",
                f,
            ),
        ).toEqual({ done: null, onTheWay: "Refund on its way · ₹480" });
    });

    it("once the webhook confirms it, it reads Refunded in full", () => {
        expect(
            refundLines({ refunded: "480.00", ...none }, "REFUNDED", f),
        ).toEqual({ done: "Refunded in full", onTheWay: null });
    });

    it("a part landed and a part on its way says both", () => {
        expect(
            refundLines(
                {
                    refunded: "300.00",
                    refundsBeingConfirmed: [],
                    refundsOnTheWay: [{ id: "r2", amount: "180.00" }],
                },
                "PARTLY_REFUNDED",
                f,
            ),
        ).toEqual({
            done: "Refunded ₹120",
            onTheWay: "Refund on its way · ₹180",
        });
    });

    it("an answer that was lost is its own notice, not Refunded", () => {
        expect(
            refundLines(
                {
                    refunded: "480.00",
                    refundsBeingConfirmed: [{ id: "r3", amount: "480.00" }],
                    refundsOnTheWay: [],
                },
                "REFUNDED",
                f,
            ),
        ).toEqual({ done: null, onTheWay: null });
    });

    it("a refund the provider failed is not refunded: nothing to say here", () => {
        // The API leaves a failed refund out of `refunded` (Home raises it).
        expect(refundLines({ refunded: "0.00", ...none }, "NONE", f)).toEqual({
            done: null,
            onTheWay: null,
        });
    });

    it("an older API without refundsOnTheWay reads as before", () => {
        expect(
            refundLines(
                { refunded: "120.00", refundsBeingConfirmed: [] },
                "PARTLY_REFUNDED",
                f,
            ),
        ).toEqual({ done: "Refunded ₹120", onTheWay: null });
    });
});
