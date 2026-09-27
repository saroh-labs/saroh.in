/**
 * On today against a real Postgres (G18): the rows are the booking page's
 * own starts for today, a shop-only business gets no panel, a closure
 * reaches the open-or-closed line, and the read is one site's business only.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { HttpException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { publicDays } from "./public-booking-page";
import { PublicTodayService } from "./public-today";
import { FixedWindowRateLimiter } from "./rate-limiter";

// Generous: these tests read many times from one "visitor".
const today = new PublicTodayService(new FixedWindowRateLimiter(1_000));

const MONDAY = 1;
const WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => ({
    day,
    open: "09:00",
    close: "18:00",
    closed: day === "SUN",
}));

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

/** The next Monday at `hour`:`minute` UTC (the businesses here keep UTC). */
function nextMonday(hour: number, minute = 0): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead);
    d.setUTCHours(hour, minute);
    return d;
}

async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("g18-org") },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name, slug: uniq("g18-site") },
    });
    await prisma.store.create({
        data: {
            name: "Main",
            slug: uniq("g18-store"),
            organizationId: org.id,
            settings: { create: { kind: "SHOP", openingHours: WEEK } },
        },
    });
    return { organizationId: org.id, siteId: site.id };
}

let studio: { organizationId: string; siteId: string };
let hatha: string;
let training: string;

beforeAll(async () => {
    studio = await business("Pulse Fitness");
    const org = studio.organizationId;
    // Hatha: a class of 3 on Mondays at 11:00.
    hatha = (
        await prisma.service.create({
            data: {
                organizationId: org,
                name: "Hatha",
                durationMinutes: 60,
                capacity: 3,
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: org,
                        dayOfWeek: MONDAY,
                        startMinute: 11 * 60,
                        endMinute: 12 * 60,
                    },
                },
            },
        })
    ).id;
    // Personal training with Karan, Mondays 09:00–13:00.
    training = (
        await prisma.service.create({
            data: {
                organizationId: org,
                name: "Personal training",
                durationMinutes: 60,
                capacity: 1,
                timezone: "UTC",
            },
        })
    ).id;
    await prisma.staffMember.create({
        data: {
            organizationId: org,
            name: "Karan Mehta",
            services: { create: { organizationId: org, serviceId: training } },
            hours: {
                create: {
                    organizationId: org,
                    dayOfWeek: MONDAY,
                    startMinute: 9 * 60,
                    endMinute: 13 * 60,
                },
            },
        },
    });
});

describe("On today (real database)", () => {
    it("lists 11:00 Hatha with 3 left, beside the free times, soonest first", async () => {
        const now = nextMonday(10, 10);
        const read = await today.read(studio.siteId, "visitor", now);

        expect(read).toMatchObject({
            timezone: "UTC",
            date: now.toISOString().slice(0, 10),
            appointments: true,
            classes: true,
        });
        expect(read.items.length).toBeLessThanOrEqual(4);
        const hathaRow = read.items.find((i) => i.serviceId === hatha);
        expect(hathaRow).toMatchObject({
            kind: "class",
            time: "11:00",
            serviceName: "Hatha",
            placesLeft: 3,
        });
        // Soonest first, and nothing that has begun.
        const starts = read.items.map((i) => i.startAt);
        expect([...starts].sort()).toEqual(starts);
        expect(starts.every((s) => new Date(s) > now)).toBe(true);
        // Display names only (ADR-008).
        expect(JSON.stringify(read)).not.toMatch(/organizationId|staffId/);
    });

    it("lists only times the booking page itself offers", async () => {
        const now = nextMonday(10, 10);
        const read = await today.read(studio.siteId, "visitor", now);
        const page = await publicDays(training, now);
        const offered = new Set(
            page.days.flatMap((d) => d.starts.map((s) => s.startAt)),
        );
        const free = read.items.filter((i) => i.kind === "one");
        expect(free.length).toBeGreaterThan(0);
        expect(free.every((i) => offered.has(i.startAt))).toBe(true);
    });

    it("has nothing more after closing", async () => {
        const read = await today.read(studio.siteId, "visitor", nextMonday(20));
        expect(read.appointments).toBe(true);
        expect(read.items).toEqual([]);
    });

    it("carries the business's week for the open-or-closed line", async () => {
        const read = await today.read(studio.siteId, "visitor", nextMonday(8));
        expect(read.hours).toHaveLength(7);
        expect(read.hours?.[0]).toEqual({
            day: "MON",
            open: "09:00",
            close: "18:00",
            closed: false,
        });
    });

    it("names a day the business is closed (E3), and takes it out of the times", async () => {
        const shop = await business("Closed Monday Studio");
        const svc = await prisma.service.create({
            data: {
                organizationId: shop.organizationId,
                name: "Hatha",
                durationMinutes: 60,
                capacity: 3,
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: shop.organizationId,
                        dayOfWeek: MONDAY,
                        startMinute: 11 * 60,
                        endMinute: 12 * 60,
                    },
                },
            },
        });
        await prisma.businessClosure.create({
            data: {
                organizationId: shop.organizationId,
                startAt: nextMonday(0),
                endAt: nextMonday(24),
                allDay: true,
            },
        });
        const now = nextMonday(8);
        const read = await today.read(shop.siteId, "visitor", now);
        expect(read.closedDates).toContain(now.toISOString().slice(0, 10));
        expect(read.items.some((i) => i.serviceId === svc.id)).toBe(false);
    });

    it("gives a shop-only business no panel", async () => {
        const shop = await business("Rye Bakery");
        await prisma.organizationModule.create({
            data: {
                organizationId: shop.organizationId,
                moduleKey: "APPOINTMENTS",
                status: "DISABLED",
            },
        });
        const read = await today.read(shop.siteId, "visitor", nextMonday(10));
        expect(read).toMatchObject({
            appointments: false,
            classes: false,
            items: [],
        });
        // The line still has the week to say whether the shop is open.
        expect(read.hours).toHaveLength(7);
    });

    it("answers 404 for a site that isn't there", async () => {
        await expect(
            today.read("site_nope", "visitor", nextMonday(10)),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("never shows another business's services", async () => {
        const other = await business("Other Studio");
        const read = await today.read(other.siteId, "visitor", nextMonday(10));
        expect(read.items).toEqual([]);
        expect(read.appointments).toBe(false);
    });

    it("limits each visitor", async () => {
        const strict = new PublicTodayService(new FixedWindowRateLimiter(1));
        await strict.read(studio.siteId, "one-visitor", nextMonday(8));
        await expect(
            strict.read(studio.siteId, "one-visitor", nextMonday(8)),
        ).rejects.toBeInstanceOf(HttpException);
    });
});
