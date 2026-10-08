/**
 * "Take ₹X" at the desk against a real Postgres (round-2 P2): a
 * pay-at-the-desk booking gets its own invoice, numbered and PAID by cash,
 * UPI or card; after a deposit only the balance is taken, on a balance
 * invoice against the deposit's; a pay link already out is the invoice paid
 * instead; a double click takes it once; and the refusals — the roles, a
 * cancelled or paid booking, a payment going through, a changed amount.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { hashPayToken } from "../invoices/pay-token";
import { BookingsService } from "./bookings.service";
import { DESK_REFUSED } from "./desk-take";

const bookings = new BookingsService();
const NOW = new Date("2026-09-29T09:00:00.000Z");

let owner: OrganizationContext;
let other: OrganizationContext;
/** Books and checks in; issues no invoices. */
let desk: OrganizationContext;
/** Issues invoices; changes no bookings. */
let books: OrganizationContext;
let serviceId: string;
let contactId: string;
let day = 0;

/** A booking on a day of its own, made at ₹500 (or `snapshot`). */
async function book(
    over: {
        paidWith?: string | null;
        status?: string;
        snapshot?: object;
    } = {},
) {
    day += 1;
    const start = new Date(Date.UTC(2026, 9, day, 5, 30));
    return prisma.booking.create({
        data: {
            organizationId: owner.organizationId,
            serviceId,
            contactId,
            startAt: start,
            endAt: new Date(start.getTime() + 30 * 60_000),
            timezone: "Asia/Kolkata",
            status: over.status ?? "CONFIRMED",
            paidWith: over.paidWith === undefined ? "DESK" : over.paidWith,
            bookerName: "Priya Raman",
            bookerEmail: "priya@example.com",
            snapshot: over.snapshot ?? {
                service: { priceCents: 50_000, currency: "INR" },
            },
        },
    });
}

/**
 * A booking whose ₹400 deposit of ₹800 was paid online at booking; `paper`
 * is what its invoice froze at issue.
 */
async function depositPaid(
    paper: Prisma.InvoiceUncheckedCreateInput | object = {},
) {
    const booking = await book({
        paidWith: "PAID",
        snapshot: {
            service: { priceCents: 80_000, currency: "INR" },
            deposit: { cents: 40_000 },
        },
    });
    const invoice = await prisma.invoice.create({
        data: {
            organizationId: owner.organizationId,
            status: "PAID",
            number: `DEP-${booking.id.slice(-6)}`,
            kind: "INVOICE",
            source: "BOOKING",
            bookingId: booking.id,
            contactId,
            billToName: "Priya Raman",
            billToEmail: "priya@example.com",
            currency: "INR",
            subtotal: "400",
            total: "400",
            issuedAt: NOW,
            paidAt: NOW,
            paymentMethod: "ONLINE",
            ...paper,
            lines: {
                create: {
                    organizationId: owner.organizationId,
                    position: 0,
                    description: "Check-up",
                    quantity: 1,
                    unitPrice: "400",
                    amount: "400",
                },
            },
        },
    });
    await prisma.paymentIntent.create({
        data: {
            organizationId: owner.organizationId,
            invoiceId: invoice.id,
            provider: "RAZORPAY",
            providerIntentId: `order_${booking.id}`,
            amountCents: 40_000,
            currency: "INR",
            status: "SUCCEEDED",
        },
    });
    return { booking, invoice };
}

function take(
    ctx: OrganizationContext,
    bookingId: string,
    dto: {
        method: "CASH" | "UPI" | "CARD";
        amountCents: number;
        receivedCents?: number;
    },
) {
    return bookings.takeDeskPayment(ctx, bookingId, dto, NOW);
}

beforeAll(async () => {
    const [org, rival] = await Promise.all([
        prisma.organization.create({
            data: { name: "Kavi Dental", slug: `p2-desk-${process.pid}` },
        }),
        prisma.organization.create({
            data: { name: "Another clinic", slug: `p2-desk-o-${process.pid}` },
        }),
    ]);
    await giveBusinessDetails(org.id);
    const user = await prisma.user.create({
        data: { email: `p2-desk-${process.pid}@example.in` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    other = { organizationId: rival.id, userId: "user_2", role: "OWNER" };
    desk = {
        ...owner,
        role: "MEMBER",
        actions: new Set(["booking:read", "booking:write"]),
    };
    books = {
        ...owner,
        role: "MEMBER",
        actions: new Set(["booking:read", "invoice:read", "invoice:write"]),
    };
    await prisma.merchantPaymentProvider.create({
        data: {
            organizationId: org.id,
            provider: "RAZORPAY",
            publicKey: "rzp_test_Kavi1",
            encryptedCredentials: "x",
            credentialsIv: "x",
            credentialsAuthTag: "x",
        },
    });
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "priya@example.com",
                firstName: "Priya",
                lastName: "Raman",
            },
        })
    ).id;
    serviceId = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Check-up",
                durationMinutes: 30,
                // Raised since the bookings were made at ₹500.
                priceCents: 60_000,
                currency: "INR",
                timezone: "Asia/Kolkata",
            },
        })
    ).id;
});

describe("taking payment at the desk (P2, real database)", () => {
    it("cash: makes the booking's invoice, numbered and PAID, and says the change", async () => {
        const booking = await book();
        const before = await bookings.getBooking(owner, booking.id);
        expect(before.money).toMatchObject({
            dueCents: 50_000,
            paidAtDeskCents: 0,
            take: { cents: 50_000, byLink: true },
        });

        const paid = await take(owner, booking.id, {
            method: "CASH",
            amountCents: 50_000,
            receivedCents: 100_000,
        });
        expect(paid).toMatchObject({
            amountCents: 50_000,
            currency: "INR",
            method: "CASH",
            changeCents: 50_000,
            replayed: false,
        });
        expect(paid.number).toBeTruthy();

        const invoices = await prisma.invoice.findMany({
            where: { bookingId: booking.id },
        });
        expect(invoices).toHaveLength(1);
        expect(invoices[0]).toMatchObject({
            id: paid.invoiceId,
            kind: "INVOICE",
            source: "BOOKING",
            status: "PAID",
            paymentMethod: "CASH",
            contactId,
            billToEmail: "priya@example.com",
            createdByUserId: owner.userId,
            payTokenHash: null,
        });
        // At the price it was booked at, not the service's price now.
        expect(invoices[0]!.total.toString()).toBe("500");
        expect(invoices[0]!.paidAt).toEqual(NOW);

        const after = await bookings.getBooking(owner, booking.id);
        expect(after.money).toMatchObject({
            paidOnlineCents: 0,
            paidAtDeskCents: 50_000,
            deskMethod: "CASH",
            dueCents: 0,
            take: null,
            refundableCents: 0,
        });
        // The history says who took it.
        expect(after.events.map((e) => e.type)).toContain("PAID_AT_DESK");
        expect(
            after.events.find((e) => e.type === "PAID_AT_DESK")?.actorUserId,
        ).toBe(owner.userId);
    });

    it.each(["UPI", "CARD"] as const)(
        "%s: records how it was paid, with no change",
        async (method) => {
            const booking = await book();
            const paid = await take(owner, booking.id, {
                method,
                amountCents: 50_000,
            });
            expect(paid).toMatchObject({ method, changeCents: null });
            const invoice = await prisma.invoice.findUniqueOrThrow({
                where: { id: paid.invoiceId },
            });
            expect(invoice).toMatchObject({
                status: "PAID",
                paymentMethod: method,
            });
            const detail = await bookings.getBooking(owner, booking.id);
            expect(detail.money.deskMethod).toBe(method);
        },
    );

    it("a booking nobody said how it's paid reads as paid at the desk after", async () => {
        const booking = await book({ paidWith: null });
        await take(owner, booking.id, { method: "UPI", amountCents: 50_000 });
        await expect(
            prisma.booking.findUnique({ where: { id: booking.id } }),
        ).resolves.toMatchObject({ paidWith: "DESK" });
    });

    it("after a deposit, takes only the balance on a balance invoice against the deposit's", async () => {
        const { booking, invoice: deposit } = await depositPaid();
        const before = await bookings.getBooking(owner, booking.id);
        expect(before.money).toMatchObject({
            paidOnlineCents: 40_000,
            dueCents: 40_000,
            take: { cents: 40_000, byLink: false },
        });

        const paid = await take(owner, booking.id, {
            method: "CARD",
            amountCents: 40_000,
        });
        const balance = await prisma.invoice.findUniqueOrThrow({
            where: { id: paid.invoiceId },
            include: { lines: true },
        });
        expect(balance).toMatchObject({
            kind: "SUPPLEMENTARY",
            source: "BOOKING",
            bookingId: booking.id,
            relatedInvoiceId: deposit.id,
            status: "PAID",
            paymentMethod: "CARD",
        });
        expect(balance.total.toString()).toBe("400");
        expect(balance.number).toBeTruthy();
        expect(balance.number).not.toBe(deposit.number);
        expect(balance.lines[0]?.description).toBe("Balance for Check-up");
        // The deposit's invoice is never touched (DEC-023).
        await expect(
            prisma.invoice.findUnique({ where: { id: deposit.id } }),
        ).resolves.toMatchObject({ status: "PAID", paymentMethod: "ONLINE" });
        await expect(
            prisma.booking.findUnique({ where: { id: booking.id } }),
        ).resolves.toMatchObject({ paidWith: "PAID" });

        const after = await bookings.getBooking(owner, booking.id);
        expect(after.money).toMatchObject({
            paidOnlineCents: 40_000,
            paidAtDeskCents: 40_000,
            deskMethod: "CARD",
            dueCents: 0,
            take: null,
            // Only what was paid online is refunded by a cancel.
            refundableCents: 40_000,
        });
    });

    it("the balance prints the deposit's frozen seller and tax standing, not today's settings (ADR-008, DEC-082)", async () => {
        // Issued as a tax invoice by the business as it was then; it has
        // since moved, deregistered and been renamed.
        const frozen = {
            sellerGstin: "29AAGCR4375J1ZU",
            sellerState: "29",
            sellerAddress: "1 Old Road, Bengaluru 560001, Karnataka",
            sellerName: "Kavi Dental (Old Town)",
            sellerLegalName: "Kavi Dental LLP",
            sellerEmail: "old@kavi.in",
            placeOfSupply: "29",
            taxType: "INTRA",
        };
        const { booking, invoice: deposit } = await depositPaid(frozen);
        const paid = await take(owner, booking.id, {
            method: "UPI",
            amountCents: 40_000,
        });
        const balance = await prisma.invoice.findUniqueOrThrow({
            where: { id: paid.invoiceId },
        });
        expect(balance).toMatchObject({
            kind: "SUPPLEMENTARY",
            relatedInvoiceId: deposit.id,
            ...frozen,
        });
        expect(balance.igst.toString()).toBe("0");
    });

    it("a pay link already out: its invoice is paid at the desk instead, and the link stops", async () => {
        const booking = await book({ paidWith: null });
        const { token } = await bookings.payLink(owner, booking.id, NOW);
        const [issued] = await prisma.invoice.findMany({
            where: { bookingId: booking.id },
        });
        expect(issued?.payTokenHash).toBe(hashPayToken(token));

        const paid = await take(owner, booking.id, {
            method: "CASH",
            amountCents: 50_000,
        });
        expect(paid.invoiceId).toBe(issued?.id);
        const invoices = await prisma.invoice.findMany({
            where: { bookingId: booking.id },
        });
        expect(invoices).toHaveLength(1);
        expect(invoices[0]).toMatchObject({
            status: "PAID",
            paymentMethod: "CASH",
            payTokenHash: null,
            number: issued?.number,
        });
        await expect(bookings.payLink(owner, booking.id, NOW)).rejects.toThrow(
            "already paid",
        );
    });

    it("a double click takes it once, and answers the second the same", async () => {
        const booking = await book();
        const dto = { method: "CASH" as const, amountCents: 50_000 };
        const [a, b] = await Promise.all([
            take(owner, booking.id, dto),
            take(owner, booking.id, dto),
        ]);
        expect(a.invoiceId).toBe(b.invoiceId);
        expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
        await expect(
            prisma.invoice.count({ where: { bookingId: booking.id } }),
        ).resolves.toBe(1);
        await expect(
            prisma.bookingEvent.count({
                where: { bookingId: booking.id, type: "PAID_AT_DESK" },
            }),
        ).resolves.toBe(1);

        // A different take on a paid booking is refused, not replayed.
        await expect(
            take(owner, booking.id, { method: "UPI", amountCents: 50_000 }),
        ).rejects.toThrow(DESK_REFUSED.paid);
    });

    it("refuses an amount that changed since the button showed it", async () => {
        const booking = await book();
        const refused = take(owner, booking.id, {
            method: "CASH",
            amountCents: 60_000,
        });
        await expect(refused).rejects.toBeInstanceOf(ConflictException);
        await expect(refused).rejects.toThrow("amount to take has changed");
        await expect(
            prisma.invoice.count({ where: { bookingId: booking.id } }),
        ).resolves.toBe(0);
    });

    it("refuses cash given short of the amount, and cash given for a card", async () => {
        const booking = await book();
        await expect(
            take(owner, booking.id, {
                method: "CASH",
                amountCents: 50_000,
                receivedCents: 20_000,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            take(owner, booking.id, {
                method: "CARD",
                amountCents: 50_000,
                receivedCents: 50_000,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a cancelled booking, one paid with a pack, and one already paid", async () => {
        const cancelled = await book({ status: "CANCELLED" });
        await expect(
            take(owner, cancelled.id, { method: "CASH", amountCents: 50_000 }),
        ).rejects.toThrow(DESK_REFUSED.cancelled);
        const pack = await book({ paidWith: "PACK" });
        await expect(
            take(owner, pack.id, { method: "CASH", amountCents: 50_000 }),
        ).rejects.toThrow(DESK_REFUSED.paid);
        const byHand = await book({ paidWith: "PAID" });
        await expect(
            take(owner, byHand.id, { method: "CASH", amountCents: 50_000 }),
        ).rejects.toThrow(DESK_REFUSED.paid);
        await expect(
            prisma.invoice.count({
                where: {
                    bookingId: { in: [cancelled.id, pack.id, byHand.id] },
                },
            }),
        ).resolves.toBe(0);
    });

    it("refuses while a payment for it is going through online", async () => {
        const booking = await book({ paidWith: null });
        await bookings.payLink(owner, booking.id, NOW);
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { bookingId: booking.id },
        });
        await prisma.paymentIntent.create({
            data: {
                organizationId: owner.organizationId,
                invoiceId: invoice.id,
                provider: "RAZORPAY",
                amountCents: 50_000,
                currency: "INR",
                status: "PROCESSING",
            },
        });
        await expect(
            take(owner, booking.id, { method: "CASH", amountCents: 50_000 }),
        ).rejects.toThrow(DESK_REFUSED.charging);
        const detail = await bookings.getBooking(owner, booking.id);
        expect(detail.money.take).toBeNull();
        await expect(
            prisma.invoice.findUnique({ where: { id: invoice.id } }),
        ).resolves.toMatchObject({ status: "ISSUED" });
    });

    it("needs both booking:write and invoice:write, and never reaches another business", async () => {
        const booking = await book();
        const dto = { method: "CASH" as const, amountCents: 50_000 };
        await expect(take(desk, booking.id, dto)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(take(desk, booking.id, dto)).rejects.toThrow(
            "can't issue invoices",
        );
        await expect(take(books, booking.id, dto)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(take(other, booking.id, dto)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            prisma.invoice.count({ where: { bookingId: booking.id } }),
        ).resolves.toBe(0);
    });

    it("the calendar says it was paid at the desk, and what is left to take", async () => {
        const paidOne = await book();
        await take(owner, paidOne.id, { method: "UPI", amountCents: 50_000 });
        const due = await book();
        const range = {
            from: new Date(paidOne.startAt.getTime() - 3_600_000).toISOString(),
            to: new Date(due.endAt.getTime() + 3_600_000).toISOString(),
        };
        const calendar = await bookings.calendarBookings(owner, range);
        const all = calendar.diaries.flatMap((d) => d.bookings);
        expect(all.find((b) => b.id === paidOne.id)).toMatchObject({
            paidAtDesk: { method: "UPI" },
            take: null,
        });
        expect(all.find((b) => b.id === due.id)).toMatchObject({
            paidAtDesk: null,
            take: { cents: 50_000, byLink: true },
        });
        // Someone who reads no money is told how, never how much.
        const member: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            actions: new Set(["booking:read"]),
        };
        const theirs = await bookings.calendarBookings(member, range);
        const row = theirs.diaries
            .flatMap((d) => d.bookings)
            .find((b) => b.id === paidOne.id);
        expect(row?.paidAtDesk).toEqual({ method: "UPI" });
        expect(row).not.toHaveProperty("take");
        expect(row?.toTake).toBe(false);
        // …and whether there is something to take, so the app can show
        // Take payment disabled with why (DEC-098, FB-1).
        const dueRow = theirs.diaries
            .flatMap((d) => d.bookings)
            .find((b) => b.id === due.id);
        expect(dueRow).not.toHaveProperty("take");
        expect(dueRow?.toTake).toBe(true);
        expect(dueRow?.service).not.toHaveProperty("priceCents");
    });

    it("a role the business made with both permissions takes payment and sees what it takes, whatever its name (DEC-098)", async () => {
        const booking = await book();
        const frontDesk: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: new Set([
                "booking:read",
                "booking:write",
                "invoice:read",
                "invoice:write",
            ]),
        };
        const range = {
            from: new Date(booking.startAt.getTime() - 3_600_000).toISOString(),
            to: new Date(booking.endAt.getTime() + 3_600_000).toISOString(),
        };
        const calendar = await bookings.calendarBookings(frontDesk, range);
        expect(calendar.money).toBe(true);
        const row = calendar.diaries
            .flatMap((d) => d.bookings)
            .find((b) => b.id === booking.id);
        expect(row).toMatchObject({
            take: { cents: 50_000 },
            service: { currency: "INR" },
        });
        const paid = await take(frontDesk, booking.id, {
            method: "CASH",
            amountCents: 50_000,
        });
        expect(paid.amountCents).toBe(50_000);
    });
});
