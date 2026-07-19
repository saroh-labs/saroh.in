// DB-free, network-free unit tests for the signed webhook inbox + exactly-once
// reconciliation (S5-003). @saroh/database is mocked so nothing touches Postgres;
// `$transaction` invokes its callback with the SAME mocked client so reconcile
// writes are asserted in one transaction. env is mocked with a real 32-byte key
// so the REAL AES-256-GCM crypto runs (the org's webhook secret round-trips out
// of a sealed provider row). The webhook provider is a FakeWebhookProvider that
// does a REAL HMAC-SHA256 hex compare — no network, deterministic.
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

import { NotFoundException, UnauthorizedException } from "@nestjs/common";
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
import { DefaultWebhookProviderFactory } from "./providers/webhook-provider.factory";
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

const SECRET = "whsec_test_secret";

/** A CONNECTED provider row whose sealed creds carry the webhook SECRET. */
function providerRow(webhookSecret: string | null = SECRET) {
    const sealed = encryptSecret(
        JSON.stringify({
            keyId: "k",
            keySecret: "s",
            ...(webhookSecret ? { webhookSecret } : {}),
        }),
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
    id: "pi_1",
    organizationId: "org_1",
    provider: "RAZORPAY",
    orderId: "order_1",
    status: "REQUIRES_PAYMENT",
    amountCents: 4250,
    currency: "INR",
};

/** Sign the raw body exactly as the FakeWebhookProvider verifies it. */
function sign(raw: Buffer, secret = SECRET): string {
    return createHmac("sha256", secret).update(raw).digest("hex");
}

/** Serialize a normalized event body (the FakeWebhookProvider reads it back). */
function bodyOf(over: Record<string, unknown>): Buffer {
    return Buffer.from(
        JSON.stringify({
            providerEventId: "evt_1",
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: "prov_intent_1",
            ...over,
        }),
    );
}

function makeService() {
    const fakeWp = new FakeWebhookProvider("RAZORPAY");
    const payments = new PaymentsService(
        new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
    );
    const service = new WebhooksService(
        new FakeWebhookProviderFactory(fakeWp),
        payments,
    );
    return { service };
}

beforeEach(() => jest.clearAllMocks());

describe("WebhooksService signature verification", () => {
    it("accepts a valid HMAC and reconciles (intent→SUCCEEDED, order→PAID)", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_1" });
        intentFindFirst.mockResolvedValue({ ...INTENT });
        orderFindUnique.mockResolvedValue({ paymentStatus: "UNPAID" });

        const raw = bodyOf({ providerPaymentRef: "pay_1" });
        const result = await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });

        expect(result).toEqual({ status: "processed", changed: true });
        // Order.paymentStatus moved to PAID (through the state machine).
        expect(orderUpdate).toHaveBeenCalledWith({
            where: { id: "order_1" },
            data: { paymentStatus: "PAID" },
        });
        // Intent settled + a CAPTURED attempt records the provider payment id.
        expect(intentUpdate).toHaveBeenCalledWith({
            where: { id: "pi_1" },
            data: { status: "SUCCEEDED" },
        });
        expect(attemptCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                providerRef: "pay_1",
                status: "CAPTURED",
            }),
        });
        // Inbox row marked PROCESSED.
        expect(whUpdate).toHaveBeenCalledWith({
            where: { id: "wh_1" },
            data: expect.objectContaining({ status: "PROCESSED" }),
        });
    });

    it("rejects a WRONG signature with 401 and records/changes NOTHING", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());

        const raw = bodyOf({});
        await expect(
            service.handle("razorpay", "org_1", raw, {
                "x-fake-signature": sign(raw, "the-wrong-secret"),
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);

        expect(whCreate).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
        expect(intentUpdate).not.toHaveBeenCalled();
    });

    it("rejects an ABSENT signature with 401 and records nothing", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());

        const raw = bodyOf({});
        await expect(
            service.handle("razorpay", "org_1", raw, {}),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(whCreate).not.toHaveBeenCalled();
    });

    it("rejects with 401 when the org has no webhook secret configured", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow(null));

        const raw = bodyOf({});
        await expect(
            service.handle("razorpay", "org_1", raw, {
                "x-fake-signature": sign(raw),
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(whCreate).not.toHaveBeenCalled();
    });

    it("rejects with 401 when the provider is not connected for the org", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(null);

        const raw = bodyOf({});
        await expect(
            service.handle("razorpay", "org_1", raw, {
                "x-fake-signature": sign(raw),
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(whCreate).not.toHaveBeenCalled();
    });
});

describe("WebhooksService exactly-once", () => {
    it("first delivery reconciles once; a duplicate (P2002) is a 200 no-op that writes NOTHING", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        intentFindFirst.mockResolvedValue({ ...INTENT });
        orderFindUnique.mockResolvedValue({ paymentStatus: "UNPAID" });

        const raw = bodyOf({});
        const headers = { "x-fake-signature": sign(raw) };

        // First delivery: writes state exactly once.
        whCreate.mockResolvedValueOnce({ id: "wh_1" });
        const first = await service.handle("razorpay", "org_1", raw, headers);
        expect(first).toEqual({ status: "processed", changed: true });
        expect(orderUpdate).toHaveBeenCalledTimes(1);
        expect(intentUpdate).toHaveBeenCalledTimes(1);

        // Second (duplicate) delivery: the unique (provider, providerEventId)
        // rejects with P2002 → 200 no-op → NO further state change.
        jest.clearAllMocks();
        providerFindUnique.mockResolvedValue(providerRow());
        intentFindFirst.mockResolvedValue({ ...INTENT });
        orderFindUnique.mockResolvedValue({ paymentStatus: "UNPAID" });
        whCreate.mockRejectedValueOnce({ code: "P2002" });

        const second = await service.handle("razorpay", "org_1", raw, headers);
        expect(second).toEqual({ status: "duplicate", changed: false });
        expect(orderUpdate).not.toHaveBeenCalled();
        expect(intentUpdate).not.toHaveBeenCalled();
    });

    it("is a state-machine no-op if reconcile sees an already-PAID order + SUCCEEDED intent", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_1" });
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });

        const raw = bodyOf({});
        const result = await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });

        // Same→same is never asserted and never written — no error, no move.
        expect(result).toEqual({ status: "ignored", changed: false });
        expect(orderUpdate).not.toHaveBeenCalled();
        expect(intentUpdate).not.toHaveBeenCalled();
    });
});

describe("WebhooksService reconcile routes through the state machine", () => {
    it("REJECTS an illegal Order.paymentStatus move (refund on an UNPAID order) — no state change, event FAILED", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_1" });
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        // UNPAID → REFUNDED is not a legal transition.
        orderFindUnique.mockResolvedValue({ paymentStatus: "UNPAID" });

        const raw = bodyOf({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerRefundId: "rfnd_1",
        });
        const result = await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });

        // The illegal transition was rejected: no order write, no refund write.
        expect(result.status).toBe("failed");
        expect(orderUpdate).not.toHaveBeenCalled();
        expect(refundCreate).not.toHaveBeenCalled();
        // The event is durably recorded FAILED for inspection/replay.
        expect(whUpdate).toHaveBeenCalledWith({
            where: { id: "wh_1" },
            data: expect.objectContaining({ status: "FAILED" }),
        });
    });
});

describe("WebhooksService refund settlement", () => {
    it("settles a PENDING refund to SUCCEEDED once and moves the order PAID→REFUNDED", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_1" });
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
        refundFindFirst.mockResolvedValue({ id: "rf_1", status: "PENDING" });

        const raw = bodyOf({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerRefundId: "rfnd_1",
        });
        const result = await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });

        expect(result).toEqual({ status: "processed", changed: true });
        expect(refundUpdate).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "SUCCEEDED" },
        });
        expect(orderUpdate).toHaveBeenCalledWith({
            where: { id: "order_1" },
            data: { paymentStatus: "REFUNDED" },
        });
    });

    it("does not double-settle an already-SUCCEEDED refund on a REFUNDED order", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_1" });
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        orderFindUnique.mockResolvedValue({ paymentStatus: "REFUNDED" });
        refundFindFirst.mockResolvedValue({ id: "rf_1", status: "SUCCEEDED" });

        const raw = bodyOf({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerRefundId: "rfnd_1",
        });
        const result = await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });

        expect(result).toEqual({ status: "ignored", changed: false });
        expect(refundUpdate).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });
});

describe("DefaultWebhookProviderFactory", () => {
    it("404s an unknown provider", () => {
        const factory = new DefaultWebhookProviderFactory();
        expect(() => factory.get("PAYPAL")).toThrow(NotFoundException);
    });

    it("resolves RAZORPAY and CASHFREE case-insensitively", () => {
        const factory = new DefaultWebhookProviderFactory();
        expect(factory.get("razorpay").name).toBe("RAZORPAY");
        expect(factory.get("cashfree").name).toBe("CASHFREE");
    });
});
