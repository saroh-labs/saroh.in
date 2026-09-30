/**
 * "Send a pay link" for a booking against a real Postgres (E4): the
 * booking's invoice is issued once, numbered, at the booked price; asking
 * again re-links it; cancelling retires the link; another business's booking
 * is a 404. Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { hashPayToken } from "../invoices/pay-token";
import { markBookingPaidInTx } from "./booking-pay-link";
import { BookingsService } from "./bookings.service";

const bookings = new BookingsService();
const NOW = new Date("2026-09-27T09:00:00.000Z");

let owner: OrganizationContext;
let other: OrganizationContext;
let serviceId: string;
let freeServiceId: string;
let contactId: string;

async function book(service = serviceId, startAt = "2026-09-29T05:30:00Z") {
    const start = new Date(startAt);
    return prisma.booking.create({
        data: {
            organizationId: owner.organizationId,
            serviceId: service,
            contactId,
            startAt: start,
            endAt: new Date(start.getTime() + 30 * 60_000),
            timezone: "Asia/Kolkata",
            status: "CONFIRMED",
            bookerName: "Priya Raman",
            bookerEmail: "priya@example.com",
            snapshot: {
                service: {
                    priceCents: service === serviceId ? 80_000 : 0,
                    currency: "INR",
                },
            },
        },
    });
}

beforeAll(async () => {
    const [org, rival] = await Promise.all([
        prisma.organization.create({
            data: { name: "Kavi Dental", slug: `e4-pay-${process.pid}` },
        }),
        prisma.organization.create({
            data: { name: "Another clinic", slug: `e4-pay-o-${process.pid}` },
        }),
    ]);
    await giveBusinessDetails(org.id);
    const user = await prisma.user.create({
        data: { email: `e4-pay-${process.pid}@example.in` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    other = { organizationId: rival.id, userId: "user_2", role: "OWNER" };
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
                // Raised since the booking was made at ₹800.
                priceCents: 90_000,
                currency: "INR",
                timezone: "Asia/Kolkata",
            },
        })
    ).id;
    freeServiceId = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Free consult",
                durationMinutes: 30,
                timezone: "Asia/Kolkata",
            },
        })
    ).id;
});

describe("a booking's pay link (E4, real database)", () => {
    it("issues one numbered invoice at the booked price, and re-links it when asked again", async () => {
        const booking = await book();
        const first = await bookings.payLink(owner, booking.id, NOW);
        const invoices = await prisma.invoice.findMany({
            where: { bookingId: booking.id },
        });
        expect(invoices).toHaveLength(1);
        expect(invoices[0]).toMatchObject({
            status: "ISSUED",
            source: "BOOKING",
            kind: "INVOICE",
            contactId,
            billToEmail: "priya@example.com",
            payTokenHash: hashPayToken(first.token),
        });
        expect(invoices[0]!.number).toBeTruthy();
        expect(invoices[0]!.total.toString()).toBe("800");
        expect(invoices[0]!.dueAt).toEqual(booking.startAt);

        const second = await bookings.payLink(owner, booking.id, NOW);
        const again = await prisma.invoice.findMany({
            where: { bookingId: booking.id },
        });
        expect(again).toHaveLength(1);
        expect(again[0]!.payTokenHash).toBe(hashPayToken(second.token));
        expect(second.token).not.toBe(first.token);
    });

    it("cancelling the booking retires its link and leaves the invoice issued", async () => {
        const booking = await book(serviceId, "2026-09-30T05:30:00Z");
        await bookings.payLink(owner, booking.id, NOW);
        await bookings.cancelBooking(owner, booking.id, NOW);
        const [invoice] = await prisma.invoice.findMany({
            where: { bookingId: booking.id },
        });
        expect(invoice).toMatchObject({ status: "ISSUED", payTokenHash: null });
        await expect(
            bookings.payLink(owner, booking.id, NOW),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("a paid link marks the booking paid online", async () => {
        const booking = await book(serviceId, "2026-10-01T05:30:00Z");
        await bookings.payLink(owner, booking.id, NOW);
        await prisma.$transaction((tx) => markBookingPaidInTx(tx, booking.id));
        await expect(
            prisma.booking.findUnique({ where: { id: booking.id } }),
        ).resolves.toMatchObject({ paidWith: "PAID" });
        await expect(bookings.payLink(owner, booking.id, NOW)).rejects.toThrow(
            "already paid",
        );
    });

    it("refuses an unpriced booking, and another business's", async () => {
        const free = await book(freeServiceId, "2026-10-02T05:30:00Z");
        await expect(bookings.payLink(owner, free.id, NOW)).rejects.toThrow(
            "no price",
        );
        const booking = await book(serviceId, "2026-10-03T05:30:00Z");
        await expect(
            bookings.payLink(other, booking.id, NOW),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            prisma.invoice.count({ where: { bookingId: booking.id } }),
        ).resolves.toBe(0);
    });

    it("says to connect a provider while Razorpay lacks its public key id (DEC-054)", async () => {
        const booking = await book(serviceId, "2026-10-04T05:30:00Z");
        await prisma.merchantPaymentProvider.updateMany({
            where: { organizationId: owner.organizationId },
            data: { publicKey: null },
        });
        try {
            await expect(
                bookings.payLink(owner, booking.id, NOW),
            ).rejects.toThrow("Connect a payment provider");
            await expect(
                prisma.invoice.count({ where: { bookingId: booking.id } }),
            ).resolves.toBe(0);
        } finally {
            await prisma.merchantPaymentProvider.updateMany({
                where: { organizationId: owner.organizationId },
                data: { publicKey: "rzp_test_Kavi1" },
            });
        }
    });
});
