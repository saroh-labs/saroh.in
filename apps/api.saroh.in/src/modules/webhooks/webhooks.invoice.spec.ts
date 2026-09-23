// DB-free unit tests for webhook reconciliation of an INVOICE pay-link intent
// (ADR-007, U13). The order-payment reconciliation keeps its own spec
// (webhooks.service.spec.ts), which runs unchanged. @saroh/database is mocked;
// `$transaction` runs its callback against the same mocked client, so the
// invoice row lock and every write are asserted in one transaction.
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        merchantPaymentProvider: { findUnique: jest.fn() },
        webhookEvent: { create: jest.fn(), update: jest.fn() },
        paymentIntent: { findFirst: jest.fn(), update: jest.fn() },
        paymentAttempt: { create: jest.fn() },
        paymentRefund: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        order: { findUnique: jest.fn(), update: jest.fn() },
        invoice: { findFirst: jest.fn(), update: jest.fn() },
        $queryRaw: jest.fn(),
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { encryptSecret } from "../payments/crypto";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "./providers/fake.webhook";
import { WebhooksService } from "./webhooks.service";

const providerFindUnique = prisma.merchantPaymentProvider
    .findUnique as jest.Mock;
const whCreate = prisma.webhookEvent.create as jest.Mock;
const whUpdate = prisma.webhookEvent.update as jest.Mock;
const intentFindFirst = prisma.paymentIntent.findFirst as jest.Mock;
const intentUpdate = prisma.paymentIntent.update as jest.Mock;
const attemptCreate = prisma.paymentAttempt.create as jest.Mock;
const refundFindFirst = prisma.paymentRefund.findFirst as jest.Mock;
const refundCreate = prisma.paymentRefund.create as jest.Mock;
const refundUpdate = prisma.paymentRefund.update as jest.Mock;
const orderFindUnique = prisma.order.findUnique as jest.Mock;
const orderUpdate = prisma.order.update as jest.Mock;
const invoiceFindFirst = prisma.invoice.findFirst as jest.Mock;
const invoiceUpdate = prisma.invoice.update as jest.Mock;
const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

const SECRET = "whsec_test_secret";

function providerRow() {
    const sealed = encryptSecret(
        JSON.stringify({ keyId: "k", keySecret: "s", webhookSecret: SECRET }),
    );
    return {
        id: "mpp_1",
        organizationId: "org_1",
        provider: "RAZORPAY",
        status: "CONNECTED",
        publicKey: null,
        encryptedCredentials: sealed.ciphertext,
        credentialsIv: sealed.iv,
        credentialsAuthTag: sealed.authTag,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    };
}

const INTENT = {
    id: "pi_inv_1",
    organizationId: "org_1",
    provider: "RAZORPAY",
    orderId: null,
    invoiceId: "inv_1",
    providerIntentId: "prov_intent_1",
    status: "REQUIRES_PAYMENT",
    amountCents: 120000,
    currency: "INR",
};

function sign(raw: Buffer): string {
    return createHmac("sha256", SECRET).update(raw).digest("hex");
}

function bodyOf(over: Record<string, unknown> = {}): Buffer {
    return Buffer.from(
        JSON.stringify({
            providerEventId: "evt_1",
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: "prov_intent_1",
            providerPaymentRef: "pay_1",
            ...over,
        }),
    );
}

function makeService() {
    return new WebhooksService(
        new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
        new PaymentsService(
            new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
        ),
    );
}

async function deliver(raw: Buffer) {
    return makeService().handle("razorpay", "org_1", raw, {
        "x-fake-signature": sign(raw),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    providerFindUnique.mockResolvedValue(providerRow());
    whCreate.mockResolvedValue({ id: "wh_1" });
});

describe("webhook success on an invoice intent", () => {
    it("moves an ISSUED invoice to PAID under its row lock, recorded as paid online", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT });
        invoiceFindFirst.mockResolvedValue({ status: "ISSUED" });

        const result = await deliver(bodyOf());

        expect(result).toEqual({ status: "processed", changed: true });
        // The lock is taken before the invoice is read or written.
        expect(queryRaw).toHaveBeenCalledTimes(1);
        const [lockCall] = queryRaw.mock.invocationCallOrder;
        const [readCall] = invoiceFindFirst.mock.invocationCallOrder;
        expect(lockCall).toBeLessThan(readCall ?? 0);
        expect(invoiceFindFirst).toHaveBeenCalledWith({
            where: { id: "inv_1", organizationId: "org_1" },
            select: { status: true },
        });
        expect(invoiceUpdate).toHaveBeenCalledWith({
            where: { id: "inv_1" },
            data: {
                status: "PAID",
                paidAt: expect.any(Date),
                paymentMethod: "ONLINE",
                paymentReference: "pay_1",
                paymentNote: "Paid online through Razorpay",
            },
        });
        expect(intentUpdate).toHaveBeenCalledWith({
            where: { id: "pi_inv_1" },
            data: { status: "SUCCEEDED" },
        });
        expect(attemptCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                providerRef: "pay_1",
                status: "CAPTURED",
            }),
        });
        // An invoice intent never touches an order.
        expect(orderFindUnique).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("is a no-op for a second event on an intent that already SUCCEEDED (payment.captured then order.paid)", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        invoiceFindFirst.mockResolvedValue({ status: "PAID" });

        const result = await deliver(
            bodyOf({ providerEventId: "evt_2", eventType: "order.paid" }),
        );

        expect(result).toEqual({ status: "ignored", changed: false });
        expect(invoiceUpdate).not.toHaveBeenCalled();
        expect(intentUpdate).not.toHaveBeenCalled();
        // Above all, not recorded as a payment needing a refund.
        expect(attemptCreate).not.toHaveBeenCalled();
    });

    it("a duplicate delivery (same event id) writes nothing", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT });
        whCreate.mockRejectedValueOnce({ code: "P2002" });

        const result = await deliver(bodyOf());

        expect(result).toEqual({ status: "duplicate", changed: false });
        expect(queryRaw).not.toHaveBeenCalled();
        expect(invoiceUpdate).not.toHaveBeenCalled();
        expect(intentUpdate).not.toHaveBeenCalled();
    });

    it.each([
        ["VOID", "void-then-success"],
        ["PAID", "cash-then-success"],
    ])(
        "leaves a %s invoice as it was and records the capture as needing a refund (%s)",
        async (status) => {
            intentFindFirst.mockResolvedValue({ ...INTENT });
            invoiceFindFirst.mockResolvedValue({ status });

            const result = await deliver(bodyOf());

            expect(result).toEqual({ status: "processed", changed: true });
            expect(invoiceUpdate).not.toHaveBeenCalled();
            // The money was taken: the intent says so.
            expect(intentUpdate).toHaveBeenCalledWith({
                where: { id: "pi_inv_1" },
                data: { status: "SUCCEEDED" },
            });
            expect(attemptCreate).toHaveBeenCalledTimes(1);
            expect(attemptCreate).toHaveBeenCalledWith({
                data: {
                    organizationId: "org_1",
                    paymentIntentId: "pi_inv_1",
                    provider: "RAZORPAY",
                    providerRef: "pay_1",
                    status: "CAPTURED_NEEDS_REFUND",
                    rawResponse: { invoiceStatus: status },
                },
            });
        },
    );

    it("finds the intent by the merchant reference when the provider sends only that (Cashfree)", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT });
        invoiceFindFirst.mockResolvedValue({ status: "ISSUED" });

        await deliver(
            bodyOf({ providerIntentId: undefined, orderRef: "inv_1" }),
        );

        expect(intentFindFirst).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                provider: "RAZORPAY",
                OR: [{ orderId: "inv_1" }, { invoiceId: "inv_1" }],
            },
            orderBy: { createdAt: "desc" },
        });
        expect(invoiceUpdate).toHaveBeenCalled();
    });
});

describe("webhook failure on an invoice intent", () => {
    it("fails the intent and touches nothing else", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT });

        const result = await deliver(
            bodyOf({ eventType: "payment.failed", outcome: "FAILED" }),
        );

        expect(result).toEqual({ status: "processed", changed: true });
        expect(intentUpdate).toHaveBeenCalledWith({
            where: { id: "pi_inv_1" },
            data: { status: "FAILED" },
        });
        expect(queryRaw).not.toHaveBeenCalled();
        expect(invoiceFindFirst).not.toHaveBeenCalled();
        expect(invoiceUpdate).not.toHaveBeenCalled();
        expect(orderFindUnique).not.toHaveBeenCalled();
    });

    it("never overrides a succeeded intent with a late failure", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });

        const result = await deliver(
            bodyOf({ eventType: "payment.failed", outcome: "FAILED" }),
        );

        expect(result).toEqual({ status: "ignored", changed: false });
        expect(intentUpdate).not.toHaveBeenCalled();
    });
});

describe("webhook refund on an invoice intent", () => {
    it("records the refund and leaves the invoice's status alone", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        refundFindFirst.mockResolvedValue(null);
        refundCreate.mockResolvedValue({ id: "rf_1" });

        const result = await deliver(
            bodyOf({
                eventType: "refund.processed",
                outcome: "REFUNDED",
                providerRefundId: "rfnd_1",
            }),
        );

        expect(result).toEqual({ status: "processed", changed: true });
        expect(refundCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                paymentIntentId: "pi_inv_1",
                amountCents: 120000,
                currency: "INR",
                status: "SUCCEEDED",
                providerRefundId: "rfnd_1",
            },
        });
        expect(invoiceUpdate).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("settles a PENDING refund once, and a repeat is a no-op", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        refundFindFirst.mockResolvedValueOnce({
            id: "rf_1",
            status: "PENDING",
        });
        const raw = bodyOf({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerRefundId: "rfnd_1",
        });

        expect(await deliver(raw)).toEqual({
            status: "processed",
            changed: true,
        });
        expect(refundUpdate).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "SUCCEEDED" },
        });

        refundUpdate.mockClear();
        refundFindFirst.mockResolvedValueOnce({
            id: "rf_1",
            status: "SUCCEEDED",
        });
        expect(
            await deliver(
                bodyOf({
                    providerEventId: "evt_9",
                    eventType: "refund.processed",
                    outcome: "REFUNDED",
                    providerRefundId: "rfnd_1",
                }),
            ),
        ).toEqual({ status: "ignored", changed: false });
        expect(refundUpdate).not.toHaveBeenCalled();
        expect(refundCreate).not.toHaveBeenCalled();
        expect(whUpdate).toHaveBeenCalled();
    });
});
