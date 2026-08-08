// DB-free, network-free unit tests for the S5-004 public checkout + receipt and
// the owner payments summary. @saroh/database is mocked so nothing touches
// Postgres; `$transaction` invokes its callback with the SAME mocked client so
// the intent+attempt writes happen "in one transaction". env is mocked with a
// real 32-byte key so the REAL AES-256-GCM crypto round-trips. The provider is a
// FakeMerchantProvider — no network.
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        merchantPaymentProvider: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        paymentIntent: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
        },
        paymentAttempt: {
            create: jest.fn(),
            findFirst: jest.fn(),
        },
        order: { findUnique: jest.fn() },
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

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { encryptSecret } from "./crypto";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";

const providerFindMany = prisma.merchantPaymentProvider.findMany as jest.Mock;
const providerFindUnique = prisma.merchantPaymentProvider
    .findUnique as jest.Mock;
const intentFindUnique = prisma.paymentIntent.findUnique as jest.Mock;
const intentFindFirst = prisma.paymentIntent.findFirst as jest.Mock;
const intentFindMany = prisma.paymentIntent.findMany as jest.Mock;
const intentCreate = prisma.paymentIntent.create as jest.Mock;
const attemptCreate = prisma.paymentAttempt.create as jest.Mock;
const attemptFindFirst = prisma.paymentAttempt.findFirst as jest.Mock;
const orderFindUnique = prisma.order.findUnique as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

/** A CONNECTED provider row whose credentials really decrypt to creds. */
function connectedRow(over: { publicKey?: string | null } = {}) {
    const sealed = encryptSecret(
        JSON.stringify({ keyId: "rzp_key_123", keySecret: "super-secret" }),
    );
    return {
        id: "mpp_1",
        organizationId: "org_1",
        provider: "RAZORPAY",
        status: "CONNECTED",
        publicKey:
            over.publicKey === undefined ? "rzp_key_123" : over.publicKey,
        encryptedCredentials: sealed.ciphertext,
        credentialsIv: sealed.iv,
        credentialsAuthTag: sealed.authTag,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    };
}

function makeService(fake = new FakeMerchantProvider("RAZORPAY")) {
    const service = new PaymentsService(new FakeProviderFactory(fake));
    return { service, fake };
}

describe("PaymentsService.createIntentForOrderPublic (S5-004)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("derives the charged amount from order.total and resolves the org from the Order — never from the client", async () => {
        const { service, fake } = makeService();
        // The public order lookup (requirePayableOrder select) resolves the org.
        orderFindUnique.mockResolvedValue({
            id: "order_1",
            organizationId: "org_1",
            total: "42.50",
            currency: "INR",
        });
        intentFindUnique.mockResolvedValue(null);
        providerFindMany.mockResolvedValue([connectedRow()]);
        intentCreate.mockResolvedValue({ id: "pi_1" });
        attemptCreate.mockResolvedValue({ id: "pa_1" });

        // NOTE: the public method's options carry ONLY { provider?, idempotencyKey? }
        // — there is no amount field to pass, so a buyer cannot influence the charge.
        const result = await service.createIntentForOrderPublic("order_1", {});

        // Provider was called with the SERVER-derived minor units (42.50 → 4250).
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0].amountCents).toBe(4250);
        expect(fake.calls[0].currency).toBe("INR");
        // The persisted intent used the same server amount + org from the Order.
        expect(intentCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    orderId: "order_1",
                    amountCents: 4250,
                    currency: "INR",
                }),
            }),
        );
        // Result exposes only non-secret handoff params — never a secret.
        expect(result.amountCents).toBe(4250);
        expect(result.publicKey).toBe("rzp_key_123");
        expect(JSON.stringify(result)).not.toContain("super-secret");
    });

    it("is idempotent: a repeat with the same key replays the first intent (no second create)", async () => {
        const { service, fake } = makeService();
        orderFindUnique.mockResolvedValue({
            id: "order_1",
            organizationId: "org_1",
            total: "10.00",
            currency: "INR",
        });
        // An intent already exists for (orderId, idempotencyKey).
        intentFindUnique.mockResolvedValue({
            id: "pi_existing",
            provider: "RAZORPAY",
            providerIntentId: "fake_razorpay_order_1",
            amountCents: 1000,
            currency: "INR",
        });
        attemptFindFirst.mockResolvedValue({
            rawResponse: {
                clientParams: { fakeOrderId: "fake_razorpay_order_1" },
            },
        });
        providerFindUnique.mockResolvedValue(connectedRow());

        const result = await service.createIntentForOrderPublic("order_1", {
            idempotencyKey: "key-abc",
        });

        expect(result.paymentIntentId).toBe("pi_existing");
        expect(result.amountCents).toBe(1000);
        // No provider call and no new intent write on replay.
        expect(fake.calls).toHaveLength(0);
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it("404s a missing or org-less order without leaking which", async () => {
        const { service } = makeService();
        orderFindUnique.mockResolvedValue(null);
        await expect(
            service.createIntentForOrderPublic("nope", {}),
        ).rejects.toBeInstanceOf(NotFoundException);

        orderFindUnique.mockResolvedValue({
            id: "order_x",
            organizationId: null,
            total: "5.00",
            currency: "INR",
        });
        await expect(
            service.createIntentForOrderPublic("order_x", {}),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("PaymentsService.getReceipt (S5-004)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("reflects the order paymentStatus + latest intent status, with no secrets or internal ids", async () => {
        const { service } = makeService();
        orderFindUnique.mockResolvedValue({
            orderId: "ORD-001",
            subtotal: "40.00",
            tax: "2.50",
            shipping: "0",
            discount: "0",
            total: "42.50",
            currency: "INR",
            paymentStatus: "PAID",
            status: "PROCESSING",
        });
        intentFindFirst.mockResolvedValue({
            provider: "RAZORPAY",
            status: "SUCCEEDED",
            amountCents: 4250,
            currency: "INR",
        });

        const receipt = await service.getReceipt("order_1");

        expect(receipt).toEqual({
            orderNumber: "ORD-001",
            currency: "INR",
            subtotal: "40.00",
            tax: "2.50",
            shipping: "0",
            discount: "0",
            total: "42.50",
            paymentStatus: "PAID",
            fulfilmentStatus: "PROCESSING",
            latestPayment: {
                provider: "RAZORPAY",
                status: "SUCCEEDED",
                amountCents: 4250,
                currency: "INR",
            },
        });
        // No internal ids leak to the buyer.
        expect(JSON.stringify(receipt)).not.toContain("order_1");
    });

    it("returns latestPayment null when no intent exists yet (UNPAID)", async () => {
        const { service } = makeService();
        orderFindUnique.mockResolvedValue({
            orderId: "ORD-002",
            subtotal: "10.00",
            tax: "0",
            shipping: "0",
            discount: "0",
            total: "10.00",
            currency: "INR",
            paymentStatus: "UNPAID",
            status: "PENDING",
        });
        intentFindFirst.mockResolvedValue(null);

        const receipt = await service.getReceipt("order_2");
        expect(receipt.paymentStatus).toBe("UNPAID");
        expect(receipt.latestPayment).toBeNull();
    });

    it("404s a missing order", async () => {
        const { service } = makeService();
        orderFindUnique.mockResolvedValue(null);
        await expect(service.getReceipt("nope")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe("PaymentsService.listOrderPayments (S5-004)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns the order's intents with their attempts + refunds (owner view)", async () => {
        const { service } = makeService();
        orderFindUnique.mockResolvedValue({
            id: "order_1",
            organizationId: "org_1",
            total: "42.50",
            currency: "INR",
            paymentStatus: "REFUNDED",
        });
        intentFindMany.mockResolvedValue([
            {
                id: "pi_1",
                provider: "RAZORPAY",
                providerIntentId: "fake_razorpay_order_1",
                status: "SUCCEEDED",
                amountCents: 4250,
                currency: "INR",
                createdAt: new Date("2026-02-01"),
                attempts: [
                    {
                        id: "pa_1",
                        provider: "RAZORPAY",
                        providerRef: "pay_123",
                        status: "CAPTURED",
                        createdAt: new Date("2026-02-01"),
                    },
                ],
                refunds: [
                    {
                        id: "pr_1",
                        status: "SUCCEEDED",
                        amountCents: 4250,
                        currency: "INR",
                        providerRefundId: "rfnd_1",
                        reason: "customer request",
                        createdAt: new Date("2026-02-02"),
                    },
                ],
            },
        ]);

        const summary = await service.listOrderPayments(ctx(), "order_1");

        expect(summary.paymentStatus).toBe("REFUNDED");
        expect(summary.intents).toHaveLength(1);
        expect(summary.intents[0].attempts[0].providerRef).toBe("pay_123");
        expect(summary.intents[0].refunds[0].providerRefundId).toBe("rfnd_1");
        // Owner query is tenant-scoped to the proven org.
        expect(intentFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { orderId: "order_1", organizationId: "org_1" },
            }),
        );
    });

    it("404s a cross-tenant order", async () => {
        const { service } = makeService();
        orderFindUnique.mockResolvedValue({
            id: "order_1",
            organizationId: "org_OTHER",
            total: "1.00",
            currency: "INR",
            paymentStatus: "UNPAID",
        });
        await expect(
            service.listOrderPayments(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
