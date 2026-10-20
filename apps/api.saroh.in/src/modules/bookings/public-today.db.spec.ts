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

    it("names the next free start today: Hatha's 11:00 is after Karan's 10:00", async () => {
        const read = await today.read(
            studio.siteId,
            "visitor",
            nextMonday(9, 10),
        );
        expect(read.nextFree).not.toBeNull();
        expect(read.nextFree!.startAt > nextMonday(9, 10).toISOString()).toBe(
            true,
        );
        // Soonest of everything the panel could list.
        const soonest = [...read.items]
            .filter((i) => i.kind === "one" || (i.placesLeft ?? 0) > 0)
            .map((i) => i.startAt)
            .sort()[0];
        expect(read.nextFree!.startAt).toBe(soonest);
    });

    it("looks past today when nothing is left: next Monday's first time (U8)", async () => {
        // After closing on Monday: nothing today, so the next free is a
        // later day's, within the booking page's window.
        const now = nextMonday(20);
        const read = await today.read(studio.siteId, "visitor", now);
        expect(read.items).toEqual([]);
        expect(read.nextFree).not.toBeNull();
        const at = new Date(read.nextFree!.startAt);
        expect(at > now).toBe(true);
        expect(at.getUTCDay()).toBe(MONDAY);
        expect(read.nextFree!.date).toBe(at.toISOString().slice(0, 10));
        // Only what the booking page offers for that service.
        const page = await publicDays(read.nextFree!.serviceId, now);
        const offered = page.days.flatMap((d) =>
            d.starts.map((s) => s.startAt),
        );
        expect(offered).toContain(read.nextFree!.startAt);
    });

    it("never names a full class as next free", async () => {
        const gym = await business("Full Class Gym");
        const svc = await prisma.service.create({
            data: {
                organizationId: gym.organizationId,
                name: "Spin",
                durationMinutes: 60,
                capacity: 2,
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: gym.organizationId,
                        dayOfWeek: MONDAY,
                        startMinute: 11 * 60,
                        endMinute: 12 * 60,
                    },
                },
            },
        });
        const now = nextMonday(10);
        const before = await today.read(gym.siteId, "visitor", now);
        const first = before.nextFree;
        expect(first?.serviceId).toBe(svc.id);
        // Fill that session.
        for (let i = 0; i < 2; i++) {
            await prisma.booking.create({
                data: {
                    organizationId: gym.organizationId,
                    serviceId: svc.id,
                    startAt: new Date(first!.startAt),
                    endAt: new Date(
                        new Date(first!.startAt).getTime() + 60 * 60_000,
                    ),
                    timezone: "UTC",
                    status: "CONFIRMED",
                    bookerName: `Asha ${i}`,
                    bookerEmail: `asha${i}@example.com`,
                    snapshot: {},
                },
            });
        }
        const after = await today.read(gym.siteId, "visitor", now);
        expect(after.nextFree?.startAt).not.toBe(first!.startAt);
    });

    it("leaves out a service the booking page doesn't show, and another business's", async () => {
        const quiet = await business("Hidden Service Studio");
        await prisma.service.create({
            data: {
                organizationId: quiet.organizationId,
                name: "Private",
                durationMinutes: 60,
                capacity: 3,
                timezone: "UTC",
                showOnBookingPage: false,
                availabilityRules: {
                    create: {
                        organizationId: quiet.organizationId,
                        dayOfWeek: MONDAY,
                        startMinute: 11 * 60,
                        endMinute: 12 * 60,
                    },
                },
            },
        });
        const read = await today.read(quiet.siteId, "visitor", nextMonday(10));
        expect(read.nextFree).toBeNull();
        // Pulse's services exist and are free, but never reach this site.
        expect(JSON.stringify(read)).not.toContain(hatha);
        expect(JSON.stringify(read)).not.toContain(training);
    });

    it("leaves out a service kept for another site of the same business", async () => {
        const second = await prisma.site.create({
            data: {
                organizationId: studio.organizationId,
                name: "Pulse Two",
                slug: uniq("g18-site"),
            },
        });
        const only = await prisma.service.create({
            data: {
                organizationId: studio.organizationId,
                siteId: second.id,
                name: "Second-site class",
                durationMinutes: 30,
                capacity: 4,
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: studio.organizationId,
                        dayOfWeek: MONDAY,
                        startMinute: 9 * 60 + 30,
                        endMinute: 10 * 60,
                    },
                },
            },
        });
        const read = await today.read(studio.siteId, "visitor", nextMonday(9));
        expect(JSON.stringify(read)).not.toContain(only.id);
    });

    it("limits each visitor", async () => {
        const strict = new PublicTodayService(new FixedWindowRateLimiter(1));
        await strict.read(studio.siteId, "one-visitor", nextMonday(8));
        await expect(
            strict.read(studio.siteId, "one-visitor", nextMonday(8)),
        ).rejects.toBeInstanceOf(HttpException);
    });
});
