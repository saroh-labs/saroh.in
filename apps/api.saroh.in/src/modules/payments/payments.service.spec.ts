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
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
        },
        paymentAttempt: {
            create: jest.fn(),
            findFirst: jest.fn(),
        },
        paymentRefund: {
            create: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
        orderItem: { findMany: jest.fn() },
        orderEvent: { create: jest.fn() },
        order: { findUnique: jest.fn() },
        storeSettings: { findUnique: jest.fn() },
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
const intentFindFirst = prisma.paymentIntent.findFirst as jest.Mock;
const intentCreate = prisma.paymentIntent.create as jest.Mock;
const attemptCreate = prisma.paymentAttempt.create as jest.Mock;
const attemptFindFirst = prisma.paymentAttempt.findFirst as jest.Mock;
const refundCreate = prisma.paymentRefund.create as jest.Mock;
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

    it("seals an OPTIONAL webhookSecret into the encrypted blob and never echoes it", async () => {
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
            keyId: "rzp_key_123",
            keySecret: "super-secret-value",
            webhookSecret: "whsec_top_secret",
        });

        const call = providerUpsert.mock.calls[0][0];
        // The webhook secret is NOT stored in plaintext anywhere on the row...
        expect(JSON.stringify(call)).not.toContain("whsec_top_secret");
        // ...but it round-trips out of the sealed blob via getWebhookSecret.
        providerFindUnique.mockResolvedValue({
            encryptedCredentials: call.create.encryptedCredentials,
            credentialsIv: call.create.credentialsIv,
            credentialsAuthTag: call.create.credentialsAuthTag,
        });
        await expect(
            service.getWebhookSecret("org_1", "RAZORPAY"),
        ).resolves.toBe("whsec_top_secret");
        // The redacted response never carries the secret.
        expect(JSON.stringify(result)).not.toContain("whsec_top_secret");
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

describe("PaymentsService.getWebhookSecret", () => {
    beforeEach(() => jest.clearAllMocks());

    it("decrypts the stored webhook secret (authz-free — keyed only by URL org)", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(
            connectedRow({ keyId: "k", keySecret: "s" }),
        );
        // connectedRow seals only { keyId, keySecret } → no webhook secret.
        await expect(
            service.getWebhookSecret("org_1", "RAZORPAY"),
        ).resolves.toBeNull();
    });

    it("returns null when the provider is not connected for the org", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(null);
        await expect(
            service.getWebhookSecret("org_1", "RAZORPAY"),
        ).resolves.toBeNull();
    });
});

describe("PaymentsService.initiateRefund", () => {
    const refundFindMany = prisma.paymentRefund.findMany as jest.Mock;
    const refundUpdate = prisma.paymentRefund.update as jest.Mock;
    const intentFindMany = prisma.paymentIntent.findMany as jest.Mock;
    const itemFindMany = prisma.orderItem.findMany as jest.Mock;
    const eventCreate = prisma.orderEvent.create as jest.Mock;
    const queryRaw = prisma.$queryRaw as jest.Mock;

    const ORDER = {
        id: "order_1",
        organizationId: "org_1",
        discount: "0.00",
        currency: "INR",
    };
    const PAYMENT = {
        id: "pi_1",
        provider: "RAZORPAY",
        providerIntentId: "prov_intent_1",
        status: "SUCCEEDED",
        amountCents: 4250,
        currency: "INR",
        refunds: [] as { amountCents: number }[],
    };
    // Three lines: 2 × 10.00, 1 × 15.00, 1 × 7.50 = 42.50.
    const LINES = [
        { id: "li_a", quantity: 2, price: "10.00", refundLines: [] },
        { id: "li_b", quantity: 1, price: "15.00", refundLines: [] },
        { id: "li_c", quantity: 1, price: "7.50", refundLines: [] },
    ];

    /** Echo a created refund row back as Prisma would, with its includes. */
    function echoCreate() {
        let n = 0;
        const made = new Map<string, object>();
        refundCreate.mockImplementation(
            ({ data }: { data: Record<string, unknown> }) => {
                n += 1;
                const lines = (
                    data.lines as
                        | {
                              create: {
                                  orderItemId: string;
                                  quantity: number;
                                  amountCents: number;
                              }[];
                          }
                        | undefined
                )?.create;
                const row = {
                    id: `rf_${n}`,
                    paymentIntentId: data.paymentIntentId,
                    amountCents: data.amountCents,
                    currency: data.currency,
                    status: data.status,
                    providerRefundId: null,
                    paymentIntent: { provider: "RAZORPAY" },
                    lines: lines ?? [],
                };
                made.set(row.id, row);
                return Promise.resolve(row);
            },
        );
        refundUpdate.mockImplementation(
            ({ where, data }: { where: { id: string }; data: object }) =>
                Promise.resolve({ ...made.get(where.id), ...data }),
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
        orderFindUnique.mockResolvedValue(ORDER);
        refundFindMany.mockResolvedValue([]);
        intentFindMany.mockResolvedValue([PAYMENT]);
        itemFindMany.mockResolvedValue(LINES);
        providerFindUnique.mockResolvedValue(connectedRow());
        attemptFindFirst.mockResolvedValue({ providerRef: "pay_1" });
        queryRaw.mockResolvedValue([]);
        echoCreate();
    });

    it("with no lines, refunds everything left under the order's row lock and records a PENDING refund", async () => {
        const { service, fake } = makeService();

        const result = await service.initiateRefund(ctx(), "order_1", {
            reason: "oops",
        });

        // The order row is locked before anything is read or written.
        expect(queryRaw).toHaveBeenCalledTimes(1);
        // Provider refund was called with the server-derived amount + payment ref.
        expect(fake.refundCalls).toHaveLength(1);
        expect(fake.refundCalls[0]).toEqual(
            expect.objectContaining({
                providerIntentId: "prov_intent_1",
                providerPaymentRef: "pay_1",
                amountCents: 4250,
                currency: "INR",
            }),
        );
        expect(refundCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    paymentIntentId: "pi_1",
                    amountCents: 4250,
                    status: "PENDING",
                    reason: "oops",
                }),
            }),
        );
        // Every line is recorded as refunded, so no line refund can follow.
        expect(result.lines).toEqual([
            { itemId: "li_a", quantity: 2, amountCents: 2000 },
            { itemId: "li_b", quantity: 1, amountCents: 1500 },
            { itemId: "li_c", quantity: 1, amountCents: 750 },
        ]);
        expect(result.amountCents).toBe(4250);
        expect(result.status).toBe("PENDING");
        expect(eventCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                kind: "REFUND",
                amountCents: 4250,
                actorUserId: "user_1",
            }),
        });
    });

    it("refunds the chosen lines only, for the amount the server works out", async () => {
        const { service, fake } = makeService();

        const result = await service.initiateRefund(ctx(), "order_1", {
            lines: [
                { itemId: "li_a", quantity: 1 },
                { itemId: "li_c", quantity: 1 },
            ],
        });

        expect(fake.refundCalls[0].amountCents).toBe(1750);
        expect(result.amountCents).toBe(1750);
        expect(result.lines).toEqual([
            { itemId: "li_a", quantity: 1, amountCents: 1000 },
            { itemId: "li_c", quantity: 1, amountCents: 750 },
        ]);
    });

    it("refuses a line refund above what is left of the line, and refunds nothing", async () => {
        const { service, fake } = makeService();
        itemFindMany.mockResolvedValue([
            {
                ...LINES[0],
                // One of the two was refunded already.
                refundLines: [{ quantity: 1, amountCents: 1000 }],
            },
            LINES[1],
            LINES[2],
        ]);

        await expect(
            service.initiateRefund(ctx(), "order_1", {
                lines: [{ itemId: "li_a", quantity: 2 }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(refundCreate).not.toHaveBeenCalled();
        expect(fake.refundCalls).toHaveLength(0);
    });

    it("a retry with the same key returns the first refund and makes no second", async () => {
        const { service, fake } = makeService();
        refundFindMany.mockResolvedValue([
            {
                id: "rf_1",
                paymentIntentId: "pi_1",
                amountCents: 1000,
                currency: "INR",
                status: "PENDING",
                providerRefundId: "fake_refund_prov_intent_1",
                paymentIntent: { provider: "RAZORPAY" },
                lines: [
                    { orderItemId: "li_a", quantity: 1, amountCents: 1000 },
                ],
            },
        ]);

        const result = await service.initiateRefund(ctx(), "order_1", {
            lines: [{ itemId: "li_a", quantity: 1 }],
            idempotencyKey: "tap-1",
        });

        expect(result.refundId).toBe("rf_1");
        expect(result.amountCents).toBe(1000);
        expect(refundCreate).not.toHaveBeenCalled();
        expect(fake.refundCalls).toHaveLength(0);
    });

    it("the racing twin finds the first refund once it holds the lock", async () => {
        const { service, fake } = makeService();
        const first = {
            id: "rf_1",
            paymentIntentId: "pi_1",
            amountCents: 1000,
            currency: "INR",
            status: "PENDING",
            providerRefundId: null,
            paymentIntent: { provider: "RAZORPAY" },
            lines: [],
        };
        // Nothing before the lock; the twin's row once inside it.
        refundFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([first]);

        const result = await service.initiateRefund(ctx(), "order_1", {
            lines: [{ itemId: "li_a", quantity: 1 }],
            idempotencyKey: "tap-1",
        });

        expect(result.refundId).toBe("rf_1");
        expect(refundCreate).not.toHaveBeenCalled();
        expect(fake.refundCalls).toHaveLength(0);
    });

    it("refuses when everything has already gone back", async () => {
        const { service } = makeService();
        intentFindMany.mockResolvedValue([
            { ...PAYMENT, refunds: [{ amountCents: 4250 }] },
        ]);

        await expect(
            service.initiateRefund(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(refundCreate).not.toHaveBeenCalled();
    });

    it("marks the refund FAILED when the provider refuses it, freeing the lines", async () => {
        const { service, fake } = makeService();
        jest.spyOn(fake, "refund").mockRejectedValueOnce(
            new Error("provider down"),
        );

        await expect(
            service.initiateRefund(ctx(), "order_1", {
                lines: [{ itemId: "li_b", quantity: 1 }],
            }),
        ).rejects.toThrow("provider down");
        expect(refundUpdate).toHaveBeenCalledWith({
            where: { id: "rf_1" },
            data: { status: "FAILED" },
        });
        // Not a step the order went through.
        expect(eventCreate).not.toHaveBeenCalled();
    });

    it("rejects with 400 when the order has no SUCCEEDED intent", async () => {
        const { service, fake } = makeService();
        intentFindMany.mockResolvedValue([]);

        await expect(
            service.initiateRefund(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(fake.refundCalls).toHaveLength(0);
        expect(refundCreate).not.toHaveBeenCalled();
    });

    it("denies a MEMBER (payment:manage) before any I/O", async () => {
        const { service } = makeService();
        await expect(
            service.initiateRefund(ctx({ role: "MEMBER" }), "order_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(orderFindUnique).not.toHaveBeenCalled();
    });

    it("rejects a cross-tenant order with 404", async () => {
        const { service, fake } = makeService();
        orderFindUnique.mockResolvedValue({
            ...ORDER,
            organizationId: "org_OTHER",
        });

        await expect(
            service.initiateRefund(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(fake.refundCalls).toHaveLength(0);
        expect(refundCreate).not.toHaveBeenCalled();
    });
});
