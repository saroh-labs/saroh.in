/**
 * The round-2 service fields against a real Postgres (E1): visits, the
 * deposit, Either and "Show on booking page". Existing services read as
 * today; a hidden service leaves the booking page and the services list but
 * stays in the workspace; the public reads carry neither visits nor the
 * deposit yet (E8 and E10 add them). Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "./bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";

const bookings = new BookingsService();
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);

let owner: OrganizationContext;
let other: OrganizationContext;
let siteId: string;
let existing: string;

/**
 * Monday mornings, so the service has times to offer: one with none is
 * left off the public reads (UX-024), and this spec is about the fields.
 */
async function withHours(serviceId: string) {
    await prisma.availabilityRule.create({
        data: {
            organizationId: owner.organizationId,
            serviceId,
            dayOfWeek: 1,
            startMinute: 9 * 60,
            endMinute: 13 * 60,
        },
    });
}

beforeAll(async () => {
    const [org, rival] = await Promise.all([
        prisma.organization.create({
            data: { name: "Kavi Dental", slug: `e1-kavi-${process.pid}` },
        }),
        prisma.organization.create({
            data: { name: "Another clinic", slug: `e1-other-${process.pid}` },
        }),
    ]);
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    other = { organizationId: rival.id, userId: "user_2", role: "OWNER" };
    siteId = (
        await prisma.site.create({
            data: {
                organizationId: org.id,
                name: "Kavi Dental",
                slug: `e1-kavi-${process.pid}`,
            },
        })
    ).id;
    const publication = await prisma.publication.create({
        data: {
            siteId,
            organizationId: org.id,
            snapshot: {},
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: siteId },
        data: { currentPublicationId: publication.id },
    });
    // A storefront to sell treatments from (E10, DEC-050).
    await prisma.store.create({
        data: {
            name: "Kavi Dental",
            slug: `e1-kavi-store-${process.pid}`,
            organizationId: org.id,
        },
    });
    // Made the way every service was before E1: no new field named.
    existing = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Check-up",
                durationMinutes: 30,
                priceCents: 80_000,
                currency: "INR",
                timezone: "Asia/Kolkata",
            },
        })
    ).id;
    await withHours(existing);
});

describe("service fields (E1, real database)", () => {
    it("reads an existing service as one visit, no deposit, shown", async () => {
        await expect(
            bookings.getService(owner, existing),
        ).resolves.toMatchObject({
            visits: 1,
            depositMode: "NONE",
            depositCents: null,
            showOnBookingPage: true,
            locationType: "IN_PERSON",
        });
        const page = await publicBookings.publicBookingPage(siteId);
        expect(page.services.map((s) => s.name)).toContain("Check-up");
    });

    it("round-trips 3 visits and a 50% deposit on the staff read; the booking page serves the visits, and no deposit it can't take online", async () => {
        const made = await bookings.createService(owner, {
            name: "Root canal",
            durationMinutes: 60,
            priceCents: 1_200_050,
            currency: "INR",
            timezone: "Asia/Kolkata",
            visits: 3,
            depositMode: "PERCENT_50",
            locationType: "EITHER",
            meetingUrl: "https://meet.example.com/kavi",
        });
        await withHours(made.id);
        expect(made).toMatchObject({
            visits: 3,
            depositMode: "PERCENT_50",
            depositCents: 600_025,
            locationType: "EITHER",
        });
        const [listed] = (await bookings.listServices(owner)).filter(
            (s) => s.id === made.id,
        );
        expect(listed).toMatchObject({ visits: 3, depositCents: 600_025 });

        const page = await publicBookings.publicBookingPage(siteId);
        const shown = page.services.find((s) => s.id === made.id);
        // Either isn't online-only; the page asks Where for it (E7). The
        // booking page never serves the mode, only the visits (E10) and the
        // deposit the server worked out (E8) — and only when the business can
        // take it online. This business has no provider, so the page offers
        // "pay at the desk" and no deposit (R28); the staff read keeps it.
        expect(shown).toMatchObject({
            online: false,
            where: "EITHER",
            depositCents: null,
            visits: 3,
        });
        expect(JSON.stringify(shown)).not.toMatch(
            /depositMode|showOnBookingPage/i,
        );
        const [listItem] = await publicBookings.publicServices([made.id]);
        expect(listItem).toBeDefined();
        expect(JSON.stringify(listItem)).not.toMatch(
            /visits|deposit|showOnBookingPage/i,
        );
    });

    it("leaves a hidden service off the booking page and the services list, and keeps it for staff", async () => {
        const hidden = await bookings.createService(owner, {
            name: "Staff-only follow-up",
            durationMinutes: 15,
            timezone: "Asia/Kolkata",
            showOnBookingPage: false,
        });
        await withHours(hidden.id);
        const page = await publicBookings.publicBookingPage(siteId);
        expect(page.services.map((s) => s.id)).not.toContain(hidden.id);
        await expect(
            publicBookings.publicServices([hidden.id, existing]),
        ).resolves.toEqual([expect.objectContaining({ id: existing })]);
        await expect(publicBookings.publicDays(hidden.id)).rejects.toThrow(
            "This service isn't booked online",
        );
        expect((await bookings.listServices(owner)).map((s) => s.id)).toContain(
            hidden.id,
        );

        // Shown again, it is back on the page.
        await bookings.updateService(owner, hidden.id, {
            showOnBookingPage: true,
        });
        const again = await publicBookings.publicBookingPage(siteId);
        expect(again.services.map((s) => s.id)).toContain(hidden.id);
    });

    it("404s another business's service and changes nothing", async () => {
        await expect(
            bookings.updateService(other, existing, {
                visits: 3,
                showOnBookingPage: false,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            prisma.service.findUniqueOrThrow({ where: { id: existing } }),
        ).resolves.toMatchObject({ visits: 1, showOnBookingPage: true });
    });

    it("adds a booking's own place, empty on every booking made before it", async () => {
        const booking = await prisma.booking.create({
            data: {
                organizationId: owner.organizationId,
                serviceId: existing,
                startAt: new Date("2026-11-02T04:30:00Z"),
                endAt: new Date("2026-11-02T05:00:00Z"),
                timezone: "Asia/Kolkata",
                snapshot: {},
            },
        });
        expect(booking.locationType).toBeNull();
    });
});
