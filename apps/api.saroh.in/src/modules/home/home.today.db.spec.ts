/**
 * Home's Today column (round 2, F5) against a real Postgres: the business's
 * day is its own zone's (a booking at 23:30 in Mumbai is today's, one at
 * 00:30 the next day isn't, though UTC says otherwise for both); a cancelled
 * booking isn't coming; an arrived one carries the time it was marked; and
 * another business's bookings are never seen.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { BookingsService } from "../bookings/bookings.service";
import { readToday } from "./home-today";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// 09:30 in Mumbai on 18 Sep 2026.
const NOW = new Date("2026-09-18T04:00:00.000Z");
const at = (iso: string) => new Date(`${iso}+05:30`);
const SCOPE = { bookings: true, pickUps: true, canMark: true, flags: true };

describe("Home F5 Today (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let arrivedId = "";
    let userId = "";

    async function book(
        organizationId: string,
        serviceId: string,
        startAt: Date,
        who: string,
        status = "CONFIRMED",
    ) {
        return prisma.booking.create({
            data: {
                organizationId,
                serviceId,
                startAt,
                endAt: new Date(startAt.getTime() + 30 * 60_000),
                timezone: ZONE,
                status,
                bookerName: who,
                snapshot: {},
            },
        });
    }

    async function service(organizationId: string, name: string) {
        return prisma.service.create({
            data: {
                organizationId,
                name,
                durationMinutes: 30,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: ZONE,
            },
        });
    }

    beforeAll(async () => {
        userId = (
            await prisma.user.create({
                data: { email: `home-f5-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Kavi Dental", slug: `home-f5-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `home-f5-other-${tag}` },
            })
        ).id;
        const cleaning = await service(orgId, "Cleaning");
        const theirs = await service(otherOrgId, "Cleaning");

        arrivedId = (
            await book(orgId, cleaning.id, at("2026-09-18T09:00"), "Farah")
        ).id;
        await book(orgId, cleaning.id, at("2026-09-18T23:30"), "Late Night");
        await book(orgId, cleaning.id, at("2026-09-19T00:30"), "Tomorrow");
        await book(orgId, cleaning.id, at("2026-09-17T23:30"), "Yesterday");
        await book(
            orgId,
            cleaning.id,
            at("2026-09-18T11:00"),
            "Called Off",
            "CANCELLED",
        );
        await book(otherOrgId, theirs.id, at("2026-09-18T10:00"), "Not Ours");
    });

    afterAll(async () => {
        await prisma.organization.deleteMany({
            where: { id: { in: [orgId, otherOrgId] } },
        });
        await prisma.user.deleteMany({ where: { id: userId } });
    });

    const input = () => ({
        organizationId: orgId,
        organizationRole: "OWNER" as const,
    });

    it("keeps the business's own day, in its zone", async () => {
        const today = await readToday(prisma, input(), SCOPE, {
            now: NOW,
            zone: ZONE,
        });
        expect(today.date).toBe("2026-09-18");
        expect(today.items.map((i) => [i.time, i.what])).toEqual([
            ["09:00", "Cleaning · Farah"],
            // 18:00 UTC: tomorrow by UTC's reckoning, today by the business's.
            ["23:30", "Cleaning · Late Night"],
        ]);
    });

    it("tags a booking marked Arrived with the time it was marked", async () => {
        const bookings = new BookingsService();
        const markedAt = at("2026-09-18T09:32");
        await bookings.recordOutcome(
            { organizationId: orgId, userId, role: "OWNER" },
            arrivedId,
            "ATTENDED",
            markedAt,
        );
        // The event's own clock is the database's; pin it to the moment.
        await prisma.bookingEvent.updateMany({
            where: { bookingId: arrivedId, type: "ATTENDED" },
            data: { createdAt: markedAt },
        });

        const today = await readToday(prisma, input(), SCOPE, {
            now: NOW,
            zone: ZONE,
        });
        expect(today.items[0]).toMatchObject({
            id: arrivedId,
            outcome: "ATTENDED",
            outcomeTime: "09:32",
        });
    });

    it("refuses No-show on a cancelled booking, and says why", async () => {
        const cancelled = await prisma.booking.findFirstOrThrow({
            where: { organizationId: orgId, status: "CANCELLED" },
        });
        await expect(
            new BookingsService().recordOutcome(
                { organizationId: orgId, userId, role: "OWNER" },
                cancelled.id,
                "NO_SHOW",
                NOW,
            ),
        ).rejects.toThrow("This booking was cancelled");
    });
});
