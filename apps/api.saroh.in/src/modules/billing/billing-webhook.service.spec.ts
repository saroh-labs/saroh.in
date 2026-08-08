// DB-free, network-free unit tests for the billing webhook inbox (S7-005).
// @saroh/database is mocked so nothing touches Postgres. Only the BILLING
// delegates (subscription/billingWebhookEvent) are real mocks; the MERCHANT
// delegates are mocked too and asserted NEVER-CALLED — proving the billing
// webhook path never crosses the credential boundary. The provider is a
// FakeBillingProvider doing a REAL HMAC-SHA256 hex compare against a fixed
// secret (no process.env).
jest.mock("@saroh/database", () => {
    const subscription = { findFirst: jest.fn(), update: jest.fn() };
    const billingWebhookEvent = { create: jest.fn(), update: jest.fn() };
    // Merchant delegates — present ONLY so we can assert billing never uses them.
    const merchantPaymentProvider = { findUnique: jest.fn() };
    const paymentIntent = { findFirst: jest.fn(), update: jest.fn() };
    const paymentAttempt = { create: jest.fn() };
    const paymentRefund = { create: jest.fn(), findFirst: jest.fn() };
    const webhookEvent = { create: jest.fn(), update: jest.fn() };
    const order = { findUnique: jest.fn(), update: jest.fn() };
    return {
        prisma: {
            subscription,
            billingWebhookEvent,
            merchantPaymentProvider,
            paymentIntent,
            paymentAttempt,
            paymentRefund,
            webhookEvent,
            order,
        },
    };
});

import { createHmac } from "node:crypto";

import { UnauthorizedException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { BillingWebhookService } from "./billing-webhook.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const subFindFirst = prisma.subscription.findFirst as jest.Mock;
const subUpdate = prisma.subscription.update as jest.Mock;
const bweCreate = prisma.billingWebhookEvent.create as jest.Mock;
const bweUpdate = prisma.billingWebhookEvent.update as jest.Mock;

const SECRET = "whsec_fake_platform_secret";

/** Every mocked merchant delegate — asserted never-called after each flow. */
function merchantDelegates(): jest.Mock[] {
    const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
    return [
        p.merchantPaymentProvider.findUnique,
        p.paymentIntent.findFirst,
        p.paymentIntent.update,
        p.paymentAttempt.create,
        p.paymentRefund.create,
        p.paymentRefund.findFirst,
        p.webhookEvent.create,
        p.webhookEvent.update,
        p.order.findUnique,
        p.order.update,
    ];
}

function expectNoMerchantAccess(): void {
    for (const delegate of merchantDelegates()) {
        expect(delegate).not.toHaveBeenCalled();
    }
}

function makeService() {
    const fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const service = new BillingWebhookService(
        new FakeBillingProviderFactory(fake),
    );
    return { service, fake };
}

/** Sign the raw body exactly as the FakeBillingProvider verifies it. */
function sign(raw: Buffer, secret = SECRET): string {
    return createHmac("sha256", secret).update(raw).digest("hex");
}

/** Serialize a normalized event body (the FakeBillingProvider reads it back). */
function bodyOf(over: Record<string, unknown> = {}): Buffer {
    return Buffer.from(
        JSON.stringify({
            providerEventId: "evt_1",
            type: "subscription.halted",
            providerSubscriptionId: "prov_sub_1",
            status: "PAST_DUE",
            ...over,
        }),
    );
}

beforeEach(() => jest.clearAllMocks());

describe("BillingWebhookService signature verification", () => {
    it("accepts a valid HMAC and moves the subscription status", async () => {
        const { service } = makeService();
        subFindFirst.mockResolvedValue({
            id: "sub_1",
            organizationId: "org_1",
            status: "ACTIVE",
        });
        bweCreate.mockResolvedValue({ id: "bwe_1" });

        const raw = bodyOf();
        const result = await service.handle("razorpay", raw, {
            "x-fake-signature": sign(raw),
        });

        expect(result).toEqual({ status: "processed", changed: true });
        // ACTIVE → PAST_DUE moved once.
        expect(subUpdate).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: { status: "PAST_DUE" },
        });
        // Inbox row stamped processed. The event records the resolved org id.
        expect(bweCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    provider: "RAZORPAY",
                    providerEventId: "evt_1",
                    organizationId: "org_1",
                }),
            }),
        );
        expect(bweUpdate).toHaveBeenCalledWith({
            where: { id: "bwe_1" },
            data: { processedAt: expect.any(Date) },
        });
        expectNoMerchantAccess();
    });

    it("rejects a WRONG signature with 401 and writes NOTHING", async () => {
        const { service } = makeService();

        const raw = bodyOf();
        await expect(
            service.handle("razorpay", raw, {
                "x-fake-signature": sign(raw, "the-wrong-secret"),
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);

        expect(bweCreate).not.toHaveBeenCalled();
        expect(subUpdate).not.toHaveBeenCalled();
        expectNoMerchantAccess();
    });

    it("rejects an ABSENT signature with 401 and writes nothing", async () => {
        const { service } = makeService();

        const raw = bodyOf();
        await expect(
            service.handle("razorpay", raw, {}),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(bweCreate).not.toHaveBeenCalled();
    });
});

describe("BillingWebhookService idempotency", () => {
    it("first delivery reconciles once; a duplicate (P2002) is a 200 no-op that writes NOTHING", async () => {
        const { service } = makeService();
        subFindFirst.mockResolvedValue({
            id: "sub_1",
            organizationId: "org_1",
            status: "ACTIVE",
        });

        const raw = bodyOf();
        const headers = { "x-fake-signature": sign(raw) };

        // First delivery: status moves exactly once.
        bweCreate.mockResolvedValueOnce({ id: "bwe_1" });
        const first = await service.handle("razorpay", raw, headers);
        expect(first).toEqual({ status: "processed", changed: true });
        expect(subUpdate).toHaveBeenCalledTimes(1);

        // Duplicate delivery: unique (provider, providerEventId) → P2002 →
        // 200 no-op → NO further state change.
        jest.clearAllMocks();
        subFindFirst.mockResolvedValue({
            id: "sub_1",
            organizationId: "org_1",
            status: "ACTIVE",
        });
        bweCreate.mockRejectedValueOnce({ code: "P2002" });

        const second = await service.handle("razorpay", raw, headers);
        expect(second).toEqual({ status: "duplicate", changed: false });
        expect(subUpdate).not.toHaveBeenCalled();
    });

    it("a same→same target is an ignored no-op (never asserted, never written)", async () => {
        const { service } = makeService();
        subFindFirst.mockResolvedValue({
            id: "sub_1",
            organizationId: "org_1",
            status: "PAST_DUE",
        });
        bweCreate.mockResolvedValue({ id: "bwe_1" });

        const raw = bodyOf(); // target PAST_DUE == current PAST_DUE
        const result = await service.handle("razorpay", raw, {
            "x-fake-signature": sign(raw),
        });

        expect(result).toEqual({ status: "ignored", changed: false });
        expect(subUpdate).not.toHaveBeenCalled();
    });
});

describe("BillingWebhookService state machine", () => {
    it("REJECTS an illegal transition (CANCELLED → ACTIVE) — status unchanged, event unprocessed", async () => {
        const { service } = makeService();
        subFindFirst.mockResolvedValue({
            id: "sub_1",
            organizationId: "org_1",
            status: "CANCELLED", // terminal
        });
        bweCreate.mockResolvedValue({ id: "bwe_1" });

        const raw = bodyOf({
            type: "subscription.activated",
            status: "ACTIVE",
        });
        const result = await service.handle("razorpay", raw, {
            "x-fake-signature": sign(raw),
        });

        expect(result.status).toBe("failed");
        expect(subUpdate).not.toHaveBeenCalled();
        // Not stamped processed (left for inspection).
        expect(bweUpdate).not.toHaveBeenCalled();
        expectNoMerchantAccess();
    });

    it("ignores a verified event with no matching subscription", async () => {
        const { service } = makeService();
        subFindFirst.mockResolvedValue(null);
        bweCreate.mockResolvedValue({ id: "bwe_1" });

        const raw = bodyOf();
        const result = await service.handle("razorpay", raw, {
            "x-fake-signature": sign(raw),
        });

        expect(result).toEqual({ status: "ignored", changed: false });
        expect(subUpdate).not.toHaveBeenCalled();
        // The inbox still records it (org id null since unresolved).
        expect(bweCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ organizationId: null }),
            }),
        );
    });
});
