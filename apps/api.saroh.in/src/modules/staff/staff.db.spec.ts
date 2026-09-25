/**
 * Staff against a real Postgres (U3): per-person free times, a person who is
 * off or already booked, one person across two services racing, the kept
 * bookings a new week of hours leaves outside, a class place cancelled either
 * side of the free-cancellation window, and a membership's monthly classes.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "../bookings/bookings.service";
import { ClassPacksService } from "../class-packs/class-packs.service";
import { InvoicesService } from "../invoices/invoices.service";
import { StaffService } from "./staff.service";

const bookings = new BookingsService();
const staff = new StaffService();
const packs = new ClassPacksService(new InvoicesService());

const DAY = 86_400_000;
const HOUR = 3_600_000;

let org: OrganizationContext;
let member: OrganizationContext;
let ptId: string;
let massageId: string;
let classId: string;
let unstaffedId: string;
let people = 0;

/** 09:00 UTC, `days` from now. */
function at(days: number, hour = 9): Date {
    const d = new Date(Date.now() + days * DAY);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
}

/** Every day, all day — a service's own rules that never get in the way. */
async function allDayRules(serviceId: string) {
    await prisma.availabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            organizationId: org.organizationId,
            serviceId,
            dayOfWeek,
            startMinute: 0,
            endMinute: 1440,
        })),
    });
}

async function makeService(name: string, capacity: number, rules: boolean) {
    const service = await prisma.service.create({
        data: {
            organizationId: org.organizationId,
            name,
            durationMinutes: 60,
            capacity,
            timezone: "UTC",
            status: "ACTIVE",
        },
    });
    if (rules) await allDayRules(service.id);
    return service.id;
}

/** A person who works 06:00–18:00 every day and takes the given services. */
async function person(name: string, serviceIds: string[]) {
    return staff.create(org, {
        name,
        serviceIds,
        hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            startMinute: 6 * 60,
            endMinute: 18 * 60,
        })),
    });
}

async function contact() {
    people += 1;
    return prisma.contact.create({
        data: {
            organizationId: org.organizationId,
            email: `staff-person${people}@example.com`,
            firstName: `Person${people}`,
        },
    });
}

beforeAll(async () => {
    const created = await prisma.organization.create({
        data: { name: "Staff Org", slug: `staff-org-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `staff-${process.pid}@example.com` },
    });
    org = { organizationId: created.id, userId: user.id, role: "OWNER" };
    member = { ...org, role: "MEMBER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.organizationId, timezone: "UTC" },
    });
    // One-to-ones with no rules of their own: the people's hours decide.
    ptId = await makeService("PT session", 1, false);
    massageId = await makeService("Sports massage", 1, false);
    classId = await makeService("HIIT", 10, true);
    unstaffedId = await makeService("Walk-in consult", 1, true);
});

afterEach(async () => {
    await prisma.booking.deleteMany({
        where: { organizationId: org.organizationId },
    });
    await prisma.staffMember.deleteMany({
        where: { organizationId: org.organizationId },
    });
    await prisma.bookingRules.deleteMany({
        where: { organizationId: org.organizationId },
    });
});

describe("staff and their hours (real database)", () => {
    it("offers each person's free starts and takes one away for that person only", async () => {
        const asha = await person("Asha", [ptId]);
        const ben = await person("Ben", [ptId]);
        const from = at(3, 0);
        const to = new Date(from.getTime() + DAY);

        const before = await bookings.availability(
            org,
            ptId,
            from.toISOString(),
            to.toISOString(),
        );
        // 06:00 … 17:00 starts, both people on each.
        expect(before).toHaveLength(12);
        expect(before[1]!.staffIds).toEqual([asha.id, ben.id]);

        const c = await contact();
        const made = await bookings.bookByHand(org, ptId, {
            startAt: at(3, 7).toISOString(),
            contactId: c.id,
            staffId: asha.id,
        });
        expect(made.staffId).toBe(asha.id);

        const after = await bookings.availability(
            org,
            ptId,
            from.toISOString(),
            to.toISOString(),
        );
        const seven = after.find(
            (s) => s.startAt.getTime() === at(3, 7).getTime(),
        );
        expect(seven?.staffIds).toEqual([ben.id]);
    });

    it("refuses a person who is off, and one already booked on another service", async () => {
        const asha = await person("Asha", [ptId, massageId]);
        const c = await contact();

        await staff.addTimeOff(org, asha.id, {
            startAt: at(4, 0).toISOString(),
            endAt: at(5, 0).toISOString(),
            reason: "Wedding",
        });
        await expect(
            bookings.bookByHand(org, ptId, {
                startAt: at(4, 9).toISOString(),
                contactId: c.id,
                staffId: asha.id,
            }),
        ).rejects.toMatchObject({ response: { field: "staffId" } });

        await bookings.bookByHand(org, ptId, {
            startAt: at(6, 9).toISOString(),
            contactId: c.id,
            staffId: asha.id,
        });
        await expect(
            bookings.bookByHand(org, massageId, {
                startAt: at(6, 9).toISOString(),
                contactId: c.id,
                staffId: asha.id,
            }),
        ).rejects.toMatchObject({
            response: { message: "Asha is already booked then." },
        });
    });

    it("lets only one of two bookings for the same person at once commit, across services", async () => {
        const asha = await person("Asha", [ptId, massageId]);
        const [c1, c2] = [await contact(), await contact()];
        const results = await Promise.allSettled([
            bookings.bookByHand(org, ptId, {
                startAt: at(7, 10).toISOString(),
                contactId: c1.id,
                staffId: asha.id,
            }),
            bookings.bookByHand(org, massageId, {
                startAt: at(7, 10).toISOString(),
                contactId: c2.id,
                staffId: asha.id,
            }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(
            await prisma.booking.count({
                where: { staffId: asha.id, status: "CONFIRMED" },
            }),
        ).toBe(1);
    });

    it("keeps the bookings new hours leave outside, and lists them", async () => {
        const asha = await person("Asha", [ptId]);
        const c = await contact();
        const early = await bookings.bookByHand(org, ptId, {
            startAt: at(8, 7).toISOString(),
            contactId: c.id,
            staffId: asha.id,
        });
        await bookings.bookByHand(org, ptId, {
            startAt: at(8, 12).toISOString(),
            contactId: c.id,
            staffId: asha.id,
        });

        // From now on, 10:00–18:00: the 7:00 booking is outside, 12:00 inside.
        const saved = await staff.replaceHours(
            org,
            asha.id,
            Array.from({ length: 7 }, (_, dayOfWeek) => ({
                dayOfWeek,
                startMinute: 10 * 60,
                endMinute: 18 * 60,
            })),
        );
        expect(saved.outside.map((b) => b.id)).toEqual([early.id]);
        // Kept, not cancelled.
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: early.id },
                })
            ).status,
        ).toBe("CONFIRMED");
    });

    it("opens a closed day with extra hours on that date only", async () => {
        const asha = await staff.create(org, {
            name: "Asha",
            serviceIds: [ptId],
        });
        const day = at(9, 0);
        const date = day.toISOString().slice(0, 10);
        await staff.addExtraHours(org, asha.id, {
            date,
            startMinute: 14 * 60,
            endMinute: 16 * 60,
        });
        const slots = await bookings.availability(
            org,
            ptId,
            day.toISOString(),
            new Date(day.getTime() + 8 * DAY).toISOString(),
        );
        expect(slots.map((s) => s.startAt.toISOString())).toEqual([
            at(9, 14).toISOString(),
            at(9, 15).toISOString(),
        ]);
    });

    it("refuses a Member writing hours or rules", async () => {
        const asha = await person("Asha", [ptId]);
        await expect(
            staff.replaceHours(member, asha.id, []),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            staff.updateBookingRules(member, { freeCancelHours: 12 }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("books a service nobody takes exactly as before, with no person", async () => {
        const c = await contact();
        const made = await bookings.bookByHand(org, unstaffedId, {
            startAt: at(10, 9).toISOString(),
            contactId: c.id,
        });
        expect(made.staffId).toBeNull();
        expect(made.paidWith).toBeNull();
    });
});

describe("class places and the free-cancellation window (real database)", () => {
    async function soldPack(contactId: string) {
        const pack = await packs.createPack(org, {
            name: `Pack ${people}`,
            credits: 5,
            validityDays: 90,
            price: "2500",
            currency: "INR",
            serviceIds: [classId],
        });
        return packs.sell(org, pack.id, { contactId });
    }

    it("names the instructor on a class place and lets the class fill", async () => {
        const asha = await person("Asha", [classId]);
        const [c1, c2] = [await contact(), await contact()];
        const a = await bookings.bookByHand(org, classId, {
            startAt: at(11, 9).toISOString(),
            contactId: c1.id,
        });
        const b = await bookings.bookByHand(org, classId, {
            startAt: at(11, 9).toISOString(),
            contactId: c2.id,
        });
        expect([a.staffId, b.staffId]).toEqual([asha.id, asha.id]);
    });

    it("returns the pack's class before the window, keeps it used after", async () => {
        await staff.updateBookingRules(org, { freeCancelHours: 24 });
        const c = await contact();
        const sold = await soldPack(c.id);

        const early = await bookings.bookByHand(org, classId, {
            startAt: at(12, 9).toISOString(),
            contactId: c.id,
            packPurchaseId: sold.id,
        });
        expect(early.paidWith).toBe("PACK");
        const late = await bookings.bookByHand(org, classId, {
            startAt: at(13, 9).toISOString(),
            contactId: c.id,
            packPurchaseId: sold.id,
        });
        expect((await packs.getPurchase(org, sold.id)).left).toBe(3);

        // Well before: back to the pack.
        await bookings.cancelBooking(org, early.id);
        expect((await packs.getPurchase(org, sold.id)).left).toBe(4);

        // Two hours before: late, and the class stays used.
        const cancelled = await bookings.cancelBooking(
            org,
            late.id,
            new Date(at(13, 9).getTime() - 2 * HOUR),
        );
        expect(cancelled.cancelledLate).toBe(true);
        expect((await packs.getPurchase(org, sold.id)).left).toBe(4);
    });
});

describe("a membership's classes a month (real database)", () => {
    it("uses the month's allowance and refuses past it", async () => {
        const c = await contact();
        const plan = await prisma.subscriptionPlan.create({
            data: {
                organizationId: org.organizationId,
                name: "Gym basic",
                price: "1500",
                currency: "INR",
                interval: "MONTH",
                classesPerMonth: 1,
            },
        });
        const now = new Date();
        const sub = await prisma.customerSubscription.create({
            data: {
                organizationId: org.organizationId,
                planId: plan.id,
                contactId: c.id,
                price: "1500",
                currency: "INR",
                interval: "MONTH",
                timezone: "UTC",
                anchorAt: now,
                currentPeriodStart: now,
                currentPeriodEnd: new Date(now.getTime() + 30 * DAY),
            },
        });
        // Two sessions in the same calendar month, well ahead.
        const first = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 3, 9),
        );
        const second = new Date(first.getTime() + DAY);

        const used = await bookings.bookByHand(org, classId, {
            startAt: first.toISOString(),
            contactId: c.id,
            paidWith: "MEMBERSHIP",
            subscriptionId: sub.id,
        });
        expect(used).toMatchObject({
            paidWith: "MEMBERSHIP",
            subscriptionId: sub.id,
        });
        await expect(
            bookings.bookByHand(org, classId, {
                startAt: second.toISOString(),
                contactId: c.id,
                paidWith: "MEMBERSHIP",
                subscriptionId: sub.id,
            }),
        ).rejects.toMatchObject({ response: { field: "subscriptionId" } });
    });
});
