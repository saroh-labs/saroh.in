import { BadRequestException, ConflictException } from "@nestjs/common";

import { leftToRefundCents } from "./hand-payments";
import { moneyCents, planHandRefund } from "./hand-refund";

/**
 * A refund recorded by hand (#865, DEC-116): the full amount left, or
 * another amount above zero and no more than is left.
 */
const dec = (v: string) => ({ toString: () => v });

describe("what is left to refund", () => {
    it("is what was paid by hand less what went back by hand", () => {
        expect(
            leftToRefundCents({
                total: dec("500.00"),
                paymentStatus: "PAID",
                paidByHand: dec("500.00"),
                refundedByHand: dec("120.50"),
                paymentIntents: [],
            }),
        ).toBe(37_950);
    });

    it("takes off online refunds, a line refund among them", () => {
        expect(
            leftToRefundCents({
                total: dec("300.00"),
                paymentStatus: "PAID",
                paidByHand: null,
                refundedByHand: dec("50.00"),
                paymentIntents: [
                    { amountCents: 30_000, refunds: [{ amountCents: 10_000 }] },
                ],
            }),
        ).toBe(15_000);
    });

    it("is nothing once the order is refunded", () => {
        expect(
            leftToRefundCents({
                total: dec("300.00"),
                paymentStatus: "REFUNDED",
                paidByHand: dec("300.00"),
                paymentIntents: [],
            }),
        ).toBe(0);
    });
});

describe("a refund recorded by hand", () => {
    it("with no amount is everything left, in full", () => {
        expect(planHandRefund(undefined, 45_000, "INR")).toEqual({
            amountCents: 45_000,
            full: true,
        });
    });

    it("of another amount is that much, and in full only at what is left", () => {
        expect(planHandRefund("120.50", 45_000, "INR")).toEqual({
            amountCents: 12_050,
            full: false,
        });
        expect(planHandRefund("450", 45_000, "INR")).toEqual({
            amountCents: 45_000,
            full: true,
        });
    });

    it("refuses nothing, a malformed amount, and more than is left", () => {
        expect(() => planHandRefund("0", 45_000, "INR")).toThrow(
            BadRequestException,
        );
        expect(() => planHandRefund("1.234", 45_000, "INR")).toThrow(
            BadRequestException,
        );
        expect(() => planHandRefund("450.01", 45_000, "INR")).toThrow(
            new ConflictException("At most ₹450 can be refunded."),
        );
        expect(() => planHandRefund("1", 0, "INR")).toThrow(
            "Nothing is left to refund on this order.",
        );
    });

    it("reads money as the wire carries it", () => {
        expect(moneyCents(" 49.5 ")).toBe(4_950);
        expect(moneyCents("49.50")).toBe(4_950);
        expect(moneyCents("-1")).toBeNull();
        expect(moneyCents("1e3")).toBeNull();
    });
});
