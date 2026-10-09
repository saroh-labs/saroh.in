import { describe, expect, it } from "vitest";

import { cancelMoney, cancelWords } from "./cancel-money";
import type { OrderReadMoney } from "./read";

const format = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function money(over: Partial<OrderReadMoney> = {}): OrderReadMoney {
    return {
        currency: "INR",
        subtotal: "480.00",
        tax: "0.00",
        shipping: "0.00",
        discount: "0.00",
        total: "480.00",
        paid: "480.00",
        refunded: "0.00",
        refundedByHand: "0.00",
        leftToRefund: "480.00",
        due: "0.00",
        recordedByHand: false,
        discountCode: null,
        refundsBeingConfirmed: [],
        ...over,
    };
}

describe("cancelMoney", () => {
    it("nothing paid: nothing goes back", () => {
        expect(cancelMoney(money(), "unpaid")).toEqual({
            amount: 0,
            already: 0,
        });
    });

    it("paid online, ₹100 refunded by hand: ₹380 is left to go back", () => {
        const m = money({
            refunded: "100.00",
            refundedByHand: "100.00",
            leftToRefund: "380.00",
        });
        expect(cancelMoney(m, "online")).toEqual({ amount: 380, already: 100 });
    });

    it("paid by hand, part handed back: what is left, not the total", () => {
        const m = money({
            recordedByHand: true,
            refunded: "200.00",
            refundedByHand: "200.00",
            leftToRefund: "280.00",
        });
        expect(cancelMoney(m, "by-hand")).toEqual({
            amount: 280,
            already: 200,
        });
    });

    it("an API before #865: paid less refunded online, the total by hand", () => {
        const old = money({ refunded: "80.00", leftToRefund: undefined });
        expect(cancelMoney(old, "online")).toEqual({
            amount: 400,
            already: 80,
        });
        expect(
            cancelMoney(
                money({ refunded: "0.00", leftToRefund: undefined }),
                "by-hand",
            ),
        ).toEqual({ amount: 480, already: 0 });
    });
});

describe("cancelWords", () => {
    const base = { refundTo: "Razorpay", format };

    it("online, nothing refunded yet: how much goes back, and where", () => {
        expect(
            cancelWords({ ...base, paid: "online", amount: 480, already: 0 }),
        ).toEqual({
            says: "₹480 goes back to Razorpay, in 3–5 days. Its stock goes back on the shelf once the refund is confirmed.",
            confirm: "Refund ₹480",
        });
    });

    it("online after a refund by hand: only what is left goes back", () => {
        expect(
            cancelWords({ ...base, paid: "online", amount: 380, already: 100 }),
        ).toEqual({
            says: "₹100 has already been refunded, so the ₹380 left goes back to Razorpay, in 3–5 days. Its stock goes back on the shelf once the refund is confirmed.",
            confirm: "Refund ₹380",
        });
    });

    it("paid by hand: the till gives back what is left", () => {
        expect(
            cancelWords({
                paid: "by-hand",
                amount: 280,
                already: 200,
                refundTo: "the till",
                format,
            }),
        ).toEqual({
            says: "₹200 has already been refunded, so give the ₹280 left back from the till. Its stock goes back on the shelf.",
            confirm: "Refund ₹280",
        });
        expect(
            cancelWords({
                paid: "by-hand",
                amount: 480,
                already: 0,
                refundTo: "the till",
                format,
            }).says,
        ).toBe(
            "Give ₹480 back from the till. Its stock goes back on the shelf.",
        );
    });

    it("nothing left: the cancel hands nothing back", () => {
        expect(
            cancelWords({ ...base, paid: "online", amount: 0, already: 480 }),
        ).toEqual({
            says: "Everything paid has already been refunded, so nothing more goes back. Its stock goes back on the shelf.",
            confirm: "Cancel order",
        });
    });

    it("unpaid: it just cancels", () => {
        expect(
            cancelWords({ ...base, paid: "unpaid", amount: 0, already: 0 }),
        ).toEqual({
            says: "Nothing was paid, so nothing goes back. Its stock goes back on the shelf.",
            confirm: "Cancel order",
        });
    });

    it("without a money read, it names no amount", () => {
        expect(
            cancelWords({
                ...base,
                format: null,
                paid: "online",
                amount: 380,
                already: 100,
            }),
        ).toEqual({
            says: "What's left goes back to Razorpay, in 3–5 days. Its stock goes back on the shelf once the refund is confirmed.",
            confirm: "Cancel order",
        });
    });
});
