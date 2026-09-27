/**
 * Time off ranges, part-days and "Everyone — business closed" against a real
 * Postgres (E3): a closure takes every slot of every service — staffed, a
 * class, and one nobody takes — a part-day range only its hours, bookings
 * already made are named and kept, and the booking page offers nothing
 * inside a closure and shows the day closed. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "../bookings/bookings.service";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { ClosuresService } from "./closures.service";
import { StaffService } from "./staff.service";

const bookings = new BookingsService();
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const staff = new StaffService();
const closures = new ClosuresService();

const DAY = 86_400_000;

let org: OrganizationContext;
let otherOrg: OrganizationContext;
let ptId: string;
let classId: string;
let walkInId: string;
let seq = 0;

/** The UTC calendar date `days` from today. */
function date(days: number): string {
    return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}

/** `hour`:00 UTC on the date `days` from today. */
function at(days: number, hour: number): Date {
    return new Date(`${date(days)}T${String(hour).padStart(2, "0")}:00:00Z`);
}

/** Every day from `from` to `to` (minutes), a service's own rules. */
async function rulesEveryDay(serviceId: string, from: number, to: number) {
    await prisma.availabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            organizationId: org.organizationId,
            serviceId,
            dayOfWeek,
            startMinute: from,
            endMinute: to,
        })),
    });
}

async function service(name: string, capacity: number) {
    return (
        await prisma.service.create({
            data: {
                organizationId: org.organizationId,
                name,
                durationMinutes: 60,
                capacity,
                timezone: "UTC",
                status: "ACTIVE",
            },
        })
    ).id;
}

async function contact() {
    seq += 1;
    return prisma.contact.create({
        data: {
            organizationId: org.organizationId,
            email: `closure-${seq}@example.com`,
            firstName: `Guest${seq}`,
        },
    });
}

/** Open starts of a service on the day `days` from today, as "HH:MM". */
async function startsOn(serviceId: string, days: number): Promise<string[]> {
    const slots = await bookings.availability(
        org,
        serviceId,
        at(days, 0).toISOString(),
        at(days + 1, 0).toISOString(),
    );
    return slots.map((s) => s.startAt.toISOString().slice(11, 16));
}

let asha: string;
let ben: string;

beforeAll(async () => {
    const created = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `closures-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `closures-${process.pid}@example.com` },
    });
    org = { organizationId: created.id, userId: user.id, role: "OWNER" };
    const other = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `closures-other-${process.pid}` },
    });
    otherOrg = { organizationId: other.id, userId: "user_2", role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.organizationId, timezone: "UTC" },
    });

    // A one-to-one the people's hours decide; a class with its own times
    // and an instructor; and a walk-in nobody takes.
    ptId = await service("Cleaning", 1);
    classId = await service("Group session", 8);
    await rulesEveryDay(classId, 10 * 60, 12 * 60);
    walkInId = await service("Walk-in consult", 1);
    await rulesEveryDay(walkInId, 9 * 60, 17 * 60);

    const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        startMinute: 6 * 60,
        endMinute: 18 * 60,
    }));
    asha = (
        await staff.create(org, { name: "Asha", serviceIds: [ptId], hours })
    ).id;
    ben = (
        await staff.create(org, {
            name: "Ben",
            serviceIds: [ptId, classId],
            hours,
        })
    ).id;
});

afterEach(async () => {
    await prisma.booking.deleteMany({
        where: { organizationId: org.organizationId },
    });
    await prisma.businessClosure.deleteMany({
        where: { organizationId: org.organizationId },
    });
    await prisma.staffTimeOff.deleteMany({
        where: { organizationId: org.organizationId },
    });
});

describe("business closed (real database)", () => {
    it("removes every slot of every service on the closed days, and none either side", async () => {
        const before = {
            pt: await startsOn(ptId, 4),
            cls: await startsOn(classId, 4),
            walkIn: await startsOn(walkInId, 4),
        };
        expect(before.pt).toHaveLength(12);
        expect(before.cls).toEqual(["10:00", "11:00"]);
        expect(before.walkIn).toHaveLength(8);

        await closures.add(org, {
            fromDate: date(3),
            toDate: date(5),
            reason: "Diwali",
        });

        for (const days of [3, 4, 5]) {
            expect(await startsOn(ptId, days)).toEqual([]);
            expect(await startsOn(classId, days)).toEqual([]);
            expect(await startsOn(walkInId, days)).toEqual([]);
        }
        expect(await startsOn(ptId, 6)).toHaveLength(12);
        expect(await startsOn(classId, 6)).toEqual(["10:00", "11:00"]);
        expect(await startsOn(walkInId, 2)).toHaveLength(8);
    });

    it("takes out only 14:00–18:00 of a part-day range, on each of its days", async () => {
        const added = await closures.add(org, {
            fromDate: date(3),
            toDate: date(5),
            startMinute: 14 * 60,
            endMinute: 18 * 60,
        });
        expect(added.closures).toHaveLength(3);
        for (const days of [3, 4, 5]) {
            expect(await startsOn(walkInId, days)).toEqual([
                "09:00",
                "10:00",
                "11:00",
                "12:00",
                "13:00",
            ]);
            expect(await startsOn(ptId, days)).toEqual([
                "06:00",
                "07:00",
                "08:00",
                "09:00",
                "10:00",
                "11:00",
                "12:00",
                "13:00",
            ]);
        }
    });

    it("names the bookings already in the time, and keeps them", async () => {
        const c = await contact();
        const made = await bookings.bookByHand(org, walkInId, {
            startAt: at(4, 10).toISOString(),
            contactId: c.id,
        });
        const preview = await closures.preview(org, {
            fromDate: date(3),
            toDate: date(5),
        });
        expect(preview.affected.map((b) => b.id)).toEqual([made.id]);

        const added = await closures.add(org, {
            fromDate: date(3),
            toDate: date(5),
        });
        expect(added.affected.map((b) => b.id)).toEqual([made.id]);
        const kept = await prisma.booking.findUniqueOrThrow({
            where: { id: made.id },
        });
        expect(kept.status).toBe("CONFIRMED");
    });

    it("names a booking in a part-day range however many fall outside its hours (K-4)", async () => {
        // A thousand mornings between the range's first and last afternoon:
        // inside its bounds, outside its hours. Read soonest-first and then
        // filtered, they crowded out the afternoon booking.
        const morning = at(4, 9);
        await prisma.booking.createMany({
            data: Array.from({ length: 1_000 }, () => ({
                organizationId: org.organizationId,
                serviceId: walkInId,
                startAt: morning,
                endAt: new Date(morning.getTime() + 3_600_000),
                timezone: "UTC",
                snapshot: {},
            })),
        });
        const afternoon = at(5, 15);
        const inRange = await prisma.booking.create({
            data: {
                organizationId: org.organizationId,
                serviceId: walkInId,
                startAt: afternoon,
                endAt: new Date(afternoon.getTime() + 3_600_000),
                timezone: "UTC",
                snapshot: {},
            },
        });

        const preview = await closures.preview(org, {
            fromDate: date(3),
            toDate: date(5),
            startMinute: 14 * 60,
            endMinute: 18 * 60,
        });

        expect(preview.affected.map((b) => b.id)).toEqual([inRange.id]);
    });

    it("refuses a booking by hand, or a move, into a closure", async () => {
        const c = await contact();
        const made = await bookings.bookByHand(org, walkInId, {
            startAt: at(6, 10).toISOString(),
            contactId: c.id,
        });
        await closures.add(org, { fromDate: date(4) });

        await expect(
            bookings.bookByHand(org, walkInId, {
                startAt: at(4, 10).toISOString(),
                contactId: c.id,
            }),
        ).rejects.toMatchObject({ response: { field: "startAt" } });
        await expect(
            bookings.bookByHand(org, ptId, {
                startAt: at(4, 9).toISOString(),
                contactId: c.id,
                staffId: asha,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            bookings.rescheduleBooking(org, made.id, {
                startAt: at(4, 11).toISOString(),
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("opens again when the closure is removed", async () => {
        const added = await closures.add(org, {
            fromDate: date(3),
            toDate: date(4),
            startMinute: 9 * 60,
            endMinute: 12 * 60,
        });
        expect(await startsOn(walkInId, 3)).toHaveLength(5);
        await closures.remove(
            org,
            added.closures.map((c) => c.id),
        );
        expect(await startsOn(walkInId, 3)).toHaveLength(8);
        expect(await closures.list(org)).toEqual([]);
    });

    it("keeps another business's closure and rows out", async () => {
        const added = await closures.add(org, { fromDate: date(3) });
        await expect(
            closures.remove(otherOrg, [added.closures[0]!.id]),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await closures.list(otherOrg)).toEqual([]);
        await expect(
            closures.preview(otherOrg, { fromDate: date(3), staffId: asha }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lists closures with everyone's hours", async () => {
        await closures.add(org, {
            fromDate: date(3),
            toDate: date(5),
            reason: "Diwali",
        });
        const list = await staff.list(org);
        expect(list.closures).toHaveLength(1);
        expect(list.closures[0]).toMatchObject({
            allDay: true,
            reason: "Diwali",
        });
    });
});

describe("the booking page and a closure (real database)", () => {
    it("offers no start inside a closure, and shows the day closed", async () => {
        await closures.add(org, { fromDate: date(3), reason: "Diwali" });

        const days = await publicBookings.publicDays(walkInId);
        const closed = days.days.find((d) => d.date === date(3));
        expect(closed).toMatchObject({ open: false, starts: [] });
        expect(days.days.find((d) => d.date === date(4))?.open).toBe(true);
        expect(JSON.stringify(days)).not.toMatch(/Diwali/);

        const staffed = await publicBookings.publicDays(ptId);
        expect(staffed.days.find((d) => d.date === date(3))).toMatchObject({
            open: false,
            starts: [],
        });

        const slots = await publicBookings.publicAvailability(
            walkInId,
            at(3, 0).toISOString(),
            at(4, 0).toISOString(),
        );
        expect(slots).toEqual([]);

        await expect(
            publicBookings.bookOnline(
                walkInId,
                {
                    startAt: at(3, 10).toISOString(),
                    bookerName: "Asha Rao",
                    bookerEmail: "asha@example.in",
                    idempotencyKey: "closure-key-1",
                    pay: "DESK",
                },
                "ip_1",
            ),
        ).rejects.toMatchObject({
            response: {
                message: "The business is closed then. Pick another time.",
            },
        });
    });
});

describe("time off ranges and part-days (real database)", () => {
    it("stores a part-day range as one row per day, for that person only", async () => {
        const result = await staff.addTimeOff(org, ben, {
            fromDate: date(3),
            toDate: date(5),
            startMinute: 14 * 60,
            endMinute: 18 * 60,
            reason: "Course",
        });
        const rows = result.staff.timeOff.filter((t) => !t.allDay);
        expect(rows).toHaveLength(3);

        // Ben's afternoons go; Asha still covers them.
        const slots = await bookings.availability(
            org,
            ptId,
            at(4, 0).toISOString(),
            at(5, 0).toISOString(),
        );
        const three = slots.find(
            (s) => s.startAt.getTime() === at(4, 15).getTime(),
        );
        expect(three?.staffIds).toEqual([asha]);
        const nine = slots.find(
            (s) => s.startAt.getTime() === at(4, 9).getTime(),
        );
        expect(nine?.staffIds?.sort()).toEqual([asha, ben].sort());

        const back = await staff.removeTimeOffMany(
            org,
            ben,
            rows.map((t) => t.id),
        );
        expect(back.timeOff).toHaveLength(0);
    });

    it("refuses To before From", async () => {
        await expect(
            staff.addTimeOff(org, ben, {
                fromDate: date(5),
                toDate: date(3),
            }),
        ).rejects.toMatchObject({ response: { field: "toDate" } });
    });

    it("404s another business's person", async () => {
        await expect(
            staff.addTimeOff(otherOrg, ben, { fromDate: date(3) }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
