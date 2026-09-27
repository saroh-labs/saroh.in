// DB-free: "Send a pay link" for a booking (E4). The database is mocked and
// the transaction runs its callback on the same client; the numbering and
// the tax profile are stubbed, and the document maths is the real one.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        booking: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            updateMany: jest.fn(),
        },
        invoice: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        merchantPaymentProvider: { count: jest.fn() },
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
jest.mock("../invoices/order-invoicing", () => {
    const actual = jest.requireActual("../invoices/order-invoicing");
    return {
        ...actual,
        loadTaxProfile: jest.fn().mockResolvedValue({
            registered: false,
            gstin: null,
            state: null,
            address: null,
        }),
        numberFor: jest.fn().mockResolvedValue("INV-0007"),
        writeDocumentLines: jest.fn(),
    };
});

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { hashPayToken } from "../invoices/pay-token";
import { markBookingPaidInTx, retirePayLinkInTx } from "./booking-pay-link";
import { BookingsService } from "./bookings.service";

const bookingFindUnique = prisma.booking.findUnique as jest.Mock;
const bookingFindFirst = prisma.booking.findFirst as jest.Mock;
const bookingUpdateMany = prisma.booking.updateMany as jest.Mock;
const invoiceFindFirst = prisma.invoice.findFirst as jest.Mock;
const invoiceCreate = prisma.invoice.create as jest.Mock;
const invoiceUpdate = prisma.invoice.update as jest.Mock;
const invoiceUpdateMany = prisma.invoice.updateMany as jest.Mock;
const providers = prisma.merchantPaymentProvider.count as jest.Mock;
const queryRaw = prisma.$queryRaw as jest.Mock;

const NOW = new Date("2026-09-27T09:00:00.000Z");
const START = new Date("2026-09-29T05:30:00.000Z");

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

const BOOKING = {
    id: "bk_1",
    organizationId: "org_1",
    status: "CONFIRMED",
    paidWith: null,
    startAt: START,
    timezone: "Asia/Kolkata",
    contactId: "c_1",
    bookerName: "Priya Raman",
    bookerEmail: "priya@example.com",
    snapshot: { service: { priceCents: 80_000, currency: "INR" } },
    service: {
        name: "Check-up",
        priceCents: 90_000,
        currency: "INR",
        gstRate: null,
        sacCode: null,
    },
};

function wire(booking: Partial<typeof BOOKING> = {}) {
    bookingFindUnique.mockResolvedValue({
        id: "bk_1",
        organizationId: "org_1",
    });
    bookingFindFirst.mockResolvedValue({ ...BOOKING, ...booking });
    providers.mockResolvedValue(1);
    invoiceFindFirst.mockResolvedValue(null);
    invoiceCreate.mockResolvedValue({ id: "inv_1" });
    queryRaw.mockResolvedValue([]);
}

describe("BookingsService.payLink (E4)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("issues the booking's invoice at the price it was booked at, with a pay token", async () => {
        wire();
        const { token } = await new BookingsService().payLink(
            ctx(),
            "bk_1",
            NOW,
        );
        const data = invoiceCreate.mock.calls[0][0].data;
        expect(data).toMatchObject({
            organizationId: "org_1",
            status: "ISSUED",
            number: "INV-0007",
            kind: "INVOICE",
            source: "BOOKING",
            bookingId: "bk_1",
            contactId: "c_1",
            billToName: "Priya Raman",
            billToEmail: "priya@example.com",
            currency: "INR",
            issuedAt: NOW,
            // Due by the session.
            dueAt: START,
            createdByUserId: "user_1",
        });
        // ₹800 as booked, not the ₹900 the service costs now.
        expect(data.total.toString()).toBe("800.00");
        expect(data.payTokenHash).toBe(hashPayToken(token));
    });

    it("takes the invoice's lock before the booking's (the webhook's order)", async () => {
        wire();
        await new BookingsService().payLink(ctx(), "bk_1", NOW);
        const locks = queryRaw.mock.calls.map((c) =>
            (c[0] as TemplateStringsArray).join("?"),
        );
        expect(locks[0]).toContain(`FROM "Invoice"`);
        expect(locks[1]).toContain(`FROM "Booking"`);
    });

    it("asking again makes a new link on the same invoice, and no second invoice", async () => {
        wire();
        invoiceFindFirst.mockResolvedValue({ id: "inv_1", status: "ISSUED" });
        const { token } = await new BookingsService().payLink(
            ctx(),
            "bk_1",
            NOW,
        );
        expect(invoiceCreate).not.toHaveBeenCalled();
        expect(invoiceUpdate).toHaveBeenCalledWith({
            where: { id: "inv_1" },
            data: { payTokenHash: hashPayToken(token) },
        });
    });

    it.each([
        ["cancelled", { status: "CANCELLED" }],
        ["a pay-now hold", { status: "PENDING" }],
        ["paid", { paidWith: "PAID" }],
        ["paid with a pack", { paidWith: "PACK" }],
        [
            "unpriced",
            {
                snapshot: { service: { priceCents: 0, currency: "INR" } },
            },
        ],
    ])("refuses a booking that is %s with a 409", async (_, over) => {
        wire(over as Partial<typeof BOOKING>);
        await expect(
            new BookingsService().payLink(ctx(), "bk_1", NOW),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(invoiceCreate).not.toHaveBeenCalled();
    });

    it("refuses an invoice already paid for it", async () => {
        wire();
        invoiceFindFirst.mockResolvedValue({ id: "inv_1", status: "PAID" });
        await expect(
            new BookingsService().payLink(ctx(), "bk_1", NOW),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("says to connect a provider when none is, before writing anything", async () => {
        wire();
        providers.mockResolvedValue(0);
        await expect(
            new BookingsService().payLink(ctx(), "bk_1", NOW),
        ).rejects.toThrow("Connect a payment provider");
        expect(invoiceCreate).not.toHaveBeenCalled();
    });

    it("404s another business's booking", async () => {
        wire();
        bookingFindUnique.mockResolvedValue({
            id: "bk_1",
            organizationId: "org_OTHER",
        });
        await expect(
            new BookingsService().payLink(ctx(), "bk_1", NOW),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(invoiceCreate).not.toHaveBeenCalled();
    });

    it("needs invoice:write as well as booking:write", async () => {
        wire();
        // A custom front desk that books but doesn't bill.
        await expect(
            new BookingsService().payLink(
                ctx({
                    role: "MEMBER",
                    roleKey: "front_desk",
                    actions: new Set(["booking:read", "booking:write"]),
                }),
                "bk_1",
                NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            new BookingsService().payLink(ctx({ role: "MEMBER" }), "bk_1", NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(bookingFindUnique).not.toHaveBeenCalled();
    });
});

describe("after the link (E4)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("a paid link marks a confirmed, unpaid booking paid online", async () => {
        bookingUpdateMany.mockResolvedValue({ count: 1 });
        await expect(markBookingPaidInTx(prisma, "bk_1")).resolves.toBe(true);
        expect(bookingUpdateMany).toHaveBeenCalledWith({
            where: {
                id: "bk_1",
                status: "CONFIRMED",
                OR: [
                    { paidWith: null },
                    { paidWith: { notIn: ["PAID", "PACK", "MEMBERSHIP"] } },
                ],
            },
            data: { paidWith: "PAID" },
        });
    });

    it("cancelling retires the link of an issued invoice, and leaves the invoice", async () => {
        await retirePayLinkInTx(prisma, "bk_1");
        expect(invoiceUpdateMany).toHaveBeenCalledWith({
            where: {
                bookingId: "bk_1",
                kind: "INVOICE",
                source: "BOOKING",
                status: "ISSUED",
                payTokenHash: { not: null },
            },
            data: { payTokenHash: null },
        });
    });
});
