/**
 * Google busy times (#1047, U6) against a real Postgres, with the
 * in-memory Google: a read keeps the blocks and a later one replaces
 * them; Google's error keeps the old ones until they're stale; one
 * waiting run per connection; and slots read only fresh blocks. Saroh's
 * own events don't block (GC-01), a calendar not theirs is read with
 * free/busy, a paused connection stops (GC-02, GC-03), and a key that
 * can't open the token keeps the chain going (GC-16). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import { setGoogleBusyGate } from "../bookings/google-busy-gate";
import {
    GOOGLE_BUSY_FRESH_MS,
    loadPeople,
} from "../bookings/staff-availability";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { calendarPlan, googleBusyConnections } from "./calendar-allowed";
import { CalendarBusyHandler } from "./calendar-busy.handler";
import { CALENDAR_BUSY_TYPE, scheduleBusy } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import { CalendarSyncHandler } from "./calendar-sync.handler";
import { FakeGoogleCalendar } from "./google/fake-google-calendar";
import { SCOPES } from "./google/google-calendar.port";
import { sealToken, tokenColumns } from "./sealing";

const mutableEnv = env as { CALENDAR_ENC_KEY?: string };
const before = mutableEnv.CALENDAR_ENC_KEY;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
let google: FakeGoogleCalendar;
let handler: CalendarBusyHandler;

beforeAll(async () => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.CALENDAR_ENC_KEY = randomBytes(32).toString("base64");
    // Slot reads ask whether Google busy times count (GC-02), as the
    // module registers at boot; the flag is on per business.
    setGoogleBusyGate(googleBusyConnections);
    await prisma.featureFlag.upsert({
        where: { key: "GOOGLE_CALENDAR" },
        create: { key: "GOOGLE_CALENDAR", enabledByDefault: false },
        update: {},
    });
});
afterAll(async () => {
    mutableEnv.CALENDAR_ENC_KEY = before;
    await prisma.$disconnect();
});
beforeEach(() => {
    google = new FakeGoogleCalendar();
    handler = new CalendarBusyHandler(
        google,
        flags as unknown as FeatureFlagService,
        new CalendarLapseService(),
    );
});

async function connected() {
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: uniq("gcal-busy") },
    });
    const organizationId = org.id;
    await prisma.featureFlagOverride.create({
        data: { flagKey: "GOOGLE_CALENDAR", organizationId, enabled: true },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("p")}@example.com`, name: "Kabir" },
    });
    const membership = await prisma.membership.create({
        data: { organizationId, userId: user.id, role: "MEMBER" },
    });
    const staff = await prisma.staffMember.create({
        data: { organizationId, membershipId: membership.id, name: "Kabir" },
    });
    const row = await prisma.googleCalendarConnection.create({
        data: {
            organizationId,
            membershipId: membership.id,
            googleEmail: "kabir@example.com",
            scopes: Object.values(SCOPES),
        },
    });
    await prisma.googleCalendarConnection.update({
        where: { id: row.id },
        data: tokenColumns(
            sealToken("refresh-token", {
                organizationId,
                connectionId: row.id,
            }),
        ),
    });
    await prisma.googleCalendarLink.create({
        data: {
            organizationId,
            connectionId: row.id,
            calendarId: "primary-cal",
            name: "Kabir",
            writeTo: true,
            checkBusy: true,
        },
    });
    return {
        organizationId,
        connectionId: row.id,
        staffId: staff.id,
        membershipId: membership.id,
    };
}

const hours = (h: number) => new Date(Date.now() + h * 3_600_000);
const job = (organizationId: string, connectionId: string): Job =>
    ({
        id: uniq("job"),
        organizationId,
        type: CALENDAR_BUSY_TYPE,
        payload: { connectionId },
    }) as unknown as Job;

describe("calendar.busy", () => {
    it("keeps the busy times, then replaces them on the next read", async () => {
        const c = await connected();
        google.busy.set("primary-cal", [
            { startAt: hours(24), endAt: hours(25) },
            { startAt: hours(48), endAt: hours(49) },
        ]);
        await handler.handle(job(c.organizationId, c.connectionId));
        expect(
            await prisma.googleCalendarBusy.count({
                where: { connectionId: c.connectionId },
            }),
        ).toBe(2);

        google.busy.set("primary-cal", [
            { startAt: hours(30), endAt: hours(31) },
        ]);
        await handler.handle(job(c.organizationId, c.connectionId));
        const rows = await prisma.googleCalendarBusy.findMany({
            where: { connectionId: c.connectionId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].staffId).toBe(c.staffId);
        const row = await prisma.googleCalendarConnection.findUniqueOrThrow({
            where: { id: c.connectionId },
        });
        expect(row.busyRefreshedAt).not.toBeNull();
    });

    it("keeps one waiting run per connection, however often it is asked", async () => {
        const c = await connected();
        await handler.handle(job(c.organizationId, c.connectionId));
        await scheduleBusy(c.organizationId, c.connectionId, new Date());
        await scheduleBusy(c.organizationId, c.connectionId, new Date());
        expect(
            await prisma.job.count({
                where: {
                    type: CALENDAR_BUSY_TYPE,
                    status: "PENDING",
                    payload: { path: ["connectionId"], equals: c.connectionId },
                },
            }),
        ).toBe(1);
    });

    it("keeps the old blocks when Google fails, and slots ignore them once stale", async () => {
        const c = await connected();
        google.busy.set("primary-cal", [
            { startAt: hours(24), endAt: hours(25) },
        ]);
        await handler.handle(job(c.organizationId, c.connectionId));
        google.failNext("busyEvents", "retry");
        await handler.handle(job(c.organizationId, c.connectionId));
        expect(
            await prisma.googleCalendarBusy.count({
                where: { connectionId: c.connectionId },
            }),
        ).toBe(1);

        const read = () =>
            loadPeople(
                prisma,
                c.organizationId,
                [c.staffId],
                hours(0),
                hours(72),
            );
        expect((await read())[0].timeOff).toHaveLength(1);

        await prisma.googleCalendarConnection.update({
            where: { id: c.connectionId },
            data: {
                busyRefreshedAt: new Date(
                    Date.now() - GOOGLE_BUSY_FRESH_MS - 60_000,
                ),
            },
        });
        expect((await read())[0].timeOff).toHaveLength(0);
    });

    it("ends the chain for a disconnected connection", async () => {
        const c = await connected();
        await prisma.googleCalendarConnection.delete({
            where: { id: c.connectionId },
        });
        await handler.handle(job(c.organizationId, c.connectionId));
        expect(
            await prisma.job.count({
                where: {
                    type: CALENDAR_BUSY_TYPE,
                    payload: { path: ["connectionId"], equals: c.connectionId },
                },
            }),
        ).toBe(0);
    });

    it("leaves out the person's own Saroh bookings, so one can move by less than its length (GC-01)", async () => {
        const c = await connected();
        const service = await prisma.service.create({
            data: {
                organizationId: c.organizationId,
                name: "Session",
                durationMinutes: 60,
                timezone: "UTC",
            },
        });
        const startAt = hours(24);
        const booking = await prisma.booking.create({
            data: {
                organizationId: c.organizationId,
                serviceId: service.id,
                staffId: c.staffId,
                startAt,
                endAt: hours(25),
                timezone: "UTC",
                snapshot: {},
                bookerName: "Asha",
                bookerEmail: "asha@example.com",
            },
        });
        // Saroh puts it on their calendar; they have one meeting of their own.
        await new CalendarSyncHandler(
            google,
            flags as unknown as FeatureFlagService,
            new CalendarLapseService(),
        ).sync(c.organizationId, {
            bookingId: booking.id,
            meetTries: 0,
            quiet: false,
        });
        expect(google.liveEvents()).toHaveLength(1);
        google.busy.set("primary-cal", [
            { startAt: hours(48), endAt: hours(49) },
        ]);

        await handler.handle(job(c.organizationId, c.connectionId));

        const rows = await prisma.googleCalendarBusy.findMany({
            where: { connectionId: c.connectionId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].startAt.getTime()).toBeGreaterThan(hours(47).getTime());
        // Moving it by half an hour: the slot engine sees only the booking.
        const people = await loadPeople(
            prisma,
            c.organizationId,
            [c.staffId],
            hours(0),
            hours(72),
            booking.id,
        );
        expect(
            people[0].timeOff.some(
                (t) => t.startAt.getTime() === startAt.getTime(),
            ),
        ).toBe(false);
    });

    it("reads a calendar that isn't theirs with free/busy instead", async () => {
        const c = await connected();
        google.notOwned.add("primary-cal");
        google.busy.set("primary-cal", [
            { startAt: hours(24), endAt: hours(25) },
        ]);
        await handler.handle(job(c.organizationId, c.connectionId));
        expect(google.calls).toEqual(
            expect.arrayContaining(["busyEvents", "freeBusy"]),
        );
        expect(
            await prisma.googleCalendarBusy.count({
                where: { connectionId: c.connectionId },
            }),
        ).toBe(1);
    });

    it("pauses on a Free plan: busy times go, the chain ends, slots ignore it (GC-02)", async () => {
        const c = await connected();
        google.busy.set("primary-cal", [
            { startAt: hours(24), endAt: hours(25) },
        ]);
        await handler.handle(job(c.organizationId, c.connectionId));
        const read = () =>
            loadPeople(
                prisma,
                c.organizationId,
                [c.staffId],
                hours(0),
                hours(72),
            );
        expect((await read())[0].timeOff).toHaveLength(1);

        const spy = jest
            .spyOn(calendarPlan, "locked")
            .mockResolvedValue("unread");
        try {
            // Slots stop counting it at once, before any job runs.
            expect((await read())[0].timeOff).toHaveLength(0);
            await prisma.job.deleteMany({
                where: {
                    type: CALENDAR_BUSY_TYPE,
                    payload: { path: ["connectionId"], equals: c.connectionId },
                },
            });
            google.calls.length = 0;
            await handler.handle(job(c.organizationId, c.connectionId));
            expect(google.calls).toHaveLength(0);
            expect(
                await prisma.googleCalendarBusy.count({
                    where: { connectionId: c.connectionId },
                }),
            ).toBe(0);
            expect(
                await prisma.job.count({
                    where: {
                        type: CALENDAR_BUSY_TYPE,
                        status: "PENDING",
                        payload: {
                            path: ["connectionId"],
                            equals: c.connectionId,
                        },
                    },
                }),
            ).toBe(0);
        } finally {
            spy.mockRestore();
        }
    });

    it("leaves out an account past the plan's allowance at once, not at its next read (P4)", async () => {
        const c = await connected();
        const theirs = { startAt: hours(24), endAt: hours(25) };
        google.busy.set("primary-cal", [theirs]);
        await handler.handle(job(c.organizationId, c.connectionId));
        // A second account, as before a downgrade to one a person, with
        // its own fresh busy time still stored.
        const extra = await prisma.googleCalendarConnection.create({
            data: {
                organizationId: c.organizationId,
                membershipId: c.membershipId,
                googleEmail: "kabir.work@example.com",
                scopes: Object.values(SCOPES),
                busyRefreshedAt: new Date(),
            },
        });
        await prisma.googleCalendarBusy.create({
            data: {
                organizationId: c.organizationId,
                connectionId: extra.id,
                staffId: c.staffId,
                startAt: hours(30),
                endAt: hours(31),
            },
        });
        await expect(googleBusyConnections(c.organizationId)).resolves.toEqual(
            new Set([c.connectionId]),
        );
        const [p] = await loadPeople(
            prisma,
            c.organizationId,
            [c.staffId],
            hours(0),
            hours(72),
        );
        expect(p.timeOff).toEqual([theirs]);
    });

    it("pauses for someone who lost the permission (GC-03)", async () => {
        const c = await connected();
        await prisma.membership.update({
            where: { id: c.membershipId },
            data: { role: "REVIEWER" },
        });
        await handler.handle(job(c.organizationId, c.connectionId));
        expect(google.calls).toHaveLength(0);
    });

    it("keeps going when the stored token can't be opened, and says why (GC-16)", async () => {
        const c = await connected();
        const key = mutableEnv.CALENDAR_ENC_KEY;
        mutableEnv.CALENDAR_ENC_KEY = randomBytes(32).toString("base64");
        try {
            await expect(
                handler.handle(job(c.organizationId, c.connectionId)),
            ).resolves.toBeUndefined();
        } finally {
            mutableEnv.CALENDAR_ENC_KEY = key;
        }
        const row = await prisma.googleCalendarConnection.findUniqueOrThrow({
            where: { id: c.connectionId },
        });
        expect(row.status).toBe("CONNECTED");
        expect(row.lastError).toMatch(/can't be opened/);
        expect(
            await prisma.job.count({
                where: {
                    type: CALENDAR_BUSY_TYPE,
                    status: "PENDING",
                    payload: { path: ["connectionId"], equals: c.connectionId },
                },
            }),
        ).toBe(1);
    });

    it("brings a waiting run forward when asked for an earlier one (GC-13)", async () => {
        const c = await connected();
        await scheduleBusy(c.organizationId, c.connectionId, hours(0.15));
        const now = new Date();
        await scheduleBusy(c.organizationId, c.connectionId, now);
        const waiting = await prisma.job.findMany({
            where: {
                type: CALENDAR_BUSY_TYPE,
                status: "PENDING",
                payload: { path: ["connectionId"], equals: c.connectionId },
            },
        });
        expect(waiting).toHaveLength(1);
        expect(waiting[0].runAt.getTime()).toBeLessThanOrEqual(
            now.getTime() + 1000,
        );
    });
});
