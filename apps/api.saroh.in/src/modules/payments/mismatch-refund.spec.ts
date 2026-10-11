import type { Prisma } from "@saroh/database";

import type { NormalizedWebhookEvent } from "../webhooks/providers/webhook-provider.port";
import {
    attemptOfRefundKey,
    MISMATCH_REFUND_REASON,
    mismatchRefundKey,
    owedOf,
    settleMismatchRefundInTx,
} from "./mismatch-refund";

/**
 * A capture taken at the wrong amount is refunded on its own (PAY-06
 * follow-up): its key, what it owes, and how a refund event about it is
 * settled — never as a refund of the order it failed to pay.
 */

describe("mismatch refund keys", () => {
    it("names the attempt, with a fresh key per try after a refusal", () => {
        expect(mismatchRefundKey("att_1")).toBe("amount-mismatch:att_1");
        expect(mismatchRefundKey("att_1", 2)).toBe("amount-mismatch:att_1:2");
        expect(attemptOfRefundKey("amount-mismatch:att_1")).toBe("att_1");
        expect(attemptOfRefundKey("amount-mismatch:att_1:3")).toBe("att_1");
    });

    it("reads no attempt from any other key", () => {
        expect(attemptOfRefundKey(null)).toBeNull();
        expect(attemptOfRefundKey("deposit-refund:bk_1")).toBeNull();
        expect(attemptOfRefundKey("amount-mismatch:")).toBeNull();
    });
});

describe("owedOf", () => {
    it("is exactly what was captured, in its currency", () => {
        expect(
            owedOf(
                {
                    invoiceStatus: "AMOUNT_MISMATCH",
                    capturedAmountCents: 45000,
                    capturedCurrency: "inr",
                },
                "INR",
            ),
        ).toEqual({ amountCents: 45000, currency: "INR" });
    });

    it("takes the intent's currency when the capture named none", () => {
        expect(owedOf({ capturedAmountCents: 100 }, "INR")).toEqual({
            amountCents: 100,
            currency: "INR",
        });
    });

    it("owes nothing it can't name: no amount, not whole, not positive", () => {
        expect(owedOf(null, "INR")).toBeNull();
        expect(owedOf({ capturedAmountCents: null }, "INR")).toBeNull();
        expect(owedOf({ capturedAmountCents: 10.5 }, "INR")).toBeNull();
        expect(owedOf({ capturedAmountCents: 0 }, "INR")).toBeNull();
    });
});

/** A transaction with only what the settle reads and writes. */
function fakeTx(opts: {
    byProvider?: { id: string; idempotencyKey: string | null } | null;
    byReference?: {
        id: string;
        idempotencyKey: string | null;
        providerRefundId: string | null;
    } | null;
    row?: {
        status: string;
        providerRefundId: string | null;
        amountCents: number;
    };
    attempt?: {
        id: string;
        rawResponse: unknown;
        paymentIntent: { id: string; currency: string };
    } | null;
    made?: { id: string; status: string; idempotencyKey: string }[];
}) {
    const findFirst = jest.fn((args: { where: { id?: string } }) =>
        Promise.resolve(
            args.where.id
                ? (opts.byReference ?? null)
                : (opts.byProvider ?? null),
        ),
    );
    const tx = {
        $queryRaw: jest.fn(() => Promise.resolve([])),
        paymentRefund: {
            findFirst,
            findUniqueOrThrow: jest.fn(() => Promise.resolve(opts.row)),
            findMany: jest.fn(() => Promise.resolve(opts.made ?? [])),
            update: jest.fn(() => Promise.resolve({})),
            create: jest.fn(() => Promise.resolve({})),
        },
        paymentAttempt: {
            findFirst: jest.fn(() => Promise.resolve(opts.attempt ?? null)),
        },
    };
    return tx;
}

const asTx = (tx: ReturnType<typeof fakeTx>) =>
    tx as unknown as Prisma.TransactionClient;

const refunded = (
    over: Partial<NormalizedWebhookEvent> = {},
): NormalizedWebhookEvent => ({
    providerEventId: "evt_1",
    eventType: "refund.processed",
    outcome: "REFUNDED",
    providerIntentId: "order_rzp_1",
    providerPaymentRef: "pay_1",
    providerRefundId: "rfnd_1",
    refundAmountCents: 45000,
    ...over,
});

describe("settleMismatchRefundInTx", () => {
    it("leaves anything but a refund event alone", async () => {
        const tx = fakeTx({});
        await expect(
            settleMismatchRefundInTx(
                asTx(tx),
                "org_1",
                "razorpay",
                refunded({ outcome: "SUCCEEDED" }),
            ),
        ).resolves.toEqual({ handled: false, applied: false });
        expect(tx.paymentRefund.findFirst).not.toHaveBeenCalled();
    });

    it("leaves an order's own refund to the order's path", async () => {
        const tx = fakeTx({
            byProvider: { id: "rf_order", idempotencyKey: "cancel:ord_1" },
        });
        await expect(
            settleMismatchRefundInTx(asTx(tx), "org_1", "razorpay", refunded()),
        ).resolves.toEqual({ handled: false, applied: false });
        expect(tx.paymentRefund.update).not.toHaveBeenCalled();
    });

    it("settles Saroh's own mismatch refund, found by its reference, and nothing else", async () => {
        const tx = fakeTx({
            byReference: {
                id: "rf_1",
                idempotencyKey: mismatchRefundKey("att_1"),
                providerRefundId: null,
            },
            row: {
                status: "PENDING",
                providerRefundId: null,
                amountCents: 45000,
            },
        });
        await expect(
            settleMismatchRefundInTx(
                asTx(tx),
                "org_1",
                "razorpay",
                refunded({ refundReference: "rf_1" }),
            ),
        ).resolves.toEqual({ handled: true, applied: true });
        expect(tx.paymentRefund.update).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "SUCCEEDED", providerRefundId: "rfnd_1" },
        });
        expect(tx.paymentRefund.create).not.toHaveBeenCalled();
    });

    it("a refund already settled is a no-op (a replay)", async () => {
        const tx = fakeTx({
            byProvider: {
                id: "rf_1",
                idempotencyKey: mismatchRefundKey("att_1"),
            },
            row: {
                status: "SUCCEEDED",
                providerRefundId: "rfnd_1",
                amountCents: 45000,
            },
        });
        await expect(
            settleMismatchRefundInTx(asTx(tx), "org_1", "razorpay", refunded()),
        ).resolves.toEqual({ handled: true, applied: false });
        expect(tx.paymentRefund.update).not.toHaveBeenCalled();
    });

    it("a failed refund frees the money again: the mismatch is still owed", async () => {
        const tx = fakeTx({
            byProvider: {
                id: "rf_1",
                idempotencyKey: mismatchRefundKey("att_1"),
            },
            row: {
                status: "PENDING",
                providerRefundId: "rfnd_1",
                amountCents: 45000,
            },
        });
        await expect(
            settleMismatchRefundInTx(
                asTx(tx),
                "org_1",
                "razorpay",
                refunded({ outcome: "REFUND_FAILED" }),
            ),
        ).resolves.toEqual({ handled: true, applied: true });
        expect(tx.paymentRefund.update).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "FAILED", providerRefundId: "rfnd_1" },
        });
    });

    it("records a dashboard refund of a mismatched payment as that mismatch's", async () => {
        const tx = fakeTx({
            attempt: {
                id: "att_1",
                rawResponse: {
                    invoiceStatus: "AMOUNT_MISMATCH",
                    capturedAmountCents: 45000,
                    capturedCurrency: "INR",
                },
                paymentIntent: { id: "pi_1", currency: "INR" },
            },
            made: [
                {
                    id: "rf_old",
                    status: "FAILED",
                    idempotencyKey: mismatchRefundKey("att_1"),
                },
            ],
        });
        await expect(
            settleMismatchRefundInTx(asTx(tx), "org_1", "razorpay", refunded()),
        ).resolves.toEqual({ handled: true, applied: true });
        expect(tx.paymentAttempt.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: "org_1",
                    provider: "razorpay",
                    providerRef: "pay_1",
                }),
            }),
        );
        expect(tx.paymentRefund.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                paymentIntentId: "pi_1",
                amountCents: 45000,
                currency: "INR",
                status: "SUCCEEDED",
                providerRefundId: "rfnd_1",
                reason: MISMATCH_REFUND_REASON,
                idempotencyKey: mismatchRefundKey("att_1", 2),
            },
        });
    });

    it("leaves a dashboard refund of any other payment to its order", async () => {
        const tx = fakeTx({ attempt: null });
        await expect(
            settleMismatchRefundInTx(asTx(tx), "org_1", "razorpay", refunded()),
        ).resolves.toEqual({ handled: false, applied: false });
        expect(tx.paymentRefund.create).not.toHaveBeenCalled();
    });
});
