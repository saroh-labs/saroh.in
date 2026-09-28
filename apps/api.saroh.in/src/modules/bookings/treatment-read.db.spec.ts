/**
 * A treatment's visits as the Bookings screens read them, against a real
 * Postgres (round 2, E10; DEC-050): the booking detail and the calendar say
 * "Visit 2 of 3" with the order it belongs to and the next visit to book;
 * the booking page serves how many visits a service is; and the Service
 * Editor's rule refuses a treatment in a business with no storefront.
 *
 * Only the app env is stubbed. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "./bookings.service";
import { publicBookingPage } from "./public-booking-page";
import { TREATMENT_NEEDS_STOREFRONT } from "./visits";

const tag = `${process.pid}-${Date.now()}`;
const bookings = new BookingsService();

let owner: OrganizationContext;
let orgId: string;
let whitening: string;
let checkUp: string;
let dayOut = 3;

/** A start `dayOut` days from now at 10:00 UTC; each call a new day. */
function nextStart(): string {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d.toISOString();
}

const EVERY_DAY = (organizationId: string) => ({
    create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        organizationId,
        dayOfWeek,
        startMinute: 9 * 60,
        endMinute: 18 * 60,
    })),
});

async function service(name: string, visits: number): Promise<string> {
    return (
        await prisma.service.create({
            data: {
                organizationId: orgId,
                name,
                durationMinutes: 60,
                capacity: 1,
                priceCents: 900_000,
                currency: "INR",
                gstRate: "0",
                timezone: "UTC",
                visits,
                availabilityRules: EVERY_DAY(orgId),
            },
        })
    ).id;
}

async function org(name: string, slug: string) {
    const organization = await prisma.organization.create({
        data: { name, slug: `${slug}-${tag}` },
    });
    const user = await prisma.user.create({
        data: { email: `${slug}-${tag}@example.in` },
    });
    await prisma.membership.create({
        data: {
            organizationId: organization.id,
            userId: user.id,
            role: "OWNER",
        },
    });
    await prisma.businessProfile.create({
        data: { organizationId: organization.id, timezone: "UTC" },
    });
    return {
        organizationId: organization.id,
        userId: user.id,
        role: "OWNER",
    } as OrganizationContext;
}

beforeAll(async () => {
    owner = await org("Kavi Dental", "e10-visits");
    orgId = owner.organizationId;
    await prisma.store.create({
        data: {
            name: "Indiranagar clinic",
            slug: `e10-store-${tag}`,
            organizationId: orgId,
        },
    });
    whitening = await service("Teeth whitening", 3);
    checkUp = await service("Check-up", 1);
});

/** Sell the treatment at the desk: its order, and visit 1. */
async function treatmentBooked(email: string) {
    return bookings.bookByHand(owner, whitening, {
        startAt: nextStart(),
        bookerEmail: email,
        bookerName: "Ananya Rao",
        paidWith: "DESK",
    });
}

describe("a treatment's visits on the Bookings screens (E10, real database)", () => {
    it("visit 1's detail says Visit 1 of 3 with its order, and offers visit 2", async () => {
        const visit1 = await treatmentBooked(`ananya-${tag}@example.in`);
        const detail = await bookings.getBooking(owner, visit1.id);
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: visit1.orderId ?? "" },
            select: { id: true, orderId: true },
        });
        expect(detail.treatment).toEqual({
            orderId: order.id,
            orderNumber: order.orderId,
            visitNumber: 1,
            visits: 3,
            booked: 1,
            nextVisit: 2,
            closed: false,
        });
        // The view, never the order row.
        expect(detail).not.toHaveProperty("order");
    });

    it("Book visit 2 books against the same order; visit 2's detail offers visit 3", async () => {
        const visit1 = await treatmentBooked(`kiran-${tag}@example.in`);
        const orderId = visit1.orderId ?? "";
        const visit2 = await bookings.bookVisit(owner, orderId, {
            visitNumber: 2,
            startAt: nextStart(),
        });
        expect(visit2.orderId).toBe(orderId);
        const detail = await bookings.getBooking(owner, visit2.id);
        expect(detail.treatment).toMatchObject({
            visitNumber: 2,
            booked: 2,
            nextVisit: 3,
        });
        // Visit 1 reads the same order, now with two booked.
        const first = await bookings.getBooking(owner, visit1.id);
        expect(first.treatment).toMatchObject({ booked: 2, nextVisit: 3 });
    });

    it("all visits booked: nothing more is offered", async () => {
        const visit1 = await treatmentBooked(`meera-${tag}@example.in`);
        const orderId = visit1.orderId ?? "";
        await bookings.bookVisit(owner, orderId, {
            visitNumber: 2,
            startAt: nextStart(),
        });
        const visit3 = await bookings.bookVisit(owner, orderId, {
            visitNumber: 3,
            startAt: nextStart(),
        });
        const detail = await bookings.getBooking(owner, visit3.id);
        expect(detail.treatment).toMatchObject({
            visitNumber: 3,
            booked: 3,
            nextVisit: null,
        });
    });

    it("the calendar's peek reads the same: which visit, the order and the next one", async () => {
        const visit1 = await treatmentBooked(`rohan-${tag}@example.in`);
        const plain = await bookings.bookByHand(owner, checkUp, {
            startAt: nextStart(),
            bookerEmail: `plain-${tag}@example.in`,
        });
        const from = new Date(Date.now() - 86_400_000).toISOString();
        const to = new Date(Date.now() + 90 * 86_400_000).toISOString();
        const calendar = await bookings.calendarBookings(owner, { from, to });
        const all = calendar.diaries.flatMap((d) => d.bookings);
        const peek = all.find((b) => b.id === visit1.id);
        expect(peek?.treatment).toMatchObject({
            orderId: visit1.orderId,
            visitNumber: 1,
            visits: 3,
            nextVisit: 2,
        });
        expect(peek?.treatment?.orderNumber).toMatch(/^ORD-/);
        expect(all.find((b) => b.id === plain.id)?.treatment).toBeNull();
    });

    it("the booking page serves how many visits a service is", async () => {
        const site = await prisma.site.create({
            data: {
                organizationId: orgId,
                name: "Kavi Dental",
                slug: `e10-${tag}`,
            },
        });
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: orgId,
                snapshot: {},
                templateId: "blank",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });
        const page = await publicBookingPage(site.id);
        const byId = new Map(page.services.map((s) => [s.id, s]));
        expect(byId.get(whitening)?.visits).toBe(3);
        expect(byId.get(checkUp)?.visits).toBe(1);
    });
});

describe("the Service Editor's storefront rule (E10, real database)", () => {
    it("saving 3 visits in a business with no storefront is refused, and nothing is saved", async () => {
        const noShop = await org("Solo Physio", "e10-no-shop");
        const err = await bookings
            .createService(noShop, {
                name: "Rehab course",
                durationMinutes: 45,
                timezone: "UTC",
                priceCents: 600_000,
                currency: "INR",
                visits: 3,
            })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).message).toBe(
            TREATMENT_NEEDS_STOREFRONT,
        );
        expect(
            await prisma.service.count({
                where: { organizationId: noShop.organizationId },
            }),
        ).toBe(0);

        const one = await bookings.createService(noShop, {
            name: "Assessment",
            durationMinutes: 45,
            timezone: "UTC",
        });
        await expect(
            bookings.updateService(noShop, one.id, { visits: 3 }),
        ).rejects.toBeInstanceOf(ConflictException);
        const after = await prisma.service.findUniqueOrThrow({
            where: { id: one.id },
        });
        expect(after.visits).toBe(1);
    });

    it("a business with a storefront saves 3 visits", async () => {
        const saved = await bookings.createService(owner, {
            name: "Braces fitting",
            durationMinutes: 30,
            timezone: "UTC",
            priceCents: 1_500_000,
            currency: "INR",
            visits: 3,
        });
        expect(saved.visits).toBe(3);
    });
});
