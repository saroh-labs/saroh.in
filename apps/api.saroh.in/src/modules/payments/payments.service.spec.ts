// DB-free, network-free unit tests. @saroh/database is mocked so nothing touches
// Postgres; the `$transaction` mock invokes its callback with the SAME mocked
// client so intent+attempt writes are asserted in one transaction. env is mocked
// with a real 32-byte key so the REAL AES-256-GCM crypto runs (round-trips), but
// no real app env is validated. The provider is a FakeMerchantProvider — no net.
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        // The webhook address is built from it (d3e78c8f), never guessed.
        API_PUBLIC_URL: "https://api.example.test",
    },
}));

// The business-details refusal (DEC-068) has its own specs
// (`business-details.spec.ts`, `business-details.db.spec.ts`); here
// the business has its address.
jest.mock("../invoices/business-details", () => ({
    ...jest.requireActual<typeof import("../invoices/business-details")>(
        "../invoices/business-details",
    ),
    assertBusinessDetails: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        merchantPaymentProvider: {
            upsert: jest.fn(),
            count: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        // Active autopay memberships per provider (#921): none here.
        paymentMandate: { groupBy: jest.fn(async () => []) },
        job: { create: jest.fn() },
        customerNotice: { findFirst: jest.fn() },
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
            findFirst: jest.fn(),
            findUniqueOrThrow: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        orderItem: { findMany: jest.fn() },
        orderEvent: { create: jest.fn() },
        order: { findUnique: jest.fn() },
        storeSettings: { findUnique: jest.fn() },
        webhookEvent: { findFirst: jest.fn() },
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
    BadGatewayException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { assertBusinessDetails } from "../invoices/business-details";
import { encryptSecret } from "./crypto";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import { RefundCallError } from "./providers/provider.port";

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
            publicKey: "rzp_test_Key123",
            keyId: "rzp_test_Key123",
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
            publicKey: "rzp_test_Key123",
            // Saved without one: the list flags it (DEC-063).
            webhookSecretMissing: true,
            // Keys that passed the check need no attention (UX-012).
            attention: null,
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
            keyId: "rzp_test_Key123",
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

describe("PaymentsService.connectProvider — the public key (DEC-054)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        providerUpsert.mockImplementation(
            ({ create }: { create: Record<string, unknown> }) =>
                Promise.resolve({
                    id: "mpp_1",
                    createdAt: new Date("2026-01-01"),
                    updatedAt: new Date("2026-01-01"),
                    ...create,
                }),
        );
    });

    it("stores Razorpay's key id as its public key when setup sends only the pair", async () => {
        const { service } = makeService();
        const result = await service.connectProvider(ctx(), {
            provider: "RAZORPAY",
            keyId: "rzp_live_AbC123",
            keySecret: "super-secret-value",
        });
        const call = providerUpsert.mock.calls[0][0];
        expect(call.create.publicKey).toBe("rzp_live_AbC123");
        expect(call.update.publicKey).toBe("rzp_live_AbC123");
        expect(result.publicKey).toBe("rzp_live_AbC123");
        expect(JSON.stringify(result)).not.toContain("super-secret-value");
    });

    it("accepts a public key id sent beside it when it is the same key", async () => {
        const { service } = makeService();
        const result = await service.connectProvider(ctx(), {
            provider: "razorpay",
            publicKey: "rzp_test_AbC123",
            keyId: "rzp_test_AbC123",
            keySecret: "s3cret",
        });
        expect(result.publicKey).toBe("rzp_test_AbC123");
    });

    it("refuses a public key id that names a different key, before any write", async () => {
        const { service } = makeService();
        await expect(
            service.connectProvider(ctx(), {
                provider: "RAZORPAY",
                publicKey: "rzp_live_Other",
                keyId: "rzp_live_AbC123",
                keySecret: "s3cret",
            }),
        ).rejects.toThrow(/are different/);
        expect(providerUpsert).not.toHaveBeenCalled();
    });

    it.each([
        ["no rzp_ prefix", "AbC123"],
        ["an unknown mode", "rzp_prod_AbC123"],
        ["nothing after the mode", "rzp_live_"],
        ["a space inside", "rzp_live_AbC 123"],
    ])("refuses a Razorpay key id with %s", async (_why, keyId) => {
        const { service } = makeService();
        await expect(
            service.connectProvider(ctx(), {
                provider: "RAZORPAY",
                keyId,
                keySecret: "s3cret",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(providerUpsert).not.toHaveBeenCalled();
    });

    it("refuses the key id pasted as the secret too", async () => {
        const { service } = makeService();
        await expect(
            service.connectProvider(ctx(), {
                provider: "RAZORPAY",
                keyId: "rzp_live_AbC123", // gitleaks:allow
                keySecret: "rzp_live_AbC123", // gitleaks:allow
            }),
        ).rejects.toThrow(/secret is the key id/);
        expect(providerUpsert).not.toHaveBeenCalled();
    });

    it("leaves Cashfree's public key optional and its app id unchecked", async () => {
        const { service } = makeService();
        const bare = await service.connectProvider(ctx(), {
            provider: "CASHFREE",
            keyId: "TEST1234app",
            keySecret: "cfsk_secret",
        });
        expect(bare.publicKey).toBeNull();
        const withKey = await service.connectProvider(ctx(), {
            provider: "CASHFREE",
            keyId: "TEST1234app",
            keySecret: "cfsk_secret",
            publicKey: "  cf_public  ",
        });
        expect(withKey.publicKey).toBe("cf_public");
    });
});

describe("PaymentsService on a plan without online payments", () => {
    const providerCount = prisma.merchantPaymentProvider.count as jest.Mock;
    const KEYS = {
        provider: "razorpay",
        publicKey: "rzp_test_Key123",
        keyId: "rzp_test_Key123",
        keySecret: "super-secret-value",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(planMeter, "enforcedRow").mockImplementation(
            (_org: string, moduleId: string) =>
                Promise.resolve(
                    fakePaymentsRow(
                        "free",
                        moduleId as "payments" | "subscriptions",
                    ),
                ),
        );
        providerUpsert.mockImplementation(
            ({ create }: { create: Record<string, unknown> }) =>
                Promise.resolve({
                    id: "mpp_1",
                    createdAt: new Date("2026-01-01"),
                    updatedAt: new Date("2026-01-01"),
                    ...create,
                }),
        );
    });
    afterEach(() => jest.restoreAllMocks());

    async function locked(p: Promise<unknown>) {
        const err = await p.then(
            () => null,
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
            details: { code: "MODULE_LOCKED", moduleId: "payments" },
        });
    }

    it("refuses connecting a provider for the first time: 403 MODULE_LOCKED, nothing stored", async () => {
        const { service } = makeService();
        providerCount.mockResolvedValue(0);

        await locked(service.connectProvider(ctx(), KEYS));
        expect(providerUpsert).not.toHaveBeenCalled();
        expect(providerCount).toHaveBeenCalledWith({
            where: { organizationId: "org_1", provider: "RAZORPAY" },
        });
    });

    it("says the plan before asking for the business details (UX-006)", async () => {
        const { service } = makeService();
        providerCount.mockResolvedValue(0);

        await locked(service.connectProvider(ctx(), KEYS));
        // A plan without online payments hears about the plan, never an
        // address it would add for nothing.
        expect(assertBusinessDetails).not.toHaveBeenCalled();
    });

    it("lets a business re-enter the keys of a provider it already connected (renewals charge through it)", async () => {
        const { service } = makeService();
        providerCount.mockResolvedValue(1);

        await expect(
            service.connectProvider(ctx(), KEYS),
        ).resolves.toMatchObject({ provider: "RAZORPAY" });
        expect(providerUpsert).toHaveBeenCalledTimes(1);
    });

    it("refuses taking an order's payment online from the workspace", async () => {
        const { service, fake } = makeService();
        orderFindUnique.mockResolvedValue({
            id: "order_1",
            organizationId: "org_1",
            total: "42.50",
            currency: "INR",
        });

        await locked(service.createIntentForOrder(ctx(), "order_1"));
        expect(fake.calls).toHaveLength(0);
        expect(intentCreate).not.toHaveBeenCalled();
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

    it("says how many autopay memberships are active at each provider (#921)", async () => {
        const { service } = makeService();
        providerFindMany.mockResolvedValue([
            connectedRow(),
            connectedRow({ provider: "CASHFREE" }),
        ]);
        const groupBy = prisma.paymentMandate.groupBy as jest.Mock;
        groupBy.mockResolvedValueOnce([
            { provider: "RAZORPAY", _count: { _all: 3 } },
        ]);

        const rows = await service.listProviders(ctx());

        expect(groupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org_1", status: "ACTIVE" },
            }),
        );
        expect(rows.map((r) => [r.provider, r.activeMemberships])).toEqual([
            ["RAZORPAY", 3],
            ["CASHFREE", 0],
        ]);
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

    it.each([null, ""])(
        "makes no provider order through a Razorpay connection whose public key is %p (DEC-054)",
        async (publicKey) => {
            const { service, fake } = makeService();
            orderFindUnique.mockResolvedValue(ORDER);
            providerFindMany.mockResolvedValue([connectedRow({ publicKey })]);

            await expect(
                service.createIntentForOrder(ctx(), "order_1"),
            ).rejects.toThrow(/needs its public key id/);
            expect(fake.calls).toHaveLength(0);
            expect(intentCreate).not.toHaveBeenCalled();
        },
    );

    it("still makes a Cashfree order with no public key: its window opens on the session", async () => {
        const { service, fake } = makeService(
            new FakeMerchantProvider("CASHFREE"),
        );
        orderFindUnique.mockResolvedValue(ORDER);
        providerFindMany.mockResolvedValue([
            connectedRow({ provider: "CASHFREE", publicKey: null }),
        ]);
        intentCreate.mockResolvedValue({ id: "pi_1" });
        attemptCreate.mockResolvedValue({ id: "att_1" });

        const result = await service.createIntentForOrder(ctx(), "order_1");
        expect(fake.calls).toHaveLength(1);
        expect(result.publicKey).toBeNull();
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

    it("verifies Cashfree with its key secret when no webhook secret was saved (DEC-063)", async () => {
        // Cashfree signs webhooks with the client secret, so a connection
        // without a separate one must still verify — it used to refuse
        // every Cashfree delivery.
        const { service } = makeService();
        providerFindUnique.mockResolvedValue(
            connectedRow({
                provider: "CASHFREE",
                keyId: "TEST1234app",
                keySecret: "cf-client-secret",
            }),
        );
        await expect(
            service.getWebhookSecret("org_1", "cashfree"),
        ).resolves.toBe("cf-client-secret");
    });
});

describe("PaymentsService — a connection's webhook secret (DEC-063)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("lists a Razorpay connection saved without one as missing it, and says nothing secret", async () => {
        const { service } = makeService();
        const withSecret = (() => {
            const sealed = encryptSecret(
                JSON.stringify({
                    keyId: "rzp_live_New",
                    keySecret: "super-secret-value",
                    webhookSecret: "whsec_value",
                }),
            );
            return {
                ...connectedRow({ keyId: "rzp_live_New" }),
                id: "mpp_2",
                encryptedCredentials: sealed.ciphertext,
                credentialsIv: sealed.iv,
                credentialsAuthTag: sealed.authTag,
            };
        })();
        providerFindMany.mockResolvedValue([
            connectedRow(),
            withSecret,
            connectedRow({ provider: "CASHFREE" }),
        ]);

        const rows = await service.listProviders(ctx());

        expect(rows.map((r) => r.webhookSecretMissing)).toEqual([
            true,
            false,
            false,
        ]);
        const json = JSON.stringify(rows);
        expect(json).not.toContain("whsec_value");
        expect(json).not.toContain("super-secret-value");
    });

    it("reads the webhook setup as payment:read, scoped to the caller's business", async () => {
        const { service } = makeService();
        const findFirst = prisma.webhookEvent.findFirst as jest.Mock;
        findFirst.mockResolvedValue(null);

        const setup = await service.webhookSetup(ctx());

        expect(setup.map((s) => s.provider)).toEqual(["RAZORPAY", "CASHFREE"]);
        expect(setup[0].url).toMatch(/\/public\/webhooks\/razorpay\/org_1$/);
        expect(setup[0].secretRequired).toBe(true);
        expect(setup[1].secretRequired).toBe(false);
        for (const call of findFirst.mock.calls) {
            expect(call[0].where.organizationId).toBe("org_1");
        }
        await expect(
            service.webhookSetup(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe("PaymentsService.initiateRefund", () => {
    const refundFindMany = prisma.paymentRefund.findMany as jest.Mock;
    const refundUpdateMany = prisma.paymentRefund.updateMany as jest.Mock;
    const refundFindUniqueOrThrow = prisma.paymentRefund
        .findUniqueOrThrow as jest.Mock;
    const refundFindFirst = prisma.paymentRefund.findFirst as jest.Mock;
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

    /**
     * Refund rows as Prisma would keep them: created with their includes,
     * moved by `updateMany` only while its `where` still matches, read back
     * by id.
     */
    const made = new Map<string, Record<string, unknown>>();
    function echoCreate() {
        let n = 0;
        made.clear();
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
                    reason: data.reason,
                    providerRefundId: null,
                    paymentIntent: { provider: "RAZORPAY" },
                    lines: (lines ?? []).map((l) => ({
                        orderItemId: l.orderItemId,
                        quantity: l.quantity,
                        amountCents: l.amountCents,
                    })),
                };
                made.set(row.id, row);
                return Promise.resolve(row);
            },
        );
        refundUpdateMany.mockImplementation(
            ({
                where,
                data,
            }: {
                where: { id: string; status?: string };
                data: object;
            }) => {
                const row = made.get(where.id);
                if (!row || (where.status && row.status !== where.status)) {
                    return Promise.resolve({ count: 0 });
                }
                made.set(where.id, { ...row, ...data });
                return Promise.resolve({ count: 1 });
            },
        );
        refundFindUniqueOrThrow.mockImplementation(
            ({ where }: { where: { id: string } }) =>
                Promise.resolve(made.get(where.id)),
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

    it("sends the refund row's id as Saroh's reference", async () => {
        const { service, fake } = makeService();

        const result = await service.initiateRefund(ctx(), "order_1", {
            lines: [{ itemId: "li_b", quantity: 1 }],
        });

        expect(fake.refundCalls[0].reference).toBe("rf_1");
        expect(result.refundId).toBe("rf_1");
        expect(result.beingConfirmed).toBe(false);
        expect(result.providerRefundId).toBe("fake_refund_prov_intent_1");
    });

    it("marks the refund FAILED when the provider refuses it, freeing the lines", async () => {
        const { service, fake } = makeService();
        fake.failNextRefund("REFUSED");

        await expect(
            service.initiateRefund(ctx(), "order_1", {
                lines: [{ itemId: "li_b", quantity: 1 }],
            }),
        ).rejects.toBeInstanceOf(BadGatewayException);
        expect(made.get("rf_1")).toMatchObject({ status: "FAILED" });
        // Not a step the order went through.
        expect(eventCreate).not.toHaveBeenCalled();
    });

    it("an error before the call leaves Saroh (no provider) fails the row and passes through", async () => {
        const { service, fake } = makeService();
        providerFindUnique.mockResolvedValue(null);

        await expect(
            service.initiateRefund(ctx(), "order_1", {
                lines: [{ itemId: "li_b", quantity: 1 }],
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(made.get("rf_1")).toMatchObject({ status: "FAILED" });
        // Nothing was sent, so nothing can have gone back.
        expect(fake.refundCalls).toHaveLength(0);
        expect(eventCreate).not.toHaveBeenCalled();
    });

    it("keys that cannot be opened fail the row before the provider is called", async () => {
        const { service, fake } = makeService();
        const refund = jest.spyOn(fake, "refund");
        providerFindUnique.mockResolvedValue({
            ...connectedRow(),
            credentialsAuthTag: connectedRow().credentialsAuthTag.replace(
                /^./,
                (c) => (c === "0" ? "1" : "0"),
            ),
        });

        await expect(
            service.initiateRefund(ctx(), "order_1", {
                lines: [{ itemId: "li_b", quantity: 1 }],
            }),
        ).rejects.toThrow();
        expect(made.get("rf_1")).toMatchObject({ status: "FAILED" });
        expect(refund).not.toHaveBeenCalled();
        expect(eventCreate).not.toHaveBeenCalled();
    });

    it("an unknown answer keeps the refund PENDING with its money held — never FAILED", async () => {
        const { service, fake } = makeService();
        fake.failNextRefund("UNKNOWN");

        const result = await service.initiateRefund(ctx(), "order_1", {
            lines: [{ itemId: "li_b", quantity: 1 }],
        });

        expect(result.status).toBe("PENDING");
        expect(result.beingConfirmed).toBe(true);
        expect(result.refunds[0].beingConfirmed).toBe(true);
        expect(made.get("rf_1")).toMatchObject({
            status: "PENDING",
            providerRefundId: null,
        });
        // Whichever path settles it writes the step.
        expect(eventCreate).not.toHaveBeenCalled();
    });

    it.each([
        ["an unreadable answer", new SyntaxError("Unexpected end of JSON")],
        ["a plain bug", new TypeError("x is undefined")],
    ])(
        "any other error from the provider call (%s) holds the money — never FAILED",
        async (_what, error) => {
            const { service, fake } = makeService();
            jest.spyOn(fake, "refund").mockRejectedValueOnce(error);

            const result = await service.initiateRefund(ctx(), "order_1", {
                lines: [{ itemId: "li_b", quantity: 1 }],
            });

            expect(result.beingConfirmed).toBe(true);
            expect(made.get("rf_1")).toMatchObject({
                status: "PENDING",
                providerRefundId: null,
            });
        },
    );

    it("a new refund while one is being confirmed is capped by its reservation", async () => {
        const { service, fake } = makeService();
        // ₹15 of the ₹42.50 is held by a refund still being confirmed.
        intentFindMany.mockResolvedValue([
            { ...PAYMENT, refunds: [{ amountCents: 1500 }] },
        ]);

        await expect(
            service.initiateRefund(ctx(), "order_1", {
                lines: [
                    { itemId: "li_a", quantity: 2 },
                    { itemId: "li_b", quantity: 1 },
                    { itemId: "li_c", quantity: 1 },
                ],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(fake.refundCalls).toHaveLength(0);
    });

    describe("after part was recorded as refunded by hand (#865, DEC-116)", () => {
        // ₹42.50 paid online; ₹10 of it handed back by hand.
        beforeEach(() => {
            orderFindUnique.mockResolvedValue({
                ...ORDER,
                total: "42.50",
                paymentStatus: "PAID",
                paidByHand: "0.00",
                refundedByHand: "10.00",
            });
        });

        it("refuses the whole online balance: only what is left on the order", async () => {
            const { service, fake } = makeService();
            await expect(
                service.initiateRefund(ctx(), "order_1"),
            ).rejects.toThrow("At most ₹32.50 can be refunded.");
            await expect(
                service.initiateRefund(ctx(), "order_1", {
                    kind: "goodwill",
                    reason: "Late",
                    amountCents: 4250,
                }),
            ).rejects.toThrow("At most ₹32.50 can be refunded.");
            expect(refundCreate).not.toHaveBeenCalled();
            expect(fake.refundCalls).toHaveLength(0);
        });

        it("sends what is left", async () => {
            const { service, fake } = makeService();
            const result = await service.initiateRefund(ctx(), "order_1", {
                kind: "goodwill",
                reason: "Late",
                amountCents: 3250,
            });
            expect(result.amountCents).toBe(3250);
            expect(fake.refundCalls[0]).toEqual(
                expect.objectContaining({ amountCents: 3250 }),
            );
        });
    });

    describe("split across two payments", () => {
        // ₹30 paid first, ₹12.50 taken later (an edit's difference).
        const FIRST = { ...PAYMENT, id: "pi_1", amountCents: 3000 };
        const SECOND = {
            ...PAYMENT,
            id: "pi_2",
            providerIntentId: "prov_intent_2",
            amountCents: 1250,
        };

        beforeEach(() => intentFindMany.mockResolvedValue([FIRST, SECOND]));

        it("each line rides on the part its money comes back from", async () => {
            const { service } = makeService();

            const result = await service.initiateRefund(ctx(), "order_1");

            // Newest payment first: ₹12.50 from pi_2, ₹30 from pi_1.
            expect(result.refunds.map((r) => r.amountCents)).toEqual([
                1250, 3000,
            ]);
            // li_a (₹20) straddles the two: ₹12.50 of it comes from pi_2,
            // ₹7.50 from pi_1, so it rides whole on pi_2's part.
            expect(made.get("rf_1")?.lines).toEqual([
                { orderItemId: "li_a", quantity: 2, amountCents: 2000 },
            ]);
            expect(made.get("rf_2")?.lines).toEqual([
                { orderItemId: "li_b", quantity: 1, amountCents: 1500 },
                { orderItemId: "li_c", quantity: 1, amountCents: 750 },
            ]);
        });

        it("a refused part frees only its own lines; the part taken is still recorded", async () => {
            const { service, fake } = makeService();
            // The first call (pi_2's part) goes; the second is refused.
            jest.spyOn(fake, "refund")
                .mockImplementationOnce((input) =>
                    Promise.resolve({
                        providerRefundId: `ok_${input.reference}`,
                        status: "PENDING",
                        failed: false,
                    }),
                )
                .mockRejectedValueOnce(new RefundCallError("no", "REFUSED"));

            const result = await service.initiateRefund(ctx(), "order_1");

            expect(result.refunds.map((r) => r.status)).toEqual([
                "PENDING",
                "FAILED",
            ]);
            expect(made.get("rf_1")).toMatchObject({
                providerRefundId: "ok_rf_1",
            });
            // The step is for the money that went, not the whole ask.
            expect(eventCreate).toHaveBeenCalledTimes(1);
            expect(eventCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    kind: "REFUND",
                    amountCents: 1250,
                }),
            });
        });

        it("every part is sent even after one is refused", async () => {
            const { service, fake } = makeService();
            fake.failNextRefund("REFUSED");
            fake.failNextRefund("REFUSED");

            await expect(
                service.initiateRefund(ctx(), "order_1"),
            ).rejects.toBeInstanceOf(BadGatewayException);
            expect(fake.refundCalls).toHaveLength(2);
            expect(made.get("rf_1")?.status).toBe("FAILED");
            expect(made.get("rf_2")?.status).toBe("FAILED");
        });
    });

    describe("retryRefund — try again a refund being confirmed", () => {
        /** A reserved row whose first call's answer was lost. */
        async function lostAnswer(opts: { madeAnyway: boolean }) {
            const { service, fake } = makeService();
            fake.failNextRefund("UNKNOWN", opts);
            await service.initiateRefund(ctx(), "order_1", {
                lines: [{ itemId: "li_b", quantity: 1 }],
                reason: "burnt",
            });
            eventCreate.mockClear();
            refundFindFirst.mockImplementation(() =>
                Promise.resolve({
                    ...made.get("rf_1"),
                    paymentIntent: {
                        id: "pi_1",
                        provider: "RAZORPAY",
                        providerIntentId: "prov_intent_1",
                        currency: "INR",
                    },
                }),
            );
            return { service, fake };
        }

        it("finds the refund the lost call made and settles it — no second refund", async () => {
            const { service, fake } = await lostAnswer({ madeAnyway: true });

            const result = await service.retryRefund(ctx(), "order_1", "rf_1");

            expect(fake.findCalls).toEqual([
                expect.objectContaining({
                    reference: "rf_1",
                    providerPaymentRef: "pay_1",
                }),
            ]);
            expect(fake.refundCalls).toHaveLength(1);
            expect(result.beingConfirmed).toBe(false);
            expect(result.providerRefundId).toBe("fake_refund_prov_intent_1");
            expect(eventCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    kind: "REFUND",
                    amountCents: 1500,
                    note: "burnt",
                }),
            });
        });

        it("sends it again, same reference and amount, when the provider has none", async () => {
            const { service, fake } = await lostAnswer({ madeAnyway: false });

            await service.retryRefund(ctx(), "order_1", "rf_1");

            expect(fake.refundCalls).toHaveLength(2);
            expect(fake.refundCalls[1]).toMatchObject({
                reference: "rf_1",
                amountCents: 1500,
            });
            expect(refundCreate).toHaveBeenCalledTimes(1);
            expect(made.get("rf_1")).toMatchObject({
                status: "PENDING",
                providerRefundId: "fake_refund_prov_intent_1",
            });
        });

        it("a refund the provider says failed is FAILED, freeing the money", async () => {
            const { service, fake } = await lostAnswer({ madeAnyway: false });
            jest.spyOn(fake, "findRefund").mockResolvedValueOnce({
                providerRefundId: "rfnd_1",
                status: "failed",
                failed: true,
            });

            await expect(
                service.retryRefund(ctx(), "order_1", "rf_1"),
            ).rejects.toBeInstanceOf(BadGatewayException);
            expect(made.get("rf_1")?.status).toBe("FAILED");
            expect(eventCreate).not.toHaveBeenCalled();
        });

        it("a lookup that cannot answer changes nothing", async () => {
            const { service, fake } = await lostAnswer({ madeAnyway: false });
            jest.spyOn(fake, "findRefund").mockRejectedValueOnce(
                new RefundCallError("down", "UNKNOWN"),
            );

            await expect(
                service.retryRefund(ctx(), "order_1", "rf_1"),
            ).rejects.toBeInstanceOf(ServiceUnavailableException);
            expect(fake.refundCalls).toHaveLength(1);
            expect(made.get("rf_1")?.status).toBe("PENDING");
        });

        it("is 404 for a refund of another organization or order", async () => {
            const { service } = await lostAnswer({ madeAnyway: false });
            refundFindFirst.mockResolvedValue(null);

            await expect(
                service.retryRefund(ctx(), "order_1", "rf_other"),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(refundFindFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        id: "rf_other",
                        organizationId: "org_1",
                        // The order's own payments, or a treatment's on the
                        // booking invoice that names it (E9).
                        paymentIntent: {
                            OR: [
                                { orderId: "order_1" },
                                {
                                    orderId: null,
                                    invoice: {
                                        orderId: "order_1",
                                        source: "BOOKING",
                                        kind: "INVOICE",
                                    },
                                },
                            ],
                        },
                    },
                }),
            );
        });

        it("refuses a refund that has already settled", async () => {
            const { service, fake } = await lostAnswer({ madeAnyway: false });
            made.set("rf_1", { ...made.get("rf_1"), status: "SUCCEEDED" });

            await expect(
                service.retryRefund(ctx(), "order_1", "rf_1"),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(fake.findCalls).toHaveLength(0);
        });

        it("denies a MEMBER", async () => {
            const { service } = makeService();
            await expect(
                service.retryRefund(ctx({ role: "MEMBER" }), "order_1", "rf_1"),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });
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

describe("PaymentsService — keys checked on connect (UX-012)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        providerUpsert.mockImplementation(
            ({ create }: { create: Record<string, unknown> }) =>
                Promise.resolve({
                    id: "mpp_1",
                    createdAt: new Date("2026-01-01"),
                    updatedAt: new Date("2026-01-01"),
                    ...create,
                }),
        );
    });

    const KEYS = {
        provider: "razorpay",
        keyId: "rzp_test_Fake123",
        keySecret: "fake-secret-typo",
    };

    it("refuses keys the provider rejects: 400 under the secret, nothing stored", async () => {
        const { service, fake } = makeService();
        fake.credentialCheck = "REJECTED";

        const err = await service
            .connectProvider(ctx(), KEYS)
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toEqual({
            message: expect.stringContaining(
                "Razorpay didn't accept these keys",
            ),
            field: "keySecret",
        });
        expect(JSON.stringify((err as Error).message)).not.toContain(
            "fake-secret-typo",
        );
        expect(providerUpsert).not.toHaveBeenCalled();
        // It was asked with the keys typed, once.
        expect(fake.verifyCalls).toEqual([
            { keyId: "rzp_test_Fake123", keySecret: "fake-secret-typo" },
        ]);
    });

    it("refuses with a deliberate 503 when the provider can't say", async () => {
        const { service, fake } = makeService();
        fake.credentialCheck = "UNSURE";

        const err = await service
            .connectProvider(ctx(), KEYS)
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect((err as ServiceUnavailableException).getResponse()).toEqual({
            message: expect.stringContaining("couldn't reach Razorpay"),
            details: { reason: "provider-unreachable" },
        });
        expect(providerUpsert).not.toHaveBeenCalled();
    });

    it("keeps keys the provider accepts, and clears an earlier Needs attention", async () => {
        const { service } = makeService();

        const result = await service.connectProvider(ctx(), KEYS);

        expect(providerUpsert).toHaveBeenCalledTimes(1);
        const call = providerUpsert.mock.calls[0][0];
        expect(call.update).toEqual(
            expect.objectContaining({
                status: "CONNECTED",
                attentionReason: null,
                attentionAt: null,
            }),
        );
        expect(result.attention).toBeNull();
    });

    it("tells the team it works again when the keys end a refusal they were told of, but not whoever entered them (#555)", async () => {
        const { service } = makeService();
        const jobCreate = prisma.job.create as jest.Mock;
        providerFindUnique.mockResolvedValue({
            attentionAt: new Date("2026-10-08T09:00:00Z"),
        });
        (prisma.customerNotice.findFirst as jest.Mock).mockResolvedValue({
            eventKey: "team:provider:mpp_1:down:2026-10-08T09:00:00.000Z",
        });

        await service.connectProvider(ctx(), KEYS);

        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                type: "team.alert",
                payload: {
                    event: "provider",
                    change: "back",
                    channel: "PAYMENTS",
                    providerId: "mpp_1",
                    since: expect.any(String),
                    actorUserId: "user_1",
                },
            },
        });
    });

    it("says nothing on keys entered for a connection that was working", async () => {
        const { service } = makeService();
        providerFindUnique.mockResolvedValue({ attentionAt: null });

        await service.connectProvider(ctx(), KEYS);

        expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it("lists a connection that refused its keys as needing attention, and since when", async () => {
        const { service } = makeService();
        const since = new Date("2026-10-07T09:30:00Z");
        providerFindMany.mockResolvedValue([
            {
                ...connectedRow(),
                attentionReason: "KEYS_REFUSED",
                attentionAt: since,
            },
        ]);

        const [row] = await service.listProviders(ctx());

        expect(row.status).toBe("CONNECTED");
        expect(row.attention).toEqual({ reason: "KEYS_REFUSED", since });
    });
});

describe("PaymentsService — a provider failing at checkout (UX-012)", () => {
    const ORDER = {
        id: "order_1",
        organizationId: "org_1",
        storeId: "store_1",
        total: "42.50",
        currency: "INR",
        status: "PENDING",
        paymentStatus: "UNPAID",
        store: { settings: null },
    };
    const updateMany = prisma.merchantPaymentProvider.updateMany as jest.Mock;
    const jobCreate = prisma.job.create as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        orderFindUnique.mockResolvedValue(ORDER);
        providerFindMany.mockResolvedValue([connectedRow()]);
    });

    it("answers refused keys with a handled 503 in the customer's words, flags the connection and tells the team", async () => {
        const { service, fake } = makeService();
        const { ProviderKeysRefusedError } =
            await import("../../common/providers/provider-attention");
        fake.failNextIntent(
            new ProviderKeysRefusedError(
                "Razorpay order creation failed (HTTP 401)",
                401,
            ),
        );
        updateMany.mockResolvedValue({ count: 1 });

        const err = await service
            .createIntentForOrder(ctx(), "order_1")
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect((err as ServiceUnavailableException).getResponse()).toEqual({
            message:
                "The business can't take payment online right now. Please try again later, or pay them another way.",
            details: { reason: "provider-keys-refused" },
        });
        // Only a connection not already flagged is marked…
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: "mpp_1", organizationId: "org_1", attentionAt: null },
            data: {
                attentionReason: "KEYS_REFUSED",
                attentionAt: expect.any(Date),
            },
        });
        // …and the team's alert is queued with it, naming no key.
        expect(jobCreate).toHaveBeenCalledTimes(1);
        const job = jobCreate.mock.calls[0][0].data;
        expect(job).toEqual({
            organizationId: "org_1",
            type: "team.alert",
            payload: {
                event: "provider",
                change: "down",
                channel: "PAYMENTS",
                providerId: "mpp_1",
                since: expect.any(String),
            },
        });
        expect(JSON.stringify(job)).not.toContain("super-secret-value");
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it("tells the team once: a connection already flagged queues nothing more", async () => {
        const { service, fake } = makeService();
        const { ProviderKeysRefusedError } =
            await import("../../common/providers/provider-attention");
        fake.failNextIntent(new ProviderKeysRefusedError("HTTP 401", 401));
        updateMany.mockResolvedValue({ count: 0 });

        await expect(
            service.createIntentForOrder(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("answers any other provider failure with the same handled 503, flagging nothing", async () => {
        const { service, fake } = makeService();
        fake.failNextIntent(
            new Error("Razorpay order creation failed (HTTP 502)"),
        );

        const err = await service
            .createIntentForOrder(ctx(), "order_1")
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(
            (err as ServiceUnavailableException).getResponse(),
        ).toMatchObject({ details: { reason: "provider-unavailable" } });
        expect(updateMany).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("answers keys that won't open with the same handled 503, calling no provider and logging no secret", async () => {
        // A seeded business's placeholder keys: the seal doesn't open under
        // the server's key, and that was a bare 500 with nothing logged.
        const { service, fake } = makeService();
        providerFindMany.mockResolvedValue([
            { ...connectedRow(), credentialsAuthTag: "AAA=" },
        ]);
        const logged = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => undefined);

        const err = await service
            .createIntentForOrder(ctx(), "order_1")
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect((err as ServiceUnavailableException).getResponse()).toEqual({
            message:
                "The business can't take payment online right now. Please try again later, or pay them another way.",
            details: { reason: "provider-unavailable" },
        });
        expect(fake.calls).toHaveLength(0);
        expect(intentCreate).not.toHaveBeenCalled();
        // Not flagged: the server's key may be what's wrong, not theirs.
        expect(updateMany).not.toHaveBeenCalled();
        // Logged once, naming the provider, the business and the cause.
        expect(logged).toHaveBeenCalledTimes(1);
        const line = String(logged.mock.calls[0][0]);
        expect(line).toContain("Razorpay");
        expect(line).toContain("org_1");
        expect(line).toMatch(/authentication tag/i);
        expect(line).not.toContain("super-secret-value");
        logged.mockRestore();
    });

    it("answers keys that open to something other than a key pair the same way, quoting none of it", async () => {
        const { service, fake } = makeService();
        const sealed = encryptSecret("not-json super-secret-value");
        providerFindMany.mockResolvedValue([
            {
                ...connectedRow(),
                encryptedCredentials: sealed.ciphertext,
                credentialsIv: sealed.iv,
                credentialsAuthTag: sealed.authTag,
            },
        ]);
        const logged = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => undefined);

        await expect(
            service.createIntentForOrder(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(fake.calls).toHaveLength(0);
        expect(String(logged.mock.calls[0][0])).not.toContain(
            "super-secret-value",
        );
        logged.mockRestore();
    });

    it("clears the flag when a provider order goes through after all, and tells the team it works again (#555)", async () => {
        const { service } = makeService();
        const flaggedAt = new Date("2026-10-08T09:00:00Z");
        providerFindMany.mockResolvedValue([
            {
                ...connectedRow(),
                attentionReason: "KEYS_REFUSED",
                attentionAt: flaggedAt,
            },
        ]);
        intentCreate.mockResolvedValue({ id: "pi_1" });
        attemptCreate.mockResolvedValue({ id: "att_1" });
        updateMany.mockResolvedValue({ count: 1 });
        (prisma.customerNotice.findFirst as jest.Mock).mockResolvedValue({
            eventKey: `team:provider:mpp_1:down:${flaggedAt.toISOString()}`,
        });

        await service.createIntentForOrder(ctx(), "order_1");

        expect(updateMany).toHaveBeenCalledWith({
            where: {
                id: "mpp_1",
                organizationId: "org_1",
                attentionAt: flaggedAt,
            },
            data: { attentionReason: null, attentionAt: null },
        });
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                type: "team.alert",
                payload: {
                    event: "provider",
                    change: "back",
                    channel: "PAYMENTS",
                    providerId: "mpp_1",
                    since: expect.any(String),
                    actorUserId: null,
                },
            },
        });
    });

    it("still makes the customer's order when clearing the flag fails", async () => {
        const { service } = makeService();
        providerFindMany.mockResolvedValue([
            {
                ...connectedRow(),
                attentionReason: "KEYS_REFUSED",
                attentionAt: new Date("2026-10-08T09:00:00Z"),
            },
        ]);
        intentCreate.mockResolvedValue({ id: "pi_1" });
        attemptCreate.mockResolvedValue({ id: "att_1" });
        updateMany.mockRejectedValue(new Error("db down"));

        await expect(
            service.createIntentForOrder(ctx(), "order_1"),
        ).resolves.toMatchObject({ paymentIntentId: "pi_1" });
    });

    it("still answers the customer when the flag can't be written", async () => {
        const { service, fake } = makeService();
        const { ProviderKeysRefusedError } =
            await import("../../common/providers/provider-attention");
        fake.failNextIntent(new ProviderKeysRefusedError("HTTP 401", 401));
        updateMany.mockRejectedValue(new Error("db down"));

        await expect(
            service.createIntentForOrder(ctx(), "order_1"),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});
