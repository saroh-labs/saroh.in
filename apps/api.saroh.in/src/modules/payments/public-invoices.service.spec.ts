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
            findFirst: jest.fn(),
            findUnique: jest.fn(),
        },
        paymentIntent: {
            findUnique: jest.fn(),
            create: jest.fn(),
            // D13: an autopay charge under way on the invoice.
            findMany: jest.fn(),
        },
        paymentAttempt: { create: jest.fn(), findFirst: jest.fn() },
        // PAY_LINK_ON_SITE never configured: the pay link stays on the apex.
        featureFlagOverride: { findUnique: jest.fn().mockResolvedValue(null) },
        featureFlag: { findUnique: jest.fn().mockResolvedValue(null) },
        // DEC-070: Payments on (no row) unless a test turns it off.
        organizationModule: { findFirst: jest.fn().mockResolvedValue(null) },
        // How to pay us (R32): none set unless a test sets some.
        businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
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

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { planMeter } from "../billing/metering.service";
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
const providerFindFirst = prisma.merchantPaymentProvider.findFirst as jest.Mock;
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
    paidCents: 0,
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
    (prisma.paymentIntent.findMany as jest.Mock).mockResolvedValue([]);
});

describe("PublicInvoicesService.read", () => {
    it("looks the invoice up by the token's hash, never the token", async () => {
        invoiceFindFirst.mockResolvedValue(STORED);
        await makeService().service.read(TOKEN);
        expect(invoiceFindUnique).toHaveBeenCalledWith({
            where: { payTokenHash: hashPayToken(TOKEN) },
            // A renewal stays payable on any plan (online-payments-plan.ts).
            select: { id: true, organizationId: true, subscriptionId: true },
        });
        expect(JSON.stringify(invoiceFindUnique.mock.calls)).not.toContain(
            TOKEN,
        );
    });

    it("says what is paid so far and what is left on a partly paid invoice (DEC-173)", async () => {
        invoiceFindFirst.mockResolvedValue({ ...STORED, paidCents: 40_000 });
        const view = await makeService().service.read(TOKEN);
        expect(view).toMatchObject({
            total: "1400.00",
            paidSoFar: "400.00",
            leftToPay: "1000.00",
        });
    });

    it("answers with exactly the allow-listed fields", async () => {
        invoiceFindFirst.mockResolvedValue(STORED);
        const view = await makeService().service.read(TOKEN);
        expect(Object.keys(view).sort()).toEqual(
            [
                "billOfSupply",
                "billedTo",
                "businessName",
                "currency",
                "dueAt",
                "issuedAt",
                "lines",
                "number",
                "payUrl",
                // DEC-070: whether the page offers Pay.
                "payOnline",
                // R32: owed and not payable online, how to pay offline.
                "payInstructions",
                // UX-007: none set, how to reach the business instead.
                "businessContact",
                "status",
                "tax",
                "theme",
                "total",
                // DEC-173: paid so far and what is left to pay.
                "paidSoFar",
                "leftToPay",
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
                    // Only a line GST was added to ever carries one.
                    unitPay: null,
                    // A line with no rate says nothing about GST.
                    gst: null,
                },
            ],
            tax: "200.00",
            total: "1400.00",
            paidSoFar: "0.00",
            leftToPay: "1400.00",
            currency: "INR",
            status: "ISSUED",
            billedTo: "Asha Rao",
            billOfSupply: false,
            theme: null,
            // The flag off (never configured): the apex, as before DEC-069.
            payUrl: `https://saroh.app/pay/${TOKEN}`,
            // No provider can open the checkout window here.
            payOnline: false,
            // R32: the business set none.
            payInstructions: null,
            // UX-007: nor a phone or email.
            businessContact: null,
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

    describe("a tax invoice's lines, by how each price carried GST (12 Oct 2026)", () => {
        /** A registered business's stored line, as issuing froze it. */
        const stored = (line: Record<string, unknown>) => ({
            description: "Lip balm",
            discount: dec("0.00"),
            gstRate: dec("18.00"),
            igst: dec("0.00"),
            ...line,
        });
        const read = async (
            lines: Record<string, unknown>[],
            tax: string,
            total: string,
        ) => {
            invoiceFindFirst.mockResolvedValue({
                ...STORED,
                kind: "INVOICE",
                sellerGstin: "29ABCDE1234F1Z5",
                tax: dec(tax),
                total: dec(total),
                lines,
            });
            return makeService().service.read(TOKEN);
        };
        /** Lines, then the tax, are the total: the page's own column. */
        const adds = (view: {
            lines: { amount: string }[];
            tax: string;
            total: string;
        }) =>
            view.lines.reduce(
                (s, l) => s + Math.round(Number(l.amount) * 100),
                0,
            ) +
                Math.round(Number(view.tax) * 100) ===
            Math.round(Number(view.total) * 100);

        // ₹1,000, 3 × ₹780 and 7 × ₹99.99 at 18%, sold with GST added:
        // ₹1,180, 3 × ₹920.40 and 7 × ₹117.99 to pay.
        const ADDED = [
            stored({
                quantity: 1,
                unitPrice: dec("1180.00"),
                amount: dec("1180.00"),
                taxableValue: dec("1000.00"),
                cgst: dec("90.00"),
                sgst: dec("90.00"),
                gstPriceMode: "ADDED",
            }),
            stored({
                quantity: 3,
                unitPrice: dec("920.40"),
                amount: dec("2761.20"),
                taxableValue: dec("2340.00"),
                cgst: dec("210.60"),
                sgst: dec("210.60"),
                gstPriceMode: "ADDED",
            }),
            stored({
                quantity: 7,
                unitPrice: dec("117.99"),
                amount: dec("825.93"),
                taxableValue: dec("699.94"),
                cgst: dec("63.00"),
                sgst: dec("62.99"),
                gstPriceMode: "ADDED",
            }),
        ];
        // The same three typed prices, sold with GST inside them.
        const included = (mode: string | null) => [
            stored({
                quantity: 1,
                unitPrice: dec("1000.00"),
                amount: dec("1000.00"),
                taxableValue: dec("847.46"),
                cgst: dec("76.27"),
                sgst: dec("76.27"),
                gstPriceMode: mode,
            }),
            stored({
                quantity: 3,
                unitPrice: dec("780.00"),
                amount: dec("2340.00"),
                taxableValue: dec("1983.05"),
                cgst: dec("178.48"),
                sgst: dec("178.47"),
                gstPriceMode: mode,
            }),
            stored({
                quantity: 7,
                unitPrice: dec("99.99"),
                amount: dec("699.93"),
                taxableValue: dec("593.16"),
                cgst: dec("53.39"),
                sgst: dec("53.38"),
                gstPriceMode: mode,
            }),
        ];

        it("GST added: the typed price as the rate, the line before GST as the amount, and they add up", async () => {
            const view = await read(ADDED, "727.19", "4767.13");
            expect(view.lines).toEqual([
                {
                    description: "Lip balm",
                    quantity: 1,
                    unitPrice: "1000.00",
                    amount: "1000.00",
                    unitPay: null,
                    gst: {
                        mode: "ADDED",
                        rate: "18",
                        listCents: 100_000,
                        gstCents: 18_000,
                        payCents: 118_000,
                    },
                },
                {
                    description: "Lip balm",
                    quantity: 3,
                    unitPrice: "780.00",
                    amount: "2340.00",
                    unitPay: null,
                    gst: {
                        mode: "ADDED",
                        rate: "18",
                        listCents: 234_000,
                        gstCents: 42_120,
                        payCents: 276_120,
                    },
                },
                {
                    // 7 × ₹99.99 is ₹699.93; the frozen taxable value is
                    // ₹699.94, so one unit with its GST is sent too.
                    description: "Lip balm",
                    quantity: 7,
                    unitPrice: "99.99",
                    amount: "699.94",
                    unitPay: "117.99",
                    gst: {
                        mode: "ADDED",
                        rate: "18",
                        listCents: 69_994,
                        gstCents: 12_599,
                        payCents: 82_593,
                    },
                },
            ]);
            // 1,000 + 2,340 + 699.94 = 4,039.94; + 727.19 = 4,767.13.
            expect(view.tax).toBe("727.19");
            expect(view.total).toBe("4767.13");
            expect(adds(view)).toBe(true);
            // The discount is read for the line's reading, never sent.
            expect(JSON.stringify(view)).not.toContain("discount");
        });

        it.each([
            ["recorded as includes", "INCLUDED"],
            ["with no mode recorded", null],
        ])(
            "a line %s: the amount to pay, exactly as before",
            async (_name, mode) => {
                const view = await read(included(mode), "616.26", "4039.93");
                expect(
                    view.lines.map((l) => [l.unitPrice, l.amount, l.unitPay]),
                ).toEqual([
                    ["1000.00", "1000.00", null],
                    ["780.00", "2340.00", null],
                    ["99.99", "699.93", null],
                ]);
                expect(view.lines.map((l) => l.gst)).toEqual([
                    {
                        mode: "INCLUDED",
                        rate: "18",
                        listCents: 100_000,
                        gstCents: 15_254,
                        payCents: 100_000,
                    },
                    {
                        mode: "INCLUDED",
                        rate: "18",
                        listCents: 234_000,
                        gstCents: 35_695,
                        payCents: 234_000,
                    },
                    {
                        mode: "INCLUDED",
                        rate: "18",
                        listCents: 69_993,
                        gstCents: 10_677,
                        payCents: 69_993,
                    },
                ]);
                expect(view.total).toBe("4039.93");
            },
        );

        it("both on one paper: each line reads its own way", async () => {
            const view = await read(
                [ADDED[0], included("INCLUDED")[0]],
                "332.54",
                "2180.00",
            );
            expect(
                view.lines.map((l) => [l.unitPrice, l.amount, l.gst?.mode]),
            ).toEqual([
                ["1000.00", "1000.00", "ADDED"],
                ["1000.00", "1000.00", "INCLUDED"],
            ]);
            // ₹1,000 + ₹180, and ₹1,000 with ₹152.54 inside: ₹2,180.
            expect(
                view.lines.reduce((s, l) => s + (l.gst?.payCents ?? 0), 0),
            ).toBe(218_000);
        });
    });

    it("calls a registered business's exempt paper a bill of supply, sending no GSTIN or rate", async () => {
        invoiceFindFirst.mockResolvedValue({
            ...STORED,
            tax: dec("0.00"),
            kind: "INVOICE",
            sellerGstin: "29ABCDE1234F1Z5",
            lines: STORED.lines.map((l) => ({ ...l, gstRate: dec("0.00") })),
        });
        const view = await makeService().service.read(TOKEN);
        expect(view.billOfSupply).toBe(true);
        expect(JSON.stringify(view)).not.toContain("29ABCDE1234F1Z5");
        expect(JSON.stringify(view)).not.toContain("gstRate");
    });

    it.each([
        ["a taxed line", "INVOICE", "18.00"],
        ["a rate never set", "INVOICE", null],
        ["a credit note", "CREDIT_NOTE", "0.00"],
    ])("is not a bill of supply with %s", async (_label, kind, rate) => {
        invoiceFindFirst.mockResolvedValue({
            ...STORED,
            kind,
            sellerGstin: "29ABCDE1234F1Z5",
            lines: STORED.lines.map((l) => ({
                ...l,
                gstRate: rate === null ? null : dec(rate),
            })),
        });
        const view = await makeService().service.read(TOKEN);
        expect(view.billOfSupply).toBe(false);
    });

    it("says OVERDUE past the due date, as the workspace does", async () => {
        invoiceFindFirst.mockResolvedValue({
            ...STORED,
            dueAt: new Date("2026-01-01T00:00:00Z"),
        });
        const view = await makeService().service.read(TOKEN);
        expect(view.status).toBe("OVERDUE");
    });

    it("names the business as it was when the invoice was issued, not since (DEC-082)", async () => {
        // Issued as Lotus Yoga; the business has been renamed since.
        invoiceFindFirst.mockResolvedValue({
            ...STORED,
            sellerName: "Lotus Yoga",
            organization: { name: "Lotus Wellness Studio" },
        });
        const view = await makeService().service.read(TOKEN);
        expect(view.businessName).toBe("Lotus Yoga");
        // The customer's receipt (A5) reads the same paper.
        expect(invoiceFindFirst.mock.calls[0][0].select.sellerName).toBe(true);
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
        paidCents: 0,
        currency: "INR",
    };

    it("charges what is left on a partly paid invoice, never its whole total (DEC-173)", async () => {
        const { service, fake } = makeService();
        invoiceFindFirst.mockResolvedValue({ ...PAYABLE, paidCents: 40_000 });
        providerFindFirst.mockResolvedValue(connectedRow());
        intentCreate.mockResolvedValue({ id: "pi_1" });

        await service.createIntent(TOKEN, { amount: 1400 });

        expect(fake.calls[0]?.amountCents).toBe(100_000);
        expect(intentCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ amountCents: 100_000 }),
        });
    });

    it("charges the stored total and ignores an amount in the body", async () => {
        const { service, fake } = makeService();
        invoiceFindFirst.mockResolvedValue(PAYABLE);
        providerFindFirst.mockResolvedValue(connectedRow());
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

    it("uses the business's first connection that can open the checkout window, as its pay link was minted (B11, D22)", async () => {
        const { service } = makeService();
        invoiceFindFirst.mockResolvedValue(PAYABLE);
        // An older Razorpay connection without its key id is passed over.
        providerFindFirst.mockResolvedValue(
            connectedRow("CASHFREE", "2026-02-01"),
        );
        intentCreate.mockResolvedValue({ id: "pi_1" });

        const result = await service.createIntent(TOKEN, {});

        expect(providerFindFirst).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                status: "CONNECTED",
                OR: [
                    { provider: { not: "RAZORPAY" } },
                    {
                        AND: [
                            { publicKey: { not: null } },
                            { publicKey: { not: "" } },
                        ],
                    },
                ],
            },
            orderBy: { createdAt: "asc" },
        });
        expect(result.provider).toBe("CASHFREE");
    });

    it("shows how to pay offline on an owed view-only invoice, and never on a paid one (R32)", async () => {
        const profileFindUnique = prisma.businessProfile
            .findUnique as jest.Mock;
        // Made-up details.
        profileFindUnique.mockResolvedValue({
            payUpiId: "lotus.yoga@okexample",
            payBankAccountName: "Lotus Yoga",
            payBankAccountNumber: "123456789012",
            payBankIfsc: "ABCD0123456",
            payBankName: null,
            payNote: null,
        });
        invoiceFindFirst.mockResolvedValue(STORED);
        // Payable online: the page's Pay button, and no offline details.
        const online = await makeService().service.read(TOKEN);
        expect(online.payOnline).toBe(true);
        expect(online).not.toHaveProperty("payInstructions");
        // No provider can open the window: a view link, with them.
        providerFindFirst.mockResolvedValue(null);
        const view = await makeService().service.read(TOKEN);
        expect(view.payOnline).toBe(false);
        expect(view.payInstructions).toEqual(
            expect.objectContaining({
                upiId: "lotus.yoga@okexample",
                bankIfsc: "ABCD0123456",
            }),
        );
        expect(profileFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org_1" } }),
        );

        profileFindUnique.mockClear();
        invoiceFindFirst.mockResolvedValue({ ...STORED, status: "PAID" });
        const paid = await makeService().service.read(TOKEN);
        expect(paid).not.toHaveProperty("payInstructions");
        expect(profileFindUnique).not.toHaveBeenCalled();
        profileFindUnique.mockResolvedValue(null);
    });

    it("names a way to reach the business when it set no way to pay (UX-007)", async () => {
        const profileFindUnique = prisma.businessProfile
            .findUnique as jest.Mock;
        // Made-up details: no pay instructions, a phone and an email.
        profileFindUnique.mockResolvedValue({
            payUpiId: null,
            payBankAccountName: null,
            payBankAccountNumber: null,
            payBankIfsc: null,
            payBankName: null,
            payNote: null,
            phone: "+919800000000",
            contactEmail: "hello@lotus.example",
        });
        invoiceFindFirst.mockResolvedValue(STORED);
        providerFindFirst.mockResolvedValue(null);
        const view = await makeService().service.read(TOKEN);
        expect(view.payInstructions).toBeNull();
        expect(view.businessContact).toEqual({
            phone: "+919800000000",
            email: "hello@lotus.example",
        });

        // With a way to pay set, the page shows that, and no contact.
        profileFindUnique.mockResolvedValue({
            payUpiId: "lotus.yoga@okexample",
            phone: "+919800000000",
        });
        const withUpi = await makeService().service.read(TOKEN);
        expect(withUpi).not.toHaveProperty("businessContact");

        // Payable online: the same contact sits under Pay, for a question
        // before paying.
        profileFindUnique.mockResolvedValue({
            phone: "+919800000000",
            contactEmail: "hello@lotus.example",
        });
        providerFindFirst.mockResolvedValue(connectedRow());
        const online = await makeService().service.read(TOKEN);
        expect(online.payOnline).toBe(true);
        expect(online.businessContact).toEqual({
            phone: "+919800000000",
            email: "hello@lotus.example",
        });
        providerFindFirst.mockResolvedValue(null);
        profileFindUnique.mockResolvedValue(null);
    });

    it("refuses when no connection can open the window: the business doesn't take payment online (DEC-070)", async () => {
        const { service } = makeService();
        invoiceFindFirst.mockResolvedValue(PAYABLE);
        // A Razorpay connection missing its public key id counts as none.
        providerFindFirst.mockResolvedValue(null);

        await expect(service.createIntent(TOKEN, {})).rejects.toThrow(
            "This business doesn't take payment online.",
        );
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it("refuses with Payments switched off, even with a provider (DEC-070)", async () => {
        const { service } = makeService();
        invoiceFindFirst.mockResolvedValue(PAYABLE);
        providerFindFirst.mockResolvedValue(connectedRow("RAZORPAY"));
        (
            prisma.organizationModule.findFirst as jest.Mock
        ).mockResolvedValueOnce({ id: "om_1" });

        await expect(service.createIntent(TOKEN, {})).rejects.toThrow(
            "This business doesn't take payment online.",
        );
        expect(intentCreate).not.toHaveBeenCalled();
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

describe("PublicInvoicesService on a plan without online payments", () => {
    const PAYABLE = {
        id: "inv_1",
        organizationId: "org_1",
        status: "ISSUED",
        total: dec("1400.00"),
        paidCents: 0,
        currency: "INR",
        subscriptionId: null,
    };

    beforeEach(() => {
        jest.spyOn(planMeter, "enforcedRow").mockResolvedValue(
            fakePaymentsRow("free", "payments"),
        );
        providerFindFirst.mockResolvedValue(connectedRow());
        intentCreate.mockResolvedValue({ id: "pi_1" });
    });
    afterEach(() => jest.restoreAllMocks());

    it("opens the business's own invoice as a view link, and refuses paying it online", async () => {
        const { service, fake } = makeService();
        invoiceFindFirst.mockResolvedValue({ ...STORED, ...PAYABLE });

        await expect(service.read(TOKEN)).resolves.toMatchObject({
            payOnline: false,
        });
        await expect(service.createIntent(TOKEN, {})).rejects.toThrow(
            "This business doesn't take payment online.",
        );
        expect(fake.calls).toHaveLength(0);
        expect(intentCreate).not.toHaveBeenCalled();
    });

    it("keeps a renewal of a subscription the business already has payable online", async () => {
        const { service, fake } = makeService();
        invoiceFindUnique.mockResolvedValue({
            id: "inv_1",
            organizationId: "org_1",
            subscriptionId: "sub_1",
        });
        invoiceFindFirst.mockResolvedValue({
            ...PAYABLE,
            subscriptionId: "sub_1",
        });

        await expect(service.createIntent(TOKEN, {})).resolves.toMatchObject({
            amountCents: 140000,
        });
        expect(fake.calls).toHaveLength(1);
    });
});

describe("PublicInvoicesService.createIntent — a pay-now hold (U19)", () => {
    const HOLD_DRAFT = {
        id: "inv_1",
        organizationId: "org_1",
        status: "DRAFT",
        source: "BOOKING",
        total: dec("800.00"),
        paidCents: 0,
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
        providerFindFirst.mockResolvedValue(connectedRow());
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
