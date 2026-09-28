/**
 * Half-hour starts against a real Postgres (DEC-052, E6): a one-to-one of 30
 * minutes or more is offered every half hour, and — now that the step no
 * longer carries the buffers — the booking's own serializable check keeps
 * them clear, for a service nobody takes and for a person's diary alike.
 * Runs in the integration project (TEST_DATABASE_URL).
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
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";

const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const bookings = new BookingsService();

let owner: OrganizationContext;
/** 60 minutes, 15 after, nobody takes it: Mondays 09:00–13:00 UTC. */
let room: string;
/** 60 minutes, 15 after, with Asha: she works Mondays 09:00–13:00 UTC. */
let withAsha: string;
let keySeq = 0;

const MONDAY = 1;

/** The Monday `weeksOut` weeks ahead, at `hour`:`minute` UTC. */
function monday(hour: number, minute = 0, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour, minute);
    return d;
}

function booker(email: string, startAt: Date) {
    keySeq += 1;
    return {
        startAt: startAt.toISOString(),
        bookerName: "Ravi Kumar",
        bookerEmail: email,
        idempotencyKey: `half_${keySeq}`,
        pay: "DESK" as const,
    };
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `half-hour-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `half-hour-${process.pid}@example.in` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Kavi Dental",
            slug: `kavi-${process.pid}`,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: {},
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });

    const mondays = {
        create: {
            organizationId: org.id,
            dayOfWeek: MONDAY,
            startMinute: 9 * 60,
            endMinute: 13 * 60,
        },
    };
    room = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Root canal visit",
                durationMinutes: 60,
                bufferAfterMinutes: 15,
                capacity: 1,
                priceCents: 300_000,
                currency: "INR",
                timezone: "UTC",
                availabilityRules: mondays,
            },
        })
    ).id;
    withAsha = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Check-up with Asha",
                durationMinutes: 60,
                bufferAfterMinutes: 15,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                timezone: "UTC",
            },
        })
    ).id;
    await prisma.staffMember.create({
        data: {
            organizationId: org.id,
            name: "Asha Iyer",
            services: {
                create: { organizationId: org.id, serviceId: withAsha },
            },
            hours: {
                create: {
                    organizationId: org.id,
                    dayOfWeek: MONDAY,
                    startMinute: 9 * 60,
                    endMinute: 13 * 60,
                },
            },
        },
    });
});

const hhmm = (starts: { startAt: string }[]) =>
    starts.map((s) => s.startAt.slice(11, 16));

async function startsOn(serviceId: string, day: Date): Promise<string[]> {
    const days = await publicBookings.publicDays(serviceId, monday(0));
    const date = day.toISOString().slice(0, 10);
    return hhmm(days.days.find((d) => d.date === date)?.starts ?? []);
}

describe("half-hour starts (DEC-052, real database)", () => {
    it("offers a 60-minute one-to-one every half hour", async () => {
        expect(await startsOn(room, monday(9))).toEqual([
            "09:00",
            "09:30",
            "10:00",
            "10:30",
            "11:00",
            "11:30",
            "12:00",
        ]);
    });

    it("keeps the 15 minutes after a 09:00 booking clear: 10:30 next, and 10:00 refused at booking", async () => {
        await publicBookings.bookOnline(
            room,
            booker("first@example.in", monday(9)),
            "ip_1",
        );
        const left = await startsOn(room, monday(9));
        expect(left[0]).toBe("10:30");
        expect(left).not.toContain("10:00");

        // Straight at the API: the serializable re-count counts the buffer.
        await expect(
            publicBookings.bookOnline(
                room,
                booker("second@example.in", monday(10)),
                "ip_1",
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        const { booking } = await publicBookings.bookOnline(
            room,
            booker("third@example.in", monday(10, 30)),
            "ip_1",
        );
        expect(booking.status).toBe("CONFIRMED");
    });

    it("keeps a person's buffer clear too", async () => {
        await publicBookings.bookOnline(
            withAsha,
            booker("asha1@example.in", monday(9)),
            "ip_1",
        );
        const left = await startsOn(withAsha, monday(9));
        expect(left).not.toContain("10:00");
        expect(left[0]).toBe("10:30");
        await expect(
            publicBookings.bookOnline(
                withAsha,
                booker("asha2@example.in", monday(10)),
                "ip_1",
            ),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses moving a booking into another's buffer, and lets it move to a free half hour", async () => {
        const { booking } = await publicBookings.bookOnline(
            room,
            booker("mover@example.in", monday(9, 0, 2)),
            "ip_1",
        );
        await publicBookings.bookOnline(
            room,
            booker("blocker@example.in", monday(11, 0, 2)),
            "ip_1",
        );
        // 10:00–11:00 and its 15 minutes after run into 11:00.
        await expect(
            bookings.rescheduleBooking(owner, booking.id, {
                startAt: monday(10, 0, 2).toISOString(),
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        const moved = await bookings.rescheduleBooking(owner, booking.id, {
            startAt: monday(9, 30, 2).toISOString(),
        });
        expect(moved.startAt.toISOString()).toBe(
            monday(9, 30, 2).toISOString(),
        );
    });
});
