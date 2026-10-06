/**
 * The Timetable block's read against a real Postgres (industry templates
 * U2): the week's class sessions are the booking page's own, one-to-one
 * services are left out, a named class narrows the list, and the read is
 * one site's business only.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { HttpException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { publicDays } from "./public-booking-page";
import { PublicTimetableService, TIMETABLE_DAYS } from "./public-timetable";
import { FixedWindowRateLimiter } from "./rate-limiter";

// Generous: these tests read many times from one "visitor".
const timetable = new PublicTimetableService(new FixedWindowRateLimiter(1_000));

const MONDAY = 1;
const WEDNESDAY = 3;

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

/** The next Monday at `hour` UTC (the businesses here keep UTC). */
function nextMonday(hour: number): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead);
    d.setUTCHours(hour);
    return d;
}

async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("u2-org") },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name, slug: uniq("u2-site") },
    });
    return { organizationId: org.id, siteId: site.id };
}

async function classOn(
    organizationId: string,
    name: string,
    dayOfWeek: number,
    hour: number,
    capacity = 8,
) {
    return (
        await prisma.service.create({
            data: {
                organizationId,
                name,
                durationMinutes: 60,
                capacity,
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId,
                        dayOfWeek,
                        startMinute: hour * 60,
                        endMinute: (hour + 1) * 60,
                    },
                },
            },
        })
    ).id;
}

let gym: { organizationId: string; siteId: string };
let strength: string;
let yoga: string;
let pt: string;

beforeAll(async () => {
    gym = await business("Iron Room");
    strength = await classOn(gym.organizationId, "Strength", MONDAY, 7);
    yoga = await classOn(gym.organizationId, "Yoga", WEDNESDAY, 18);
    // A one-to-one: never on a timetable.
    pt = await classOn(gym.organizationId, "Personal training", MONDAY, 9, 1);
});

describe("Timetable (real database)", () => {
    it("lists the week's classes, soonest first, and no one-to-ones", async () => {
        const now = nextMonday(5);
        const read = await timetable.read(gym.siteId, [], "visitor", now);

        expect(read.timezone).toBe("UTC");
        expect(read.days).toHaveLength(TIMETABLE_DAYS);
        expect(read.days[0]).toBe(now.toISOString().slice(0, 10));
        const names = read.sessions.map((s) => s.serviceName);
        expect(names).toEqual(["Strength", "Yoga"]);
        expect(read.sessions[0]).toMatchObject({
            serviceId: strength,
            time: "07:00",
            placesLeft: 8,
            capacity: 8,
        });
        expect(read.sessions.some((s) => s.serviceId === pt)).toBe(false);
        const starts = read.sessions.map((s) => s.startAt);
        expect([...starts].sort()).toEqual(starts);
        expect(JSON.stringify(read)).not.toMatch(/organizationId|staffId/);
    });

    it("lists only sessions the booking page itself offers", async () => {
        const now = nextMonday(5);
        const read = await timetable.read(gym.siteId, [], "visitor", now);
        const page = await publicDays(yoga, now, TIMETABLE_DAYS);
        const offered = new Set(
            page.days.flatMap((d) => d.starts.map((s) => s.startAt)),
        );
        const yogaRows = read.sessions.filter((s) => s.serviceId === yoga);
        expect(yogaRows.length).toBeGreaterThan(0);
        expect(yogaRows.every((s) => offered.has(s.startAt))).toBe(true);
    });

    it("narrows to the classes named, ignoring a one-to-one named", async () => {
        const read = await timetable.read(
            gym.siteId,
            [yoga, pt],
            "visitor",
            nextMonday(5),
        );
        expect(read.sessions.map((s) => s.serviceId)).toEqual([yoga]);
    });

    it("never shows another business's class, even by its id", async () => {
        const other = await business("Other Gym");
        const read = await timetable.read(
            other.siteId,
            [strength],
            "visitor",
            nextMonday(5),
        );
        expect(read.sessions).toEqual([]);
    });

    it("is empty while Appointments is off", async () => {
        const shop = await business("Off Gym");
        await classOn(shop.organizationId, "Spin", MONDAY, 7);
        await prisma.organizationModule.create({
            data: {
                organizationId: shop.organizationId,
                moduleKey: "APPOINTMENTS",
                status: "DISABLED",
            },
        });
        const read = await timetable.read(
            shop.siteId,
            [],
            "visitor",
            nextMonday(5),
        );
        expect(read.sessions).toEqual([]);
    });

    it("answers 404 for a site that isn't there", async () => {
        await expect(
            timetable.read("site_nope", [], "visitor", nextMonday(5)),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("limits each visitor", async () => {
        const strict = new PublicTimetableService(
            new FixedWindowRateLimiter(1),
        );
        await strict.read(gym.siteId, [], "one-visitor", nextMonday(5));
        await expect(
            strict.read(gym.siteId, [], "one-visitor", nextMonday(5)),
        ).rejects.toBeInstanceOf(HttpException);
    });
});
