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

// The order's invoice and credit notes (ADR-008, U5) are written by
// order-invoicing, specced on its own; here each call is recorded.
jest.mock("../invoices/order-invoicing", () => ({
    ensureOrderInvoice: jest.fn().mockResolvedValue(null),
    creditNoteForRefund: jest.fn().mockResolvedValue(null),
    creditRestOfOrder: jest.fn().mockResolvedValue(undefined),
    settleSupplementaryInvoices: jest.fn().mockResolvedValue(0),
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        // The intent's row lock; [] keeps the status findIntent read.
        $queryRaw: jest.fn().mockResolvedValue([]),
        merchantPaymentProvider: { findUnique: jest.fn() },
        webhookEvent: { create: jest.fn(), update: jest.fn() },
        paymentIntent: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
        paymentAttempt: { create: jest.fn(), findFirst: jest.fn() },
        paymentRefund: {
            findFirst: jest.fn(),
            findUniqueOrThrow: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        order: { findUnique: jest.fn(), update: jest.fn() },
        orderEvent: { create: jest.fn() },
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

import {
    Logger,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import {
    creditNoteForRefund,
    creditRestOfOrder,
    ensureOrderInvoice,
    settleSupplementaryInvoices,
} from "../invoices/order-invoicing";
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
const intentFindMany = prisma.paymentIntent.findMany as jest.Mock;
const attemptCreate = prisma.paymentAttempt.create as jest.Mock;
const refundFindFirst = prisma.paymentRefund.findFirst as jest.Mock;
const refundFindUnique = prisma.paymentRefund.findUniqueOrThrow as jest.Mock;
const refundCreate = prisma.paymentRefund.create as jest.Mock;
const orderEventCreate = prisma.orderEvent.create as jest.Mock;
const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
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
    /** A refund row as `matchRefund` reads it back under its lock. */
    function refundRow(over: Record<string, unknown> = {}) {
        return {
            id: "rf_1",
            status: "PENDING",
            amountCents: 4250,
            reason: "Burnt",
            providerRefundId: "rfnd_1",
            paymentIntent: { orderId: "order_1" },
            ...over,
        };
    }

    /** Deliver one normalized refund event through the full inbox path. */
    async function deliverRefund(over: Record<string, unknown>) {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_1" });
        const raw = bodyOf({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            ...over,
        });
        return service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });
    }

    beforeEach(() => {
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
    });

    it("settles a PENDING refund to SUCCEEDED once and moves the order PAID→REFUNDED", async () => {
        refundFindFirst.mockResolvedValue({ id: "rf_1" });
        refundFindUnique.mockResolvedValue(refundRow());
        // Everything taken has now come back.
        intentFindMany.mockResolvedValue([
            { amountCents: 4250, refunds: [{ amountCents: 4250 }] },
        ]);

        const result = await deliverRefund({
            providerRefundId: "rfnd_1",
            refundAmountCents: 4250,
        });

        expect(result).toEqual({ status: "processed", changed: true });
        expect(queryRaw).toHaveBeenCalledTimes(1); // the row's lock
        expect(refundUpdate).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "SUCCEEDED", providerRefundId: "rfnd_1" },
        });
        expect(orderUpdate).toHaveBeenCalledWith({
            where: { id: "order_1" },
            data: { paymentStatus: "REFUNDED" },
        });
        // The refund path attached the provider's id and wrote the step.
        expect(orderEventCreate).not.toHaveBeenCalled();
    });

    it("a partial refund settles but leaves the order PAID (ADR-008)", async () => {
        refundFindFirst.mockResolvedValue({ id: "rf_1" });
        refundFindUnique.mockResolvedValue(refundRow({ amountCents: 1500 }));
        // Two lines of three went back; the rest is still paid for.
        intentFindMany.mockResolvedValue([
            { amountCents: 4250, refunds: [{ amountCents: 1500 }] },
        ]);

        const result = await deliverRefund({
            providerRefundId: "rfnd_1",
            refundAmountCents: 1500,
        });

        expect(result).toEqual({ status: "processed", changed: true });
        expect(refundUpdate).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "SUCCEEDED", providerRefundId: "rfnd_1" },
        });
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("the refund that settles the last of it moves the order to REFUNDED", async () => {
        refundFindFirst.mockResolvedValue({ id: "rf_2" });
        refundFindUnique.mockResolvedValue(
            refundRow({ id: "rf_2", amountCents: 2750 }),
        );
        intentFindMany.mockResolvedValue([
            {
                amountCents: 4250,
                refunds: [{ amountCents: 1500 }, { amountCents: 2750 }],
            },
        ]);

        await deliverRefund({
            providerRefundId: "rfnd_2",
            refundAmountCents: 2750,
        });

        expect(orderUpdate).toHaveBeenCalledWith({
            where: { id: "order_1" },
            data: { paymentStatus: "REFUNDED" },
        });
    });

    it("does not double-settle an already-SUCCEEDED refund on a REFUNDED order", async () => {
        orderFindUnique.mockResolvedValue({ paymentStatus: "REFUNDED" });
        refundFindFirst.mockResolvedValue({ id: "rf_1" });
        refundFindUnique.mockResolvedValue(refundRow({ status: "SUCCEEDED" }));

        const result = await deliverRefund({ providerRefundId: "rfnd_1" });

        expect(result).toEqual({ status: "ignored", changed: false });
        expect(refundUpdate).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("arriving before the refund path stored the provider's id, it settles Saroh's row by its reference and writes the REFUND step once", async () => {
        // No row carries the provider id yet; the reference names Saroh's row.
        refundFindFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "rf_1", providerRefundId: null });
        refundFindUnique.mockResolvedValue(
            refundRow({ providerRefundId: null, amountCents: 1500 }),
        );
        intentFindMany.mockResolvedValue([
            { amountCents: 4250, refunds: [{ amountCents: 1500 }] },
        ]);

        const result = await deliverRefund({
            providerRefundId: "rfnd_1",
            refundReference: "rf_1",
            refundAmountCents: 1500,
        });

        expect(result).toEqual({ status: "processed", changed: true });
        // Matched on the same order, never by amount.
        expect(refundFindFirst).toHaveBeenLastCalledWith({
            where: {
                id: "rf_1",
                organizationId: "org_1",
                paymentIntent: { orderId: "order_1" },
            },
            select: { id: true, providerRefundId: true },
        });
        expect(refundUpdate).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "SUCCEEDED", providerRefundId: "rfnd_1" },
        });
        expect(refundCreate).not.toHaveBeenCalled();
        expect(orderEventCreate).toHaveBeenCalledTimes(1);
        expect(orderEventCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                orderId: "order_1",
                kind: "REFUND",
                actorUserId: null,
                note: "Burnt",
                amountCents: 1500,
            },
        });
    });

    it("a refund made in the provider's dashboard is recorded at the amount the provider refunded", async () => {
        refundFindFirst.mockResolvedValue(null);
        refundCreate.mockResolvedValue({ id: "rf_dash" });
        intentFindMany.mockResolvedValue([
            { amountCents: 4250, refunds: [{ amountCents: 1500 }] },
        ]);

        await deliverRefund({
            providerRefundId: "rfnd_dash",
            refundAmountCents: 1500,
        });

        expect(refundCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                paymentIntentId: "pi_1",
                amountCents: 1500,
                currency: "INR",
                status: "SUCCEEDED",
                providerRefundId: "rfnd_dash",
            },
        });
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("a dashboard refund of the same amount as Saroh's pending one is its own row; Saroh's stays PENDING", async () => {
        // Saroh's ₹15 row is PENDING, but the event names neither its
        // provider id nor its reference.
        refundFindFirst.mockResolvedValue(null);
        refundCreate.mockResolvedValue({ id: "rf_dash" });
        intentFindMany.mockResolvedValue([
            { amountCents: 4250, refunds: [{ amountCents: 1500 }] },
        ]);

        await deliverRefund({
            providerRefundId: "rfnd_dash",
            refundAmountCents: 1500,
        });

        expect(refundFindUnique).not.toHaveBeenCalled();
        expect(refundUpdate).not.toHaveBeenCalled();
        expect(refundCreate).toHaveBeenCalledTimes(1);
    });

    it("an event with no amount falls back to the payment's, and says so", async () => {
        const warn = jest
            .spyOn(Logger.prototype, "warn")
            .mockImplementation(() => undefined);
        refundFindFirst.mockResolvedValue(null);
        refundCreate.mockResolvedValue({ id: "rf_dash" });
        intentFindMany.mockResolvedValue([
            { amountCents: 4250, refunds: [{ amountCents: 4250 }] },
        ]);

        await deliverRefund({ providerRefundId: "rfnd_dash" });

        expect(refundCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ amountCents: 4250 }),
        });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("came with no amount"),
        );
        warn.mockRestore();
    });

    it("a refund the provider failed moves Saroh's PENDING row to FAILED: no credit note, the order as it was", async () => {
        refundFindFirst.mockResolvedValue({ id: "rf_1" });
        refundFindUnique.mockResolvedValue(refundRow());

        const result = await deliverRefund({
            eventType: "refund.failed",
            outcome: "REFUND_FAILED",
            providerRefundId: "rfnd_1",
            refundAmountCents: 4250,
        });

        expect(result).toEqual({ status: "processed", changed: true });
        expect(refundUpdate).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "FAILED", providerRefundId: "rfnd_1" },
        });
        expect(creditNoteForRefund).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
        expect(orderEventCreate).not.toHaveBeenCalled();
    });

    it("a failed refund matched by Saroh's reference alone is failed too", async () => {
        refundFindFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "rf_1", providerRefundId: null });
        refundFindUnique.mockResolvedValue(
            refundRow({ providerRefundId: null }),
        );

        await deliverRefund({
            eventType: "REFUND_STATUS_WEBHOOK",
            outcome: "REFUND_FAILED",
            providerRefundId: "cf_77",
            refundReference: "rf_1",
        });

        expect(refundUpdate).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "FAILED", providerRefundId: "cf_77" },
        });
    });

    it("a failure for a refund already SUCCEEDED, or for no refund of Saroh's, changes nothing", async () => {
        refundFindFirst.mockResolvedValue({ id: "rf_1" });
        refundFindUnique.mockResolvedValue(refundRow({ status: "SUCCEEDED" }));
        expect(
            await deliverRefund({
                outcome: "REFUND_FAILED",
                providerRefundId: "rfnd_1",
            }),
        ).toEqual({ status: "ignored", changed: false });

        refundFindFirst.mockResolvedValue(null);
        expect(
            await deliverRefund({
                providerEventId: "evt_2",
                outcome: "REFUND_FAILED",
                providerRefundId: "rfnd_unknown",
            }),
        ).toEqual({ status: "ignored", changed: false });
        expect(refundUpdate).not.toHaveBeenCalled();
        expect(refundCreate).not.toHaveBeenCalled();
    });
});

describe("WebhooksService — the order's invoice (ADR-008)", () => {
    const ensure = ensureOrderInvoice as jest.Mock;
    const creditNote = creditNoteForRefund as jest.Mock;
    const creditRest = creditRestOfOrder as jest.Mock;
    const settleSupplementary = settleSupplementaryInvoices as jest.Mock;

    it("a verified payment makes the order's invoice once, in its transaction; the replayed delivery makes none", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        intentFindFirst.mockResolvedValue({ ...INTENT });
        orderFindUnique.mockResolvedValue({ paymentStatus: "UNPAID" });
        const raw = bodyOf({ providerPaymentRef: "pay_1" });
        const headers = { "x-fake-signature": sign(raw) };

        whCreate.mockResolvedValueOnce({ id: "wh_1" });
        await service.handle("razorpay", "org_1", raw, headers);
        expect(ensure).toHaveBeenCalledTimes(1);
        expect(ensure).toHaveBeenCalledWith(expect.anything(), "order_1", {
            method: "ONLINE",
            reference: "pay_1",
        });

        jest.clearAllMocks();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockRejectedValueOnce({ code: "P2002" });
        await service.handle("razorpay", "org_1", raw, headers);
        expect(ensure).not.toHaveBeenCalled();
    });

    it("a second event for a payment already settled makes no invoice", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_2" });
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
        const raw = bodyOf({
            providerEventId: "evt_2",
            eventType: "order.paid",
        });
        await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });
        expect(ensure).not.toHaveBeenCalled();
        expect(settleSupplementary).not.toHaveBeenCalled();
    });

    it("an edit's difference paid on a paid order settles its supplementary invoice", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_3" });
        intentFindFirst.mockResolvedValue({ ...INTENT, id: "pi_2" });
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
        const raw = bodyOf({ providerEventId: "evt_3" });
        await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });
        expect(ensure).not.toHaveBeenCalled();
        expect(settleSupplementary).toHaveBeenCalledWith(
            expect.anything(),
            "order_1",
        );
    });

    it("a refund makes its credit note; the last of it credits the rest", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_4" });
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
        refundFindFirst.mockResolvedValue({ id: "rf_1" });
        refundFindUnique.mockResolvedValue({
            id: "rf_1",
            status: "PENDING",
            amountCents: 4250,
            reason: null,
            providerRefundId: "rfnd_1",
            paymentIntent: { orderId: "order_1" },
        });
        intentFindMany.mockResolvedValue([
            { amountCents: 4250, refunds: [{ amountCents: 4250 }] },
        ]);
        const raw = bodyOf({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerRefundId: "rfnd_1",
        });
        await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });
        expect(creditNote).toHaveBeenCalledWith(expect.anything(), "rf_1");
        expect(creditRest).toHaveBeenCalledWith(
            expect.anything(),
            "order_1",
            "Refunded",
            null,
        );
    });

    it("a partial refund makes its credit note and leaves the rest of the invoice", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: "wh_5" });
        intentFindFirst.mockResolvedValue({ ...INTENT, status: "SUCCEEDED" });
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
        // A refund made in the provider's dashboard: created here.
        refundFindFirst.mockResolvedValue(null);
        refundCreate.mockResolvedValue({ id: "rf_new" });
        intentFindMany.mockResolvedValue([
            { amountCents: 4250, refunds: [{ amountCents: 1500 }] },
        ]);
        const raw = bodyOf({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerRefundId: "rfnd_9",
            refundAmountCents: 1500,
        });
        await service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });
        expect(refundCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ amountCents: 1500 }),
        });
        expect(creditNote).toHaveBeenCalledWith(expect.anything(), "rf_new");
        expect(creditRest).not.toHaveBeenCalled();
    });
});

describe("WebhooksService — a payment on a superseded edit charge (#508 U8)", () => {
    const queryRaw = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw;
    const attemptFindFirst = prisma.paymentAttempt.findFirst as jest.Mock;
    const settleSupplementary = settleSupplementaryInvoices as jest.Mock;

    async function pay(eventId: string) {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(providerRow());
        whCreate.mockResolvedValue({ id: `wh_${eventId}` });
        const raw = bodyOf({
            providerEventId: eventId,
            providerPaymentRef: "pay_late",
        });
        return service.handle("razorpay", "org_1", raw, {
            "x-fake-signature": sign(raw),
        });
    }

    it("is recorded as captured and owed back, never as the order's money", async () => {
        intentFindFirst.mockResolvedValue({
            ...INTENT,
            id: "pi_old",
            status: "SUPERSEDED",
        });
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
        attemptFindFirst.mockResolvedValue(null);

        await expect(pay("evt_s1")).resolves.toEqual({
            status: "processed",
            changed: true,
        });
        expect(attemptCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                paymentIntentId: "pi_old",
                providerRef: "pay_late",
                status: "CAPTURED_NEEDS_REFUND",
            }),
        });
        // Not SUCCEEDED, so no paid sum counts it; the order and its
        // supplementary invoices are left as the later edit left them.
        expect(intentUpdate).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
        expect(settleSupplementary).not.toHaveBeenCalled();
        expect(ensureOrderInvoice).not.toHaveBeenCalled();
    });

    it("reads the status under the intent's lock: superseded a moment ago is superseded", async () => {
        intentFindFirst.mockResolvedValue({ ...INTENT, id: "pi_old" });
        queryRaw.mockResolvedValueOnce([{ status: "SUPERSEDED" }]);
        orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
        attemptFindFirst.mockResolvedValue(null);

        await pay("evt_s2");
        expect(queryRaw).toHaveBeenCalled();
        expect(intentUpdate).not.toHaveBeenCalled();
        expect(attemptCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ status: "CAPTURED_NEEDS_REFUND" }),
        });
    });

    it("a second event for the same payment records nothing more", async () => {
        intentFindFirst.mockResolvedValue({
            ...INTENT,
            id: "pi_old",
            status: "SUPERSEDED",
        });
        attemptFindFirst.mockResolvedValue({ id: "pa_owed" });

        await expect(pay("evt_s3")).resolves.toEqual({
            status: "ignored",
            changed: false,
        });
        expect(attemptCreate).not.toHaveBeenCalled();
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
