/**
 * What a cancel sends back online (#918, DEC-116): what is left on the
 * order once refunds recorded by hand count, never more than the online
 * payments hold. Pure arithmetic, and the read over a fake transaction.
 */
import { cancelRefundCents, onlineRefundableInTx } from "./order-cancel";

type Refund = {
    amountCents: number;
    status: string;
    providerRefundId: string | null;
};

function fakeTx(
    order: {
        total: string;
        paymentStatus: string;
        paidByHand: string;
        refundedByHand: string;
    } | null,
    payments: {
        amountCents: number;
        providerIntentId: string | null;
        refunds: Refund[];
    }[],
) {
    return {
        order: { findUnique: jest.fn().mockResolvedValue(order) },
        paymentIntent: { findMany: jest.fn().mockResolvedValue(payments) },
    } as unknown as Parameters<typeof onlineRefundableInTx>[0];
}

const paidOnline = (refundedByHand: string) => ({
    total: "480.00",
    paymentStatus: "PAID",
    paidByHand: "0",
    refundedByHand,
});

describe("cancelRefundCents", () => {
    it("is what the payments hold when nothing went back by hand", () => {
        expect(cancelRefundCents(48000, 48000)).toBe(48000);
    });

    it("is what is left on the order after a refund by hand", () => {
        expect(cancelRefundCents(48000, 38000)).toBe(38000);
    });

    it("never more than the payments hold, and never below zero", () => {
        expect(cancelRefundCents(10000, 30000)).toBe(10000);
        expect(cancelRefundCents(48000, -500)).toBe(0);
    });
});

describe("onlineRefundableInTx", () => {
    it("a paid online order, nothing refunded: all of it goes back", async () => {
        const tx = fakeTx(paidOnline("0"), [
            { amountCents: 48000, providerIntentId: "pay_1", refunds: [] },
        ]);
        await expect(onlineRefundableInTx(tx, "o1")).resolves.toEqual({
            leftCents: 48000,
            onlineLeftCents: 48000,
            unanswered: 0,
        });
    });

    it("₹100 handed back by hand: the cancel sends ₹380, though the payment still holds ₹480", async () => {
        const tx = fakeTx(paidOnline("100.00"), [
            { amountCents: 48000, providerIntentId: "pay_1", refunds: [] },
        ]);
        await expect(onlineRefundableInTx(tx, "o1")).resolves.toEqual({
            leftCents: 38000,
            onlineLeftCents: 48000,
            unanswered: 0,
        });
    });

    it("once the rest is on its way online, nothing is left for the cancel to send", async () => {
        const tx = fakeTx(paidOnline("100.00"), [
            {
                amountCents: 48000,
                providerIntentId: "pay_1",
                refunds: [
                    {
                        amountCents: 38000,
                        status: "PENDING",
                        providerRefundId: "rfnd_1",
                    },
                ],
            },
        ]);
        await expect(onlineRefundableInTx(tx, "o1")).resolves.toEqual({
            leftCents: 0,
            onlineLeftCents: 10000,
            unanswered: 0,
        });
    });

    it("counts a refund the provider hasn't answered for", async () => {
        const tx = fakeTx(paidOnline("0"), [
            {
                amountCents: 48000,
                providerIntentId: "pay_1",
                refunds: [
                    {
                        amountCents: 48000,
                        status: "PENDING",
                        providerRefundId: null,
                    },
                ],
            },
        ]);
        await expect(onlineRefundableInTx(tx, "o1")).resolves.toMatchObject({
            leftCents: 0,
            unanswered: 1,
        });
    });

    it("an order paid by hand has nothing to send back online", async () => {
        const tx = fakeTx(
            {
                total: "480.00",
                paymentStatus: "PAID",
                paidByHand: "480.00",
                refundedByHand: "100.00",
            },
            [],
        );
        await expect(onlineRefundableInTx(tx, "o1")).resolves.toEqual({
            leftCents: 0,
            onlineLeftCents: 0,
            unanswered: 0,
        });
    });
});
