/**
 * Opening hours against a real Postgres (DEC-087, DEC-096): with walk-in
 * storefronts whose hours are set, in-person bookings are offered and taken
 * only while one of them is open, and an online storefront's hours are left
 * alone. With no walk-in storefront, the business's own week (Settings ›
 * Hours, on its storefront) cuts in-person times. Online bookings are never
 * cut. Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { BadRequestException } from "@nestjs/common";
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
/** In person, with Asha: she works Mondays 09:00–13:00 UTC. */
let inPerson: string;
/** Either way, with Ravi: he works Mondays 09:00–13:00 UTC. */
let either: string;
let keySeq = 0;

const MONDAY = 1;
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** A week open `open`–`close` on Mondays only. */
function mondays(open: string, close: string) {
    return DAYS.map((day) => ({
        day,
        open,
        close,
        closed: day !== "MON",
    }));
}

/** The Monday `weeksOut` weeks ahead, at `hour`:`minute` UTC. */
function monday(hour: number, minute = 0, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour, minute);
    return d;
}

function booker(email: string, startAt: Date, where?: "ONLINE") {
    keySeq += 1;
    return {
        startAt: startAt.toISOString(),
        bookerName: "Meera Pillai",
        bookerEmail: email,
        idempotencyKey: `open_${keySeq}`,
        pay: "DESK" as const,
        ...(where ? { locationType: where } : {}),
    };
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `opening-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `opening-${process.pid}@example.in` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Kavi Dental",
            slug: `kavi-open-${process.pid}`,
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

    // Two shops: open 10:00–11:30 and 11:00–13:00 on Mondays — together,
    // 10:00–13:00. The online storefront's all-day hours never count.
    for (const [name, kind, openingHours] of [
        ["Indiranagar", "SHOP", mondays("10:00", "11:30")],
        ["Koramangala", "SHOP", mondays("11:00", "13:00")],
        ["Online", "ONLINE", mondays("00:00", "23:59")],
    ] as const) {
        await prisma.store.create({
            data: {
                organizationId: org.id,
                name,
                settings: { create: { kind, openingHours } },
            },
        });
    }

    const service = (name: string, locationType: string) =>
        prisma.service.create({
            data: {
                organizationId: org.id,
                name,
                durationMinutes: 60,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                timezone: "UTC",
                locationType,
                meetingUrl:
                    locationType === "IN_PERSON"
                        ? null
                        : "https://meet.example.in/kavi",
            },
        });
    inPerson = (await service("Check-up", "IN_PERSON")).id;
    either = (await service("Consultation", "EITHER")).id;
    for (const [name, serviceId] of [
        ["Asha Iyer", inPerson],
        ["Ravi Menon", either],
    ]) {
        await prisma.staffMember.create({
            data: {
                organizationId: org.id,
                name,
                services: { create: { organizationId: org.id, serviceId } },
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
    }
});

async function startsOn(serviceId: string, day: Date) {
    const days = await publicBookings.publicDays(serviceId, monday(0));
    const date = day.toISOString().slice(0, 10);
    return (days.days.find((d) => d.date === date)?.starts ?? []).map(
        (s) => [s.startAt.slice(11, 16), s.only ?? null] as const,
    );
}

describe("opening hours (DEC-087, real database)", () => {
    it("offers in person only while a shop is open, both shops together", async () => {
        expect(await startsOn(inPerson, monday(9))).toEqual([
            ["10:00", null],
            ["10:30", null],
            ["11:00", null],
            ["11:30", null],
            ["12:00", null],
        ]);
    });

    it("refuses an in-person booking before opening, and takes one inside", async () => {
        await expect(
            publicBookings.bookOnline(
                inPerson,
                booker("early@example.in", monday(9)),
                "ip_1",
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        const { booking } = await publicBookings.bookOnline(
            inPerson,
            booker("inside@example.in", monday(10)),
            "ip_1",
        );
        expect(booking.status).toBe("CONFIRMED");

        // Moving it before opening is refused too; the booking stays put.
        await expect(
            bookings.rescheduleBooking(owner, booking.id, {
                startAt: monday(9).toISOString(),
            }),
        ).rejects.toThrow("That time is outside opening hours.");
        const kept = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(kept.startAt.toISOString()).toBe(monday(10).toISOString());
    });

    it("lists either way's early times as online only, and books them online", async () => {
        expect(await startsOn(either, monday(9, 0, 2))).toEqual([
            ["09:00", "ONLINE"],
            ["09:30", "ONLINE"],
            ["10:00", null],
            ["10:30", null],
            ["11:00", null],
            ["11:30", null],
            ["12:00", null],
        ]);
        await expect(
            publicBookings.bookOnline(
                either,
                booker("inperson@example.in", monday(9, 0, 2)),
                "ip_1",
            ),
        ).rejects.toThrow(/choose online/);
        const { booking } = await publicBookings.bookOnline(
            either,
            booker("online@example.in", monday(9, 0, 2), "ONLINE"),
            "ip_1",
        );
        expect(booking.locationType).toBe("ONLINE");
    });
});

describe("opening hours with no walk-in storefront (DEC-096, real database)", () => {
    /** In person, and online, with Divya: she works Mondays 09:00–13:00 UTC. */
    let inPersonOnly: string;
    let onlineOnly: string;

    beforeAll(async () => {
        const org = await prisma.organization.create({
            data: { name: "Neel Physio", slug: `online-hours-${process.pid}` },
        });
        await prisma.businessProfile.create({
            data: { organizationId: org.id, timezone: "UTC" },
        });
        // Its only storefront is online; Settings › Hours saved 10:00–12:00
        // Mondays to it — the hours its site header shows.
        await prisma.store.create({
            data: {
                organizationId: org.id,
                name: "Online",
                settings: {
                    create: {
                        kind: "ONLINE",
                        openingHours: mondays("10:00", "12:00"),
                    },
                },
            },
        });
        const service = (name: string, locationType: string) =>
            prisma.service.create({
                data: {
                    organizationId: org.id,
                    name,
                    durationMinutes: 60,
                    capacity: 1,
                    priceCents: 50_000,
                    currency: "INR",
                    timezone: "UTC",
                    locationType,
                    meetingUrl:
                        locationType === "IN_PERSON"
                            ? null
                            : "https://meet.example.in/neel",
                },
            });
        inPersonOnly = (await service("Assessment", "IN_PERSON")).id;
        onlineOnly = (await service("Video follow-up", "ONLINE")).id;
        await prisma.staffMember.create({
            data: {
                organizationId: org.id,
                name: "Divya Rao",
                services: {
                    create: [inPersonOnly, onlineOnly].map((serviceId) => ({
                        organizationId: org.id,
                        serviceId,
                    })),
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

    it("offers in person only inside the business's hours", async () => {
        expect(await startsOn(inPersonOnly, monday(9))).toEqual([
            ["10:00", null],
            ["10:30", null],
            ["11:00", null],
        ]);
        await expect(
            publicBookings.bookOnline(
                inPersonOnly,
                booker("early@example.in", monday(9)),
                "ip_2",
            ),
        ).rejects.toThrow("That time is outside opening hours.");
    });

    it("leaves an online session's times uncut", async () => {
        expect((await startsOn(onlineOnly, monday(9))).map(([t]) => t)).toEqual(
            ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00"],
        );
    });
});
