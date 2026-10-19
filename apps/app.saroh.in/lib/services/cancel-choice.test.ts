import { describe, expect, it } from "vitest";

import type { BookingMoney } from "@/lib/services/booking-money";
import {
    cancelChoice,
    cancelLabel,
    cancelOptions,
} from "@/lib/services/cancel-choice";

/**
 * The cancel sheet's money question (U3, BA-01, Q14): the business's
 * policy picks Refund or Keep; someone who may refund can still refund
 * what the policy keeps; nothing paid is a plain question.
 */
const ZONE = "Asia/Kolkata";
const DEADLINE = "2026-10-18T06:00:00.000Z"; // Sun 18 Oct, 11:30 am IST
const BEFORE = Date.parse("2026-10-17T06:00:00.000Z");
const AFTER = Date.parse("2026-10-19T06:00:00.000Z");

const deposit = (over: Partial<BookingMoney> = {}): BookingMoney => ({
    priceCents: 80000,
    currency: "INR",
    paidOnlineCents: 40000,
    deposit: true,
    dueCents: 40000,
    refund: null,
    refundableCents: 40000,
    refundInTimeCancels: true,
    ...over,
});

const ask = (input: {
    money?: BookingMoney;
    now?: number;
    canRefund?: boolean;
    freeCancelUntil?: string | null;
}) =>
    cancelChoice({
        money: input.money,
        freeCancelUntil:
            input.freeCancelUntil === undefined
                ? DEADLINE
                : input.freeCancelUntil,
        timezone: ZONE,
        now: input.now ?? BEFORE,
        canRefund: input.canRefund ?? false,
        first: "Kabir",
    });

describe("cancelChoice", () => {
    it("in time: Refund is picked by the policy, for anyone (Q14)", () => {
        const c = ask({ money: deposit() });
        if (c.kind !== "money") throw new Error(c.kind);
        expect(c.preset).toBe("refund");
        expect(c.policy).toBe(
            "It's before the free-cancel time (Sun 18 Oct, 11:30 am), so your policy refunds the deposit.",
        );
        expect(c.heading).toBe("The ₹400 deposit");
        expect(c.refund).toEqual({
            label: "Refund ₹400",
            note: "It goes back to how Kabir paid, in 5 to 7 days.",
            disabled: false,
        });
        // The API refunds a cancel in time whenever the policy says so.
        expect(c.keep.disabled).toBe(true);
        expect(cancelLabel(c, "refund")).toBe("Cancel and refund ₹400");
        expect(cancelOptions(c, "refund")).toEqual({});
    });

    it("late: Keep the deposit is picked, and someone who may refund can still", () => {
        const c = ask({ money: deposit(), now: AFTER, canRefund: true });
        if (c.kind !== "money") throw new Error(c.kind);
        expect(c.preset).toBe("keep");
        expect(c.policy).toBe(
            "It's past the free-cancel time (Sun 18 Oct, 11:30 am), so your policy keeps the deposit. You can still refund it.",
        );
        expect(c.keep).toEqual({
            label: "Keep the deposit",
            note: "What your policy says for a late cancel.",
            disabled: false,
        });
        expect(c.refund.disabled).toBe(false);
        expect(cancelLabel(c, "keep")).toBe("Cancel, keep the deposit");
        expect(cancelOptions(c, "keep")).toEqual({});
        // Refund what the policy keeps: the business cancelling.
        expect(cancelOptions(c, "refund")).toEqual({ returnCredit: true });
    });

    it("late, for someone who can't refund: Refund is shown, off, saying why", () => {
        const c = ask({ money: deposit(), now: AFTER, canRefund: false });
        if (c.kind !== "money") throw new Error(c.kind);
        expect(c.preset).toBe("keep");
        expect(c.policy).not.toContain("You can still refund it.");
        expect(c.refund.disabled).toBe(true);
        expect(c.refund.note).toBe(
            "Only someone who can refund payments can give it back.",
        );
        expect(cancelOptions(c, "refund")).toEqual({});
    });

    it("a policy that doesn't refund keeps it, even in time", () => {
        const c = ask({ money: deposit({ refundInTimeCancels: false }) });
        if (c.kind !== "money") throw new Error(c.kind);
        expect(c.preset).toBe("keep");
        expect(c.policy).toBe(
            "Your policy doesn't refund cancellations, so it keeps the deposit.",
        );
    });

    it("a full payment says the payment, never more than was received", () => {
        const c = ask({
            money: deposit({
                deposit: false,
                paidOnlineCents: 80000,
                refundableCents: 60000,
            }),
        });
        if (c.kind !== "money") throw new Error(c.kind);
        expect(c.heading).toBe("The ₹600 paid");
        expect(c.keep.label).toBe("Keep the payment");
        expect(cancelLabel(c, "keep")).toBe("Cancel, keep the payment");
    });

    it("nothing paid online, or already refunded: a plain question", () => {
        expect(ask({}).kind).toBe("plain");
        expect(ask({ money: deposit({ paidOnlineCents: 0 }) }).kind).toBe(
            "plain",
        );
        expect(
            ask({
                money: deposit({
                    refund: {
                        amountCents: 40000,
                        status: "SUCCEEDED",
                        beingConfirmed: false,
                    },
                }),
            }).kind,
        ).toBe("plain");
        const plain = ask({});
        expect(cancelLabel(plain, "keep")).toBe("Cancel booking");
        expect(cancelOptions(plain, "refund")).toEqual({});
    });

    it("a treatment's visit points to its order", () => {
        const c = ask({ money: deposit({ treatmentOrderId: "ord_1" }) });
        expect(c.kind).toBe("visit");
        expect(cancelLabel(c, "keep")).toBe("Cancel visit");
    });
});
