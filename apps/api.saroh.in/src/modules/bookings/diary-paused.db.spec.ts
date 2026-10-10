/**
 * Diary people with no login past the team limit after a move to a lower
 * plan (#800), against a real Postgres: they aren't offered on the booking
 * page, the slot engine gives no start with them, booking them is refused,
 * and a service only they take offers nothing. A booking already made with
 * them is kept as it was.
 *
 * What is paused is decided in `billing/over-limit*.ts` and unit-tested
 * there; here `overLimit.pausedNow` is stubbed with a real staff id.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
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

import type { PausedNow } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";

const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);

const MONDAY = 1;
const tag = `${process.pid}-${Date.now()}`;

/** The Monday `weeksOut` weeks ahead, at `hour` UTC. */
function monday(hour: number, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour);
    return d;
}

let org: string;
let both: string;
let onlyRavi: string;
let asha: string;
let ravi: string;
let kept: string;

function paused(): PausedNow {
    return {
        organizationId: org,
        since: new Date(),
        memberIds: new Set(),
        invitationIds: new Set(),
        diaryIds: new Set([ravi]),
        products: null,
        posts: null,
        storeIds: new Set(),
        siteIds: new Set(),
    };
}

async function person(name: string, serviceIds: string[]): Promise<string> {
    const made = await prisma.staffMember.create({
        data: {
            organizationId: org,
            name,
            services: {
                create: serviceIds.map((serviceId) => ({
                    organizationId: org,
                    serviceId,
                })),
            },
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
    return made.id;
}

beforeAll(async () => {
    const o = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `p800-diary-${tag}` },
    });
    org = o.id;
    await prisma.businessProfile.create({
        data: { organizationId: org, timezone: "UTC" },
    });
    const service = (name: string) =>
        prisma.service.create({
            data: {
                organizationId: org,
                name,
                durationMinutes: 60,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                timezone: "UTC",
            },
        });
    both = (await service("Check-up")).id;
    onlyRavi = (await service("Ravi's clean")).id;
    asha = await person("Asha Iyer", [both]);
    ravi = await person("Ravi Kumar", [both, onlyRavi]);
    // Booked with Ravi before the pause: it stays.
    kept = (
        await prisma.booking.create({
            data: {
                organizationId: org,
                serviceId: both,
                staffId: ravi,
                startAt: monday(9, 2),
                endAt: monday(10, 2),
                status: "CONFIRMED",
                bookerName: "Meena Rao",
                bookerEmail: `meena-${tag}@example.com`,
                timezone: "UTC",
                snapshot: { priceCents: 0, currency: "INR" },
            },
        })
    ).id;
});

beforeEach(() => {
    jest.spyOn(overLimit, "pausedNow").mockResolvedValue(paused());
});

afterEach(() => jest.restoreAllMocks());

describe("a paused diary person on the booking page (#800, real database)", () => {
    it("isn't offered as someone to book with", async () => {
        const people = await publicBookings.publicServiceStaff(both);
        expect(people.map((p) => p.id)).toEqual([asha]);
    });

    it("gets no start in the next two weeks; the others still do", async () => {
        const days = await publicBookings.publicDays(both, monday(0));
        const starts = days.days.flatMap((d) => d.starts);
        expect(starts.length).toBeGreaterThan(0);
        expect(starts.every((s) => s.staffId === asha)).toBe(true);
    });

    it("refuses a booking with them by name, in words that name no plan", async () => {
        const err = await publicBookings
            .bookOnline(
                both,
                {
                    startAt: monday(11).toISOString(),
                    bookerName: "Ravi's fan",
                    bookerEmail: `fan-${tag}@example.com`,
                    idempotencyKey: `p800-${tag}`,
                    pay: "DESK",
                    staffId: ravi,
                },
                "ip_1",
            )
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(
            JSON.stringify((err as BadRequestException).getResponse()),
        ).not.toMatch(/plan/i);
    });

    it("leaves a service only they take with nothing to book", async () => {
        const days = await publicBookings.publicDays(onlyRavi, monday(0));
        expect(days.days.flatMap((d) => d.starts)).toEqual([]);
    });

    it("keeps the booking already made with them", async () => {
        const row = await prisma.booking.findUnique({ where: { id: kept } });
        expect(row).toMatchObject({ staffId: ravi, status: "CONFIRMED" });
    });

    it("offers them again the moment nothing is paused", async () => {
        jest.spyOn(overLimit, "pausedNow").mockResolvedValue(null);
        const people = await publicBookings.publicServiceStaff(both);
        expect(people.map((p) => p.id).sort()).toEqual([asha, ravi].sort());
    });
});

describe("asking for one person, and for later dates, on the booking page (real database)", () => {
    beforeEach(() => {
        jest.spyOn(overLimit, "pausedNow").mockResolvedValue(null);
    });

    it("names who takes a one-to-one, by name and id alone", async () => {
        const days = await publicBookings.publicDays(both, monday(0));
        expect(
            [...days.staff].sort((a, b) => a.name.localeCompare(b.name)),
        ).toEqual([
            { id: asha, name: "Asha Iyer" },
            { id: ravi, name: "Ravi Kumar" },
        ]);
    });

    it("keeps to the person asked for; anyone else's id is whoever is free", async () => {
        const withRavi = await publicBookings.publicDays(both, monday(0), {
            staffId: ravi,
        });
        const starts = withRavi.days.flatMap((d) => d.starts);
        expect(starts.length).toBeGreaterThan(0);
        expect(starts.every((s) => s.staffId === ravi)).toBe(true);
        // Ravi is booked 09:00 two Mondays out: not offered with him then.
        expect(starts.map((s) => s.startAt)).not.toContain(
            monday(9, 2).toISOString(),
        );

        const anyone = await publicBookings.publicDays(both, monday(0));
        const stranger = await publicBookings.publicDays(both, monday(0), {
            staffId: "someone_elses_id",
        });
        expect(stranger.days).toEqual(anyone.days);
        // With anyone, Asha takes the hour Ravi is booked.
        expect(
            anyone.days
                .flatMap((d) => d.starts)
                .find((s) => s.startAt === monday(9, 2).toISOString()),
        ).toMatchObject({ staffId: asha });
    });

    it("reads the two weeks after, and never past twelve weeks", async () => {
        const now = monday(0);
        const next = await publicBookings.publicDays(both, now, { skip: 14 });
        expect(next.days).toHaveLength(14);
        expect(next.days[0]!.date).toBe(
            monday(0, 3).toISOString().slice(0, 10),
        );
        const far = await publicBookings.publicDays(both, now, { skip: 500 });
        expect(far.days[0]!.date).toBe(
            monday(0, 11).toISOString().slice(0, 10),
        );
    });
});
