// DB-free unit tests for the public invoice pay-link routes (ADR-007, U13):
// the token is the only key, the page sees an explicit allow-list, and a
// payment is started for the stored invoice's total through the business's
// own provider — whatever the request body says. @saroh/database is mocked
// (runInOrgContext runs its callback); the provider is a FakeMerchantProvider.
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        invoice: { findUnique: jest.fn(), findFirst: jest.fn() },
        site: { findFirst: jest.fn() },
        merchantPaymentProvider: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        paymentIntent: { findUnique: jest.fn(), create: jest.fn() },
        paymentAttempt: { create: jest.fn(), findFirst: jest.fn() },
    };
    return {
        ...actual,
        runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
        prisma: {
            // The lifecycle gate: no row means "not closed" (organization-lifecycle.gate.ts).
            organization: { findUnique: jest.fn().mockResolvedValue(null) },
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
    HttpException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { hashPayToken, mintPayToken } from "../invoices/pay-token";
import { encryptSecret } from "./crypto";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import {
    parseIntentBody,
    PublicInvoicesService,
} from "./public-invoices.service";

const invoiceFindUnique = prisma.invoice.findUnique as jest.Mock;
const invoiceFindFirst = prisma.invoice.findFirst as jest.Mock;
const siteFindFirst = prisma.site.findFirst as jest.Mock;
const providerFindMany = prisma.merchantPaymentProvider.findMany as jest.Mock;
const providerFindUnique = prisma.merchantPaymentProvider
    .findUnique as jest.Mock;
const intentFindUnique = prisma.paymentIntent.findUnique as jest.Mock;
const intentCreate = prisma.paymentIntent.create as jest.Mock;
const attemptCreate = prisma.paymentAttempt.create as jest.Mock;
const attemptFindFirst = prisma.paymentAttempt.findFirst as jest.Mock;

const { token: TOKEN, tokenHash: HASH } = mintPayToken();

/** Decimal-ish, as Prisma hands it over. */
const dec = (v: string) => ({ toString: () => v });

function connectedRow(provider = "RAZORPAY", createdAt = "2026-01-01") {
    const sealed = encryptSecret(
        JSON.stringify({ keyId: "rzp_key", keySecret: "super-secret-value" }),
    );
    return {
        id: `mpp_${provider}`,
        organizationId: "org_1",
        provider,
        status: "CONNECTED",
        publicKey: `${provider.toLowerCase()}_public`,
        encryptedCredentials: sealed.ciphertext,
        credentialsIv: sealed.iv,
        credentialsAuthTag: sealed.authTag,
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
    };
}

/** Everything the stored invoice row has — much of it must NOT be shown. */
const STORED = {
    number: "INV-0007",
    status: "ISSUED",
    issuedAt: new Date("2026-09-01T10:00:00Z"),
    dueAt: new Date("2999-01-01T10:00:00Z"),
    tax: dec("200.00"),
    total: dec("1400.00"),
    currency: "INR",
    billToName: "Asha Rao",
    organization: { name: "Lotus Yoga" },
    lines: [
        {
            description: "Monthly membership",
            quantity: 1,
            unitPrice: dec("1200.00"),
            amount: dec("1200.00"),
        },
    ],
};

function makeService(limiters?: {
    read?: FixedWindowRateLimiter;
    pay?: FixedWindowRateLimiter;
}) {
    const fake = new FakeMerchantProvider("RAZORPAY");
    const payments = new PaymentsService(new FakeProviderFactory(fake));
    const service = new PublicInvoicesService(
        payments,
        limiters?.read,
        limiters?.pay,
    );
    return { service, fake };
}

beforeEach(() => {
    jest.clearAllMocks();
    invoiceFindUnique.mockImplementation(
        ({ where }: { where: { payTokenHash: string } }) =>
            Promise.resolve(
                where.payTokenHash === HASH
                    ? { id: "inv_1", organizationId: "org_1" }
                    : null,
            ),
    );
    siteFindFirst.mockResolvedValue(null);
});

describe("PublicInvoicesService.read", () => {
    it("looks the invoice up by the token's hash, never the token", async () => {
        invoiceFindFirst.mockResolvedValue(STORED);
        await makeService().service.read(TOKEN);
        expect(invoiceFindUnique).toHaveBeenCalledWith({
            where: { payTokenHash: hashPayToken(TOKEN) },
            select: { id: true, organizationId: true },
        });
        expect(JSON.stringify(invoiceFindUnique.mock.calls)).not.toContain(
            TOKEN,
        );
    });

    it("answers with exactly the allow-listed fields", async () => {
        invoiceFindFirst.mockResolvedValue(STORED);
        const view = await makeService().service.read(TOKEN);
        expect(Object.keys(view).sort()).toEqual(
            [
                "billedTo",
                "businessName",
                "currency",
                "dueAt",
                "issuedAt",
                "lines",
                "number",
                "status",
                "tax",
                "theme",
                "total",
            ].sort(),
        );
        expect(view).toEqual({
            businessName: "Lotus Yoga",
            number: "INV-0007",
            issuedAt: "2026-09-01T10:00:00.000Z",
            dueAt: "2999-01-01T10:00:00.000Z",
            lines: [
                {
                    description: "Monthly membership",
                    quantity: 1,
                    unitPrice: "1200.00",
                    amount: "1200.00",
                },
            ],
            tax: "200.00",
            total: "1400.00",
            currency: "INR",
            status: "ISSUED",
            billedTo: "Asha Rao",
            theme: null,
        });
        // Asked only for what it shows: no email, contact, ids or notes.
        const select = invoiceFindFirst.mock.calls[0][0].select;
        for (const hidden of [
            "billToEmail",
            "contactId",
            "contact",
            "paymentNote",
            "paymentReference",
            "voidReason",
            "payTokenHash",
            "id",
        ]) {
            expect(select).not.toHaveProperty(hidden);
        }
    });

    it("says OVERDUE past the due date, as the workspace does", async () => {
        invoiceFindFirst.mockResolvedValue({
            ...STORED,
            dueAt: new Date("2026-01-01T00:00:00Z"),
        });
        const view = await makeService().service.read(TOKEN);
        expect(view.status).toBe("OVERDUE");
    });

    it.each([
        ["an unknown token", "not-a-real-token"],
        ["a rotated or revoked token", mintPayToken().token],
    ])("is a 404 for %s", async (_label, token) => {
        await expect(makeService().service.read(token)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(invoiceFindFirst).not.toHaveBeenCalled();
    });

    it("rate-limits one caller across different links", async () => {
        // The limiter used to be keyed on the token the caller sent, so every
        // new token opened a fresh window and nothing was throttled at all.
        invoiceFindFirst.mockResolvedValue(STORED);
        const { service } = makeService({
            read: new FixedWindowRateLimiter(2, 60_000),
        });
        const caller = "ip-hash-1";

        await service.read(TOKEN, caller);
        await service.read("a-different-token", caller).catch(() => undefined);
        const third = service.read("a-third-token", caller);

        await expect(third).rejects.toMatchObject({ status: 429 });
    });

    it("counts two callers on one link separately", async () => {
        invoiceFindFirst.mockResolvedValue(STORED);
        const { service } = makeService({
            read: new FixedWindowRateLimiter(1, 60_000),
        });

        await service.read(TOKEN, "ip-hash-1");

        await expect(service.read(TOKEN, "ip-hash-2")).resolves.toBeDefined();
    });

    it("rate-limits reads per link", async () => {
        invoiceFindFirst.mockResolvedValue(STORED);
        const { service } = makeService({
            read: new FixedWindowRateLimiter(2, 60_000),
        });
        await service.read(TOKEN);
        await service.read(TOKEN);
        const third = service.read(TOKEN);
        await expect(third).rejects.toBeInstanceOf(HttpException);
        await expect(third).rejects.toMatchObject({ status: 429 });
    });
});

describe("PublicInvoicesService.createIntent", () => {
    const PAYABLE = {
        id: "inv_1",
        organizationId: "org_1",
        status: "ISSUED",
        total: dec("1400.00"),
        currency: "INR",
    };

    it("charges the stored total and ignores an amount in the body", async () => {
        const { service, fake } = makeService();
        invoiceFindFirst.mockResolvedValue(PAYABLE);
        providerFindMany.mockResolvedValue([connectedRow()]);
        intentCreate.mockResolvedValue({ id: "pi_1" });

        const result = await service.createIntent(TOKEN, {
            amount: 1,
            amountCents: 100,
            currency: "USD",
            idempotencyKey: "key-1",
        });

        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]?.amountCents).toBe(140000);
        expect(fake.calls[0]?.currency).toBe("INR");
        // The invoice's id is the merchant reference the webhook echoes back.
        expect(fake.calls[0]?.orderId).toBe("inv_1");
        expect(intentCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                invoiceId: "inv_1",
                amountCents: 140000,
                currency: "INR",
                idempotencyKey: "key-1",
                status: "REQUIRES_PAYMENT",
            }),
        });
        expect(intentCreate.mock.calls[0][0].data).not.toHaveProperty(
            "orderId",
        );
        expect(attemptCreate).toHaveBeenCalledTimes(1);
        expect(result.amountCents).toBe(140000);
        expect(JSON.stringify(result)).not.toContain("super-secret-value");
    });

    it("replays the first intent for the same idempotency key on this invoice", async () => {
        const { service, fake } = makeService();
        invoiceFindFirst.mockResolvedValue(PAYABLE);
        intentFindUnique.mockResolvedValue({
            id: "pi_first",
            provider: "RAZORPAY",
            providerIntentId: "fake_razorpay_inv_1",
            amountCents: 140000,
            currency: "INR",
        });
        attemptFindFirst.mockResolvedValue({
            rawResponse: { clientParams: {} },
        });
        providerFindUnique.mockResolvedValue(connectedRow());

        const result = await service.createIntent(TOKEN, {
            idempotencyKey: "key-1",
        });

        expect(intentFindUnique).toHaveBeenCalledWith({
            where: {
                invoiceId_idempotencyKey: {
                    invoiceId: "inv_1",
                    idempotencyKey: "key-1",
                },
            },
        });
        expect(result.paymentIntentId).toBe("pi_first");
        expect(fake.calls).toHaveLength(0);
    });

    it("uses the business's first connected provider when it has several", async () => {
        const { service } = makeService();
        invoiceFindFirst.mockResolvedValue(PAYABLE);
        providerFindMany.mockResolvedValue([
            connectedRow("CASHFREE", "2026-01-01"),
            connectedRow("RAZORPAY", "2026-02-01"),
        ]);
        intentCreate.mockResolvedValue({ id: "pi_1" });

        const result = await service.createIntent(TOKEN, {});

        expect(providerFindMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", status: "CONNECTED" },
            orderBy: { createdAt: "asc" },
        });
        expect(result.provider).toBe("CASHFREE");
    });

    it("takes a named provider only if the business connected it", async () => {
        const { service } = makeService();
        invoiceFindFirst.mockResolvedValue(PAYABLE);
        providerFindUnique.mockResolvedValue(null);

        await expect(
            service.createIntent(TOKEN, { provider: "cashfree" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(providerFindUnique).toHaveBeenCalledWith({
            where: {
                organizationId_provider: {
                    organizationId: "org_1",
                    provider: "CASHFREE",
                },
            },
        });
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it.each(["PAID", "VOID"])(
        "refuses to start paying a %s invoice",
        async (status) => {
            const { service, fake } = makeService();
            invoiceFindFirst.mockResolvedValue({ ...PAYABLE, status });

            await expect(
                service.createIntent(TOKEN, {}),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(fake.calls).toHaveLength(0);
            expect(intentCreate).not.toHaveBeenCalled();
        },
    );

    it("is a 404 for an unknown, rotated or revoked token", async () => {
        const { service, fake } = makeService();
        await expect(
            service.createIntent(mintPayToken().token, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(invoiceFindFirst).not.toHaveBeenCalled();
        expect(fake.calls).toHaveLength(0);
    });

    it("rate-limits payment starts per link", async () => {
        const { service } = makeService({
            pay: new FixedWindowRateLimiter(1, 60_000),
        });
        invoiceFindFirst.mockResolvedValue({ ...PAYABLE, status: "PAID" });
        await expect(service.createIntent(TOKEN, {})).rejects.toBeInstanceOf(
            ConflictException,
        );
        await expect(service.createIntent(TOKEN, {})).rejects.toMatchObject({
            status: 429,
        });
    });
});

describe("PublicInvoicesService.createIntent — a pay-now hold (U19)", () => {
    const HOLD_DRAFT = {
        id: "inv_1",
        organizationId: "org_1",
        status: "DRAFT",
        source: "BOOKING",
        total: dec("800.00"),
        currency: "INR",
    };

    it("starts paying a hold's draft for its stored total while the hold lasts", async () => {
        const { service, fake } = makeService();
        invoiceFindFirst.mockResolvedValue({
            ...HOLD_DRAFT,
            booking: {
                status: "PENDING",
                holdExpiresAt: new Date(Date.now() + 10 * 60_000),
            },
        });
        providerFindMany.mockResolvedValue([connectedRow()]);
        intentCreate.mockResolvedValue({ id: "pi_1" });

        const result = await service.createIntent(TOKEN, { amount: 1 });

        expect(fake.calls[0]?.amountCents).toBe(80000);
        expect(intentCreate.mock.calls[0][0].data).toMatchObject({
            invoiceId: "inv_1",
            amountCents: 80000,
        });
        expect(result.amountCents).toBe(80000);
    });

    it("refuses once the hold has run out: the place may be someone else's", async () => {
        const { service, fake } = makeService();
        invoiceFindFirst.mockResolvedValue({
            ...HOLD_DRAFT,
            booking: {
                status: "PENDING",
                holdExpiresAt: new Date(Date.now() - 60_000),
            },
        });

        await expect(service.createIntent(TOKEN, {})).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(fake.calls).toHaveLength(0);
    });

    it("still refuses a hand-written draft", async () => {
        const { service, fake } = makeService();
        invoiceFindFirst.mockResolvedValue({
            ...HOLD_DRAFT,
            source: "MANUAL",
            booking: null,
        });
        await expect(service.createIntent(TOKEN, {})).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(fake.calls).toHaveLength(0);
    });
});

describe("parseIntentBody", () => {
    it("keeps only the provider and the idempotency key", () => {
        expect(
            parseIntentBody({
                provider: " razorpay ",
                idempotencyKey: "k",
                amount: 5,
                invoiceId: "someone-elses",
            }),
        ).toEqual({ provider: "RAZORPAY", idempotencyKey: "k" });
        expect(parseIntentBody(undefined)).toEqual({});
        expect(parseIntentBody("junk")).toEqual({});
    });

    it("refuses an unknown provider or a malformed key", () => {
        expect(() => parseIntentBody({ provider: "PAYPAL" })).toThrow(
            BadRequestException,
        );
        expect(() => parseIntentBody({ idempotencyKey: 42 })).toThrow(
            BadRequestException,
        );
        expect(() =>
            parseIntentBody({ idempotencyKey: "x".repeat(256) }),
        ).toThrow(BadRequestException);
    });
});
