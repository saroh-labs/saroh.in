// DB-free, network-free unit tests. @saroh/database is mocked so nothing touches
// Postgres; the `$transaction` mock invokes its callback with the SAME mocked
// client so intent+attempt writes are asserted in one transaction. env is mocked
// with a real 32-byte key so the REAL AES-256-GCM crypto runs (round-trips), but
// no real app env is validated. The provider is a FakeMerchantProvider — no net.
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
            upsert: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        paymentIntent: {
            findUnique: jest.fn(),
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

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { encryptSecret } from "./crypto";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";

const providerUpsert = prisma.merchantPaymentProvider.upsert as jest.Mock;
const providerFindMany = prisma.merchantPaymentProvider.findMany as jest.Mock;
const providerFindUnique = prisma.merchantPaymentProvider
    .findUnique as jest.Mock;
const providerUpdate = prisma.merchantPaymentProvider.update as jest.Mock;
const intentFindUnique = prisma.paymentIntent.findUnique as jest.Mock;
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

/** Build a CONNECTED provider row whose credentials really decrypt to creds. */
function connectedRow(
    over: {
        provider?: string;
        status?: string;
        publicKey?: string | null;
        keyId?: string;
        keySecret?: string;
    } = {},
) {
    const keyId = over.keyId ?? "rzp_key_123";
    const keySecret = over.keySecret ?? "super-secret-value";
    const sealed = encryptSecret(JSON.stringify({ keyId, keySecret }));
    return {
        id: "mpp_1",
        organizationId: "org_1",
        provider: over.provider ?? "RAZORPAY",
        status: over.status ?? "CONNECTED",
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

describe("PaymentsService.connectProvider", () => {
    beforeEach(() => jest.clearAllMocks());

    it("stores ONLY encrypted fields (no plaintext secret) and returns a redacted view", async () => {
        const { service } = makeService();
        providerUpsert.mockImplementation(
            ({ create }: { create: Record<string, unknown> }) =>
                Promise.resolve({
                    id: "mpp_1",
                    createdAt: new Date("2026-01-01"),
                    updatedAt: new Date("2026-01-01"),
                    ...create,
                }),
        );

        const result = await service.connectProvider(ctx(), {
            provider: "razorpay",
            publicKey: "rzp_key_123",
            keyId: "rzp_key_123",
            keySecret: "super-secret-value",
        });

        // The persisted payload carries encrypted blob fields, NOT the secret.
        expect(providerUpsert).toHaveBeenCalledTimes(1);
        const call = providerUpsert.mock.calls[0][0];
        const persisted = JSON.stringify(call);
        expect(persisted).not.toContain("super-secret-value");
        expect(call.create.encryptedCredentials).toEqual(expect.any(String));
        expect(call.create.credentialsIv).toEqual(expect.any(String));
        expect(call.create.credentialsAuthTag).toEqual(expect.any(String));
        expect(call.create.status).toBe("CONNECTED");
        expect(call.where).toEqual({
            organizationId_provider: {
                organizationId: "org_1",
                provider: "RAZORPAY",
            },
        });

        // The response is redacted: no secret / encrypted fields leak out.
        expect(result).toEqual({
            id: "mpp_1",
            provider: "RAZORPAY",
            status: "CONNECTED",
            publicKey: "rzp_key_123",
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
        });
        expect(JSON.stringify(result)).not.toContain("super-secret-value");
        expect(result).not.toHaveProperty("encryptedCredentials");
        expect(result).not.toHaveProperty("keySecret");
    });

    it("denies a MEMBER (payment:manage is OWNER/ADMIN-only) before any I/O", async () => {
        const { service } = makeService();
        await expect(
            service.connectProvider(ctx({ role: "MEMBER" }), {
                provider: "RAZORPAY",
                keyId: "k",
                keySecret: "s",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(providerUpsert).not.toHaveBeenCalled();
    });

    it("rejects an unsupported provider", async () => {
        const { service } = makeService();
        await expect(
            service.connectProvider(ctx(), {
                provider: "STRIPE",
                keyId: "k",
                keySecret: "s",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(providerUpsert).not.toHaveBeenCalled();
    });
});

describe("PaymentsService.listProviders", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes to the ctx org and redacts every row", async () => {
        const { service } = makeService();
        providerFindMany.mockResolvedValue([connectedRow()]);

        const rows = await service.listProviders(ctx());

        expect(providerFindMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
        });
        expect(rows[0]).not.toHaveProperty("encryptedCredentials");
        expect(JSON.stringify(rows)).not.toContain("super-secret-value");
    });

    it("denies a MEMBER? no — payment:read allows nobody but OWNER/ADMIN", async () => {
        const { service } = makeService();
        await expect(
            service.listProviders(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(providerFindMany).not.toHaveBeenCalled();
    });
});

describe("PaymentsService.createIntentForOrder", () => {
    beforeEach(() => jest.clearAllMocks());

    const ORDER = {
        id: "order_1",
        organizationId: "org_1",
        total: "42.50",
        currency: "INR",
    };

    it("derives amountCents SERVER-SIDE from order.total, decrypts creds for the provider, and persists intent+attempt", async () => {
        const { service, fake } = makeService();
        orderFindUnique.mockResolvedValue(ORDER);
        providerFindMany.mockResolvedValue([connectedRow()]);
        intentCreate.mockResolvedValue({ id: "pi_1" });
        attemptCreate.mockResolvedValue({ id: "att_1" });

        const result = await service.createIntentForOrder(ctx(), "order_1");

        // amountCents is computed from order.total (42.50 → 4250), currency
        // from the Order — never from any client input.
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0].amountCents).toBe(4250);
        expect(fake.calls[0].currency).toBe("INR");
        // The provider received the DECRYPTED credentials.
        expect(fake.calls[0].credentials).toEqual({
            keyId: "rzp_key_123",
            keySecret: "super-secret-value",
        });

        // Intent persisted with the server amount + REQUIRES_PAYMENT.
        expect(intentCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                orderId: "order_1",
                provider: "RAZORPAY",
                providerIntentId: "fake_razorpay_order_1",
                amountCents: 4250,
                currency: "INR",
                status: "REQUIRES_PAYMENT",
            }),
        });
        // A first attempt is written; its rawResponse carries NO secret.
        expect(attemptCreate).toHaveBeenCalledTimes(1);
        const attemptData = attemptCreate.mock.calls[0][0].data;
        expect(attemptData.status).toBe("CREATED");
        expect(JSON.stringify(attemptData.rawResponse)).not.toContain(
            "super-secret-value",
        );

        // Client-safe result — no secret.
        expect(result).toEqual({
            paymentIntentId: "pi_1",
            provider: "RAZORPAY",
            providerIntentId: "fake_razorpay_order_1",
            amountCents: 4250,
            currency: "INR",
            publicKey: "rzp_key_123",
            clientParams: expect.any(Object),
        });
        expect(JSON.stringify(result)).not.toContain("super-secret-value");
    });

    it("is idempotent: a prior (orderId, idempotencyKey) returns the first intent without calling the provider", async () => {
        const { service, fake } = makeService();
        orderFindUnique.mockResolvedValue(ORDER);
        intentFindUnique.mockResolvedValue({
            id: "pi_existing",
            provider: "RAZORPAY",
            providerIntentId: "fake_razorpay_order_1",
            amountCents: 4250,
            currency: "INR",
        });
        attemptFindFirst.mockResolvedValue({
            rawResponse: { clientParams: { fakeOrderId: "x" } },
        });
        providerFindUnique.mockResolvedValue(connectedRow());

        const result = await service.createIntentForOrder(ctx(), "order_1", {
            idempotencyKey: "idem_1",
        });

        expect(result.paymentIntentId).toBe("pi_existing");
        expect(fake.calls).toHaveLength(0); // provider NOT called again
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it("rejects a cross-tenant order with 404 and never touches a provider", async () => {
        const { service, fake } = makeService();
        orderFindUnique.mockResolvedValue({
            ...ORDER,
            organizationId: "org_OTHER",
        });

        await expect(
            service.createIntentForOrder(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(fake.calls).toHaveLength(0);
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it("returns 400 when no provider is connected", async () => {
        const { service } = makeService();
        orderFindUnique.mockResolvedValue(ORDER);
        providerFindMany.mockResolvedValue([]); // none connected

        await expect(
            service.createIntentForOrder(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it("returns 409 when the pinned provider is DISABLED", async () => {
        const { service } = makeService();
        orderFindUnique.mockResolvedValue(ORDER);
        providerFindUnique.mockResolvedValue(
            connectedRow({ status: "DISABLED" }),
        );

        await expect(
            service.createIntentForOrder(ctx(), "order_1", {
                provider: "RAZORPAY",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it("denies a MEMBER before loading the order", async () => {
        const { service } = makeService();
        await expect(
            service.createIntentForOrder(ctx({ role: "MEMBER" }), "order_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(orderFindUnique).not.toHaveBeenCalled();
    });
});

describe("PaymentsService.disconnectProvider", () => {
    beforeEach(() => jest.clearAllMocks());

    it("sets DISABLED for an owned provider and returns redacted", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(connectedRow());
        providerUpdate.mockResolvedValue(connectedRow({ status: "DISABLED" }));

        const result = await service.disconnectProvider(ctx(), "razorpay");

        expect(providerUpdate).toHaveBeenCalledWith({
            where: { id: "mpp_1" },
            data: { status: "DISABLED" },
        });
        expect(result.status).toBe("DISABLED");
        expect(result).not.toHaveProperty("encryptedCredentials");
    });

    it("rejects a cross-tenant / missing provider with 404", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(null);

        await expect(
            service.disconnectProvider(ctx(), "RAZORPAY"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(providerUpdate).not.toHaveBeenCalled();
    });
});
