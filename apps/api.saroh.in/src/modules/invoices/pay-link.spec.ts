// The workspace side of an invoice's pay link (ADR-007, U13): who may make
// one, when, that only the token's hash is kept, that asking again replaces
// it, and that voiding revokes it. The database is mocked.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        invoice: { findFirst: jest.fn(), updateMany: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            invoice: { findFirst: jest.fn(), updateMany: jest.fn() },
            merchantPaymentProvider: { count: jest.fn() },
            paymentIntent: { findMany: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});

import { ConflictException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
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

beforeEach(() => {
    jest.clearAllMocks();
    db.invoice.findFirst?.mockResolvedValue(row());
    db.invoice.updateMany?.mockResolvedValue({ count: 1 });
    db.merchantPaymentProvider.count?.mockResolvedValue(1);
    db.paymentIntent.findMany?.mockResolvedValue([]);
});

describe("making a pay link", () => {
    it("keeps only the token's hash and hands the token back once", async () => {
        const { token } = await service.createPayLink(owner, "inv_1");

        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits, base64url
        expect(db.invoice.updateMany).toHaveBeenCalledWith({
            where: { id: "inv_1", organizationId: "org_1", status: "ISSUED" },
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
        db.merchantPaymentProvider.count?.mockResolvedValue(0);
        await expect(
            service.createPayLink(owner, "inv_1"),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.merchantPaymentProvider.count).toHaveBeenCalledWith({
            where: { organizationId: "org_1", status: "CONNECTED" },
        });
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
});

describe("revoking a pay link", () => {
    it("clears the token when the invoice is voided", async () => {
        tx.invoice?.findFirst?.mockResolvedValue({ status: "ISSUED" });
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
            providerConnected: true,
            payLinkActive: true,
            payments: [],
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
