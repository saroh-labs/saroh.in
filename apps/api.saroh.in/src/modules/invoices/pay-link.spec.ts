// The workspace side of an invoice's pay link (ADR-007, U13): who may make
// one, when, that only the token's hash is kept, that asking again replaces
// it, and that voiding revokes it. The database is mocked.
// The business-details refusal (DEC-068) has its own specs
// (`business-details.spec.ts`, `business-details.db.spec.ts`); here
// the business has its address.
jest.mock("./business-details", () => ({
    ...jest.requireActual<typeof import("./business-details")>(
        "./business-details",
    ),
    assertBusinessDetails: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        invoice: { findFirst: jest.fn(), updateMany: jest.fn() },
        // Unregistered: a receipt may be voided (ADR-008).
        businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
        organization: {
            findUnique: jest.fn().mockResolvedValue({ name: "Rye & Co." }),
        },
    };
    return {
        ...actual,
        prisma: {
            invoice: { findFirst: jest.fn(), updateMany: jest.fn() },
            merchantPaymentProvider: {
                count: jest.fn(),
                findFirst: jest.fn(),
            },
            paymentIntent: { findMany: jest.fn() },
            // "How to pay us" on the read of an unpaid one (#833): none set.
            businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
            // DEC-070: Payments on (no row) unless a test turns it off.
            organizationModule: {
                findFirst: jest.fn().mockResolvedValue(null),
            },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});

import { ConflictException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { InvoicesService } from "./invoices.service";
import { hashPayToken } from "./pay-token";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as {
    invoice: Mocked;
    merchantPaymentProvider: Mocked;
    paymentIntent: Mocked;
    __tx: Record<string, Mocked>;
};
const tx = db.__tx;

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const member: OrganizationContext = { ...owner, role: "MEMBER" };

const decimal = (s: string) => ({ toString: () => s });

function row(over: Record<string, unknown> = {}) {
    return {
        id: "inv_1",
        number: "INV-0001",
        status: "ISSUED",
        contactId: "c_1",
        contact: null,
        billToName: "Asha Rao",
        billToEmail: "asha@example.com",
        currency: "INR",
        subtotal: decimal("1200"),
        tax: decimal("0"),
        total: decimal("1200"),
        issuedAt: new Date("2026-09-01T00:00:00Z"),
        dueAt: new Date("2999-01-01T00:00:00Z"),
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        paymentMethod: null,
        paymentReference: null,
        paymentNote: null,
        source: "MANUAL",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissues: [],
        createdByUserId: "user_1",
        createdAt: new Date("2026-09-01T00:00:00Z"),
        updatedAt: new Date("2026-09-01T00:00:00Z"),
        lines: [],
        ...over,
    };
}

const service = new InvoicesService();

/** A connection that can open the checkout window. */
const RAZORPAY_READY = {
    id: "mpp_1",
    provider: "RAZORPAY",
    status: "CONNECTED",
    publicKey: "rzp_test_Public1",
};

beforeEach(() => {
    jest.clearAllMocks();
    db.invoice.findFirst?.mockResolvedValue(row());
    db.invoice.updateMany?.mockResolvedValue({ count: 1 });
    db.merchantPaymentProvider.count?.mockResolvedValue(1);
    db.merchantPaymentProvider.findFirst?.mockResolvedValue(RAZORPAY_READY);
    db.paymentIntent.findMany?.mockResolvedValue([]);
});

describe("making a pay link", () => {
    it("keeps only the token's hash and hands the token back once", async () => {
        const { token } = await service.createPayLink(owner, "inv_1");

        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits, base64url
        expect(db.invoice.updateMany).toHaveBeenCalledWith({
            // Never an order's invoice or a credit note (ADR-008).
            where: {
                id: "inv_1",
                organizationId: "org_1",
                status: "ISSUED",
                orderId: null,
                kind: { not: "CREDIT_NOTE" },
            },
            data: { payTokenHash: hashPayToken(token) },
        });
        expect(JSON.stringify(db.invoice.updateMany?.mock.calls)).not.toContain(
            token,
        );
    });

    it("makes a new token every time, replacing the one before", async () => {
        const first = await service.createPayLink(owner, "inv_1");
        const second = await service.createPayLink(owner, "inv_1");
        expect(second.token).not.toBe(first.token);
        const hashes = db.invoice.updateMany?.mock.calls.map(
            (c: [{ data: { payTokenHash: string } }]) => c[0].data.payTokenHash,
        );
        expect(hashes).toEqual([
            hashPayToken(first.token),
            hashPayToken(second.token),
        ]);
    });

    it.each([
        ["DRAFT", "Issue the invoice before sharing a pay link."],
        ["PAID", "This invoice is already paid."],
        ["VOID", "A void invoice cannot be paid."],
    ])("refuses a %s invoice", async (status, message) => {
        db.invoice.findFirst?.mockResolvedValue(row({ status }));
        await expect(service.createPayLink(owner, "inv_1")).rejects.toThrow(
            message,
        );
        expect(db.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("refuses when no payment provider is connected", async () => {
        db.merchantPaymentProvider.findFirst?.mockResolvedValue(null);
        await expect(service.createPayLink(owner, "inv_1")).rejects.toThrow(
            new ConflictException(
                "Connect a payment provider to send a pay link.",
            ),
        );
        expect(db.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("looks only for a connection that can open the checkout window (B11, D22)", async () => {
        await service.createPayLink(owner, "inv_1");
        expect(db.merchantPaymentProvider.findFirst).toHaveBeenCalledWith({
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
    });

    it("refuses a Razorpay connection missing its public key id, saying what it needs", async () => {
        // None can open the window; the one connected is Razorpay, no key.
        db.merchantPaymentProvider.findFirst
            ?.mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                ...RAZORPAY_READY,
                publicKey: null,
            });
        await expect(service.createPayLink(owner, "inv_1")).rejects.toThrow(
            "Your Razorpay connection needs its public key id before it can take a pay link. Add it in Settings › Providers.",
        );
        expect(db.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("refuses a role without invoice:write", async () => {
        await expect(
            service.createPayLink(member, "inv_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("says so when the invoice changed under it", async () => {
        db.invoice.updateMany?.mockResolvedValue({ count: 0 });
        await expect(service.createPayLink(owner, "inv_1")).rejects.toThrow(
            "This invoice changed. Reload it.",
        );
    });

    it("makes it on the caller's transaction when given one", async () => {
        const own = {
            invoice: {
                findFirst: jest.fn().mockResolvedValue(row()),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            merchantPaymentProvider: {
                findFirst: jest.fn().mockResolvedValue(RAZORPAY_READY),
            },
            organizationModule: {
                findFirst: jest.fn().mockResolvedValue(null),
            },
            // D13: no autopay charge under way.
            paymentIntent: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const { token } = await service.createPayLinkInTx(
            own as never,
            owner,
            "inv_1",
        );
        expect(own.invoice.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { payTokenHash: hashPayToken(token) },
            }),
        );
        expect(db.invoice.findFirst).not.toHaveBeenCalled();
        expect(db.invoice.updateMany).not.toHaveBeenCalled();
    });
});

describe("a pay link on a plan without online payments", () => {
    beforeEach(() => {
        jest.spyOn(planMeter, "enforcedRow").mockImplementation(
            (_org: string, moduleId: string) =>
                Promise.resolve(
                    fakePaymentsRow(
                        "free",
                        moduleId as "payments" | "subscriptions",
                    ),
                ),
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it("refuses one for the business's own invoice: 403 MODULE_LOCKED, no token kept", async () => {
        const err = await service.createPayLink(owner, "inv_1").then(
            () => null,
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
            details: { code: "MODULE_LOCKED", moduleId: "payments" },
        });
        expect(db.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("still makes one for a renewal of a subscription the business already has", async () => {
        db.invoice.findFirst?.mockResolvedValue(
            row({ source: "SUBSCRIPTION", subscriptionId: "sub_1" }),
        );

        const { token } = await service.createPayLink(owner, "inv_1");

        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(db.invoice.updateMany).toHaveBeenCalled();
    });

    it("still makes a view link, which takes no money (DEC-070)", async () => {
        const own = {
            invoice: {
                findFirst: jest.fn().mockResolvedValue(row()),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            merchantPaymentProvider: {
                findFirst: jest.fn().mockResolvedValue(null),
            },
            organizationModule: {
                findFirst: jest.fn().mockResolvedValue(null),
            },
            paymentIntent: { findMany: jest.fn().mockResolvedValue([]) },
        };
        await expect(
            service.createPayLinkInTx(own as never, owner, "inv_1", {
                requireProvider: false,
            }),
        ).resolves.toHaveProperty("token");
        expect(own.invoice.updateMany).toHaveBeenCalled();
    });

    it("copies a view link from Invoice Detail, with no provider (#833)", async () => {
        db.merchantPaymentProvider.findFirst?.mockResolvedValue(null);
        const { token } = await service.createViewLink(owner, "inv_1");
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(db.invoice.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { payTokenHash: hashPayToken(token) },
            }),
        );
    });

    it("says the plan is what stands in the way on the read (#835)", async () => {
        const view = await service.get(owner, "inv_1");
        expect(view.online?.onlineBlocker).toBe("PLAN");
    });

    it("a renewal's read names no plan blocker: it stays payable", async () => {
        db.invoice.findFirst?.mockImplementation(
            (args: { select: Record<string, unknown> }) =>
                Promise.resolve(
                    "payTokenHash" in args.select
                        ? { payTokenHash: null, subscriptionId: "sub_1" }
                        : row({
                              source: "SUBSCRIPTION",
                              subscriptionId: "sub_1",
                          }),
                ),
        );
        const view = await service.get(owner, "inv_1");
        expect(view.online?.onlineBlocker).toBeNull();
    });
});

describe("a view link (#833)", () => {
    it("refuses a role without invoice:write", async () => {
        await expect(
            service.createViewLink(member, "inv_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses a draft: only issued paper has a link", async () => {
        db.invoice.findFirst?.mockResolvedValue(
            row({ status: "DRAFT", number: null }),
        );
        await expect(
            service.createViewLink(owner, "inv_1"),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("How to pay us on the read (#833)", () => {
    const PAY = {
        payUpiId: "rye@okhdfc",
        payBankAccountName: null,
        payBankAccountNumber: null,
        payBankIfsc: null,
        payBankName: null,
        payNote: null,
    };
    const profile = () =>
        (prisma as unknown as { businessProfile: Mocked }).businessProfile;

    it("carries it on an unpaid invoice", async () => {
        profile().findUnique?.mockResolvedValueOnce(PAY);
        const view = await service.get(owner, "inv_1");
        expect(view.payInstructions).toMatchObject({ upiId: "rye@okhdfc" });
    });

    it("leaves it off a paid one", async () => {
        db.invoice.findFirst?.mockResolvedValue(
            row({ status: "PAID", paidAt: new Date("2026-09-02T00:00:00Z") }),
        );
        const view = await service.get(owner, "inv_1");
        expect(view).not.toHaveProperty("payInstructions");
        expect(profile().findUnique).not.toHaveBeenCalled();
    });
});

describe("one charge at a time (D13)", () => {
    it("refuses a pay link while an autopay charge is under way", async () => {
        db.paymentIntent.findMany?.mockResolvedValue([
            {
                id: "pi_m",
                invoiceId: "inv_1",
                debitAfter: new Date("2026-10-02T10:00:00Z"),
                createdAt: new Date("2026-10-01T10:00:00Z"),
            },
        ]);
        const attempt = service.createPayLink(owner, "inv_1");
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow("Autopay charge in progress");
        expect(db.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("says so on the invoice read, with when the debit is asked for", async () => {
        db.paymentIntent.findMany?.mockImplementation(
            (args: { where: { status?: unknown } }) =>
                Promise.resolve(
                    args.where.status === "SUCCEEDED"
                        ? []
                        : [
                              {
                                  id: "pi_m",
                                  invoiceId: "inv_1",
                                  debitAfter: new Date("2026-10-02T10:00:00Z"),
                                  createdAt: new Date("2026-10-01T10:00:00Z"),
                              },
                          ],
                ),
        );
        const view = await service.get(owner, "inv_1");
        expect(view.online?.autopayCharge).toEqual({
            at: "2026-10-02T10:00:00.000Z",
        });
    });
});

describe("revoking a pay link", () => {
    it("clears the token when the invoice is voided", async () => {
        tx.invoice?.findFirst?.mockResolvedValue({
            status: "ISSUED",
            kind: "INVOICE",
            orderId: null,
            bookingId: null,
            sellerGstin: null,
        });
        tx.businessProfile?.findUnique?.mockResolvedValue(null);
        tx.invoice?.updateMany?.mockResolvedValue({ count: 1 });

        await service.voidInvoice(owner, "inv_1", { reason: "Wrong amount" });

        expect(tx.invoice?.updateMany).toHaveBeenCalledWith({
            where: { id: "inv_1", organizationId: "org_1", status: "ISSUED" },
            data: expect.objectContaining({
                status: "VOID",
                payTokenHash: null,
            }),
        });
    });
});

describe("the invoice read", () => {
    it("says whether a provider is connected and a link is out, never the hash", async () => {
        db.invoice.findFirst?.mockImplementation(
            (args: { select: Record<string, unknown> }) =>
                Promise.resolve(
                    "payTokenHash" in args.select
                        ? { payTokenHash: "abc123" }
                        : row(),
                ),
        );
        const view = await service.get(owner, "inv_1");
        expect(view.online).toEqual({
            autopayCharge: null,
            providerConnected: true,
            payLinkActive: true,
            payments: [],
            // #835: its provider opens a checkout, so nothing stands in the way.
            onlineBlocker: null,
        });
        expect(JSON.stringify(view)).not.toContain("abc123");
    });

    it("marks a payment taken after the invoice was settled as owed back", async () => {
        db.paymentIntent.findMany?.mockResolvedValue([
            {
                id: "pi_1",
                provider: "RAZORPAY",
                amountCents: 120000,
                currency: "INR",
                updatedAt: new Date("2026-09-10T00:00:00Z"),
                attempts: [{ id: "att_1" }],
                refunds: [],
            },
            {
                id: "pi_2",
                provider: "RAZORPAY",
                amountCents: 120000,
                currency: "INR",
                updatedAt: new Date("2026-09-11T00:00:00Z"),
                attempts: [],
                refunds: [{ status: "SUCCEEDED" }],
            },
        ]);
        const view = await service.get(owner, "inv_1");
        expect(view.online?.payments).toEqual([
            {
                id: "pi_1",
                provider: "RAZORPAY",
                amount: "1200.00",
                currency: "INR",
                at: "2026-09-10T00:00:00.000Z",
                applied: false,
                refund: "NONE",
            },
            expect.objectContaining({
                id: "pi_2",
                applied: true,
                refund: "REFUNDED",
            }),
        ]);
        expect(db.paymentIntent.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    invoiceId: "inv_1",
                    status: "SUCCEEDED",
                },
            }),
        );
    });
});
