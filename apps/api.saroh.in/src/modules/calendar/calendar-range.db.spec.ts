/**
 * The calendar's range, team and days off (plan 005 E20) against a real
 * Postgres, for a clinic that sells no orders: a week read with each
 * booking's person and length, the closure and a dentist's time off, the
 * Payments layer from its paid booking invoices, another business's days
 * off never seen, and a range before the month it joined refused with the
 * month to open. Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { CalendarService } from "./calendar.service";

const tag = `${process.pid}-${Date.now()}`;
const NOW = new Date("2026-09-20T06:00:00Z");

const availability = {
    listViews: jest
        .fn()
        .mockResolvedValue([{ key: "APPOINTMENTS", readiness: "ACTIVE" }]),
} as unknown as ModuleAvailabilityService;

const calendar = new CalendarService(availability);

describe("Business Calendar range, team and days off (DB, E20)", () => {
    let ownerId = "";
    let ctx: OrganizationContext;
    let otherOrgId = "";
    let pillaiId = "";
    let raoId = "";
    let invoiceId = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `calendar-e20-${tag}@example.com` },
            })
        ).id;
        const org = await prisma.organization.create({
            data: {
                name: "Kavi Dental",
                slug: `calendar-e20-${tag}`,
                // Joined on 1 September 2026 (IST).
                createdAt: new Date("2026-09-01T04:00:00Z"),
            },
        });
        ctx = { organizationId: org.id, userId: ownerId, role: "OWNER" };
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `calendar-e20-else-${tag}` },
            })
        ).id;
        await prisma.businessProfile.create({
            data: { organizationId: org.id, timezone: "Asia/Kolkata" },
        });

        pillaiId = (
            await prisma.staffMember.create({
                data: {
                    organizationId: org.id,
                    name: "Dr. Pillai",
                    title: "Dentist",
                },
            })
        ).id;
        raoId = (
            await prisma.staffMember.create({
                data: { organizationId: org.id, name: "Dr. Rao" },
            })
        ).id;
        // Archived: off the team, and off the calendar with their time off.
        const gone = await prisma.staffMember.create({
            data: {
                organizationId: org.id,
                name: "Dr. Former",
                status: "ARCHIVED",
            },
        });

        // Dr. Pillai off on Tuesday 15 September; the archived one too.
        for (const staffId of [pillaiId, gone.id]) {
            await prisma.staffTimeOff.create({
                data: {
                    organizationId: org.id,
                    staffId,
                    startAt: new Date("2026-09-14T18:30:00Z"),
                    endAt: new Date("2026-09-15T18:30:00Z"),
                    allDay: true,
                    reason: "Family wedding",
                },
            });
        }
        // Closed Thursday 17 September; the other business on the 16th.
        await prisma.businessClosure.create({
            data: {
                organizationId: org.id,
                startAt: new Date("2026-09-16T18:30:00Z"),
                endAt: new Date("2026-09-17T18:30:00Z"),
                allDay: true,
                reason: "Onam",
            },
        });
        await prisma.businessClosure.create({
            data: {
                organizationId: otherOrgId,
                startAt: new Date("2026-09-15T18:30:00Z"),
                endAt: new Date("2026-09-16T18:30:00Z"),
                allDay: true,
            },
        });

        const checkUp = await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Check-up",
                durationMinutes: 30,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                timezone: "Asia/Kolkata",
            },
        });
        // Monday 14th at 10:00 with Dr. Rao, 30 minutes; paid online.
        const start = new Date("2026-09-14T04:30:00Z");
        const visit = await prisma.booking.create({
            data: {
                organizationId: org.id,
                serviceId: checkUp.id,
                staffId: raoId,
                startAt: start,
                endAt: new Date(start.getTime() + 30 * 60_000),
                timezone: "Asia/Kolkata",
                status: "CONFIRMED",
                outcome: "NO_SHOW",
                bookerName: "Asha Rao",
                snapshot: {},
            },
        });
        invoiceId = (
            await prisma.invoice.create({
                data: {
                    organizationId: org.id,
                    number: `INV-E20-${tag}`,
                    status: "PAID",
                    source: "BOOKING",
                    bookingId: visit.id,
                    billToName: "Asha Rao",
                    currency: "INR",
                    subtotal: "800",
                    total: "800",
                    issuedAt: new Date("2026-09-10T06:00:00Z"),
                    paidAt: new Date("2026-09-10T06:00:00Z"),
                },
            })
        ).id;
    });

    afterAll(async () => {
        const orgIds = [ctx.organizationId, otherOrgId];
        const where = { organizationId: { in: orgIds } };
        await prisma.invoice.deleteMany({ where });
        await prisma.booking.deleteMany({ where });
        await prisma.service.deleteMany({ where });
        await prisma.businessClosure.deleteMany({ where });
        await prisma.staffTimeOff.deleteMany({ where });
        await prisma.staffMember.deleteMany({ where });
        await prisma.businessProfile.deleteMany({ where });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    it("a week: its bookings with person and length, its closure and time off, the team", async () => {
        const week = await calendar.read(
            ctx,
            { from: "2026-09-14", to: "2026-09-20" },
            NOW,
        );

        expect(week.days).toHaveLength(7);
        expect(week.days[0].layers.bookings?.items[0]).toMatchObject({
            title: "Check-up · Asha Rao",
            staffId: raoId,
            durationMinutes: 30,
            flags: ["no_show"],
        });
        expect(week.daysOff).toEqual([
            expect.objectContaining({
                kind: "closure",
                dates: ["2026-09-17"],
                reason: "Onam",
            }),
            expect.objectContaining({
                kind: "time_off",
                dates: ["2026-09-15"],
                staffId: pillaiId,
                name: "Dr. Pillai",
                reason: "Family wedding",
            }),
        ]);
        expect(week.hasStaff).toBe(true);
        expect(week.staff?.map((s) => s.name)).toEqual([
            "Dr. Pillai",
            "Dr. Rao",
        ]);
        expect(week.unavailable).toEqual([]);
    });

    it("the clinic's payments are a layer, read from its invoices", async () => {
        const month = await calendar.read(
            ctx,
            { from: "2026-09-01", to: "2026-09-30" },
            NOW,
        );
        expect(month.layers).toEqual(["bookings", "classes", "payments"]);
        const day = month.days.find((d) => d.date === "2026-09-10");
        expect(day?.layers.payments?.items).toEqual([
            expect.objectContaining({
                title: "Check-up · Asha Rao",
                link: { type: "invoice", id: invoiceId },
                staffId: raoId,
                in: 80_000,
            }),
        ]);
        expect(month.takings?.total).toEqual([
            { currency: "INR", amount: "800.00" },
        ]);
    });

    it("a Member sees the days off by name, and no payments", async () => {
        const month = await calendar.read(
            { ...ctx, role: "MEMBER" },
            { from: "2026-09-14", to: "2026-09-20" },
            NOW,
        );
        expect(month.layers).toEqual(["bookings", "classes"]);
        expect(month.daysOff?.map((d) => d.name ?? null)).toEqual([
            null,
            "Dr. Pillai",
        ]);
    });

    it("a month before it joined is refused with the month to open", async () => {
        const error = await calendar
            .read(ctx, { from: "2026-08-01", to: "2026-08-31" }, NOW)
            .then(
                () => null,
                (e: unknown) => e,
            );
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
            details: { reason: "before_joined", earliestMonth: "2026-09" },
        });
    });
});
