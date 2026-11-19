/**
 * The hourly calendar sweep (#1047, GC-14) and letting go of a removed
 * member's calendar (GC-09), against a real Postgres with the in-memory
 * Google: a connection whose busy reads stopped gets one again, a paused
 * one doesn't, a two-hour-old read tells the person once; and a member
 * removed from the team has their upcoming events taken off quietly and
 * their connection deleted. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import { prisma } from "@saroh/database";

import { env } from "../../env";
import { GOOGLE_BUSY_FRESH_MS } from "../bookings/staff-availability";
import { CALENDAR_BUSY_TYPE } from "./calendar-jobs";
import {
    CALENDAR_BEHIND_NOTICE,
    CalendarLapseService,
} from "./calendar-lapse.service";
import { CalendarReleaseService } from "./calendar-release.service";
import { CalendarSweepJob } from "./calendar-sweep.job";
import { eventIdFor } from "./event-shape";
import { FakeGoogleCalendar } from "./google/fake-google-calendar";
import { SCOPES } from "./google/google-calendar.port";
import { sealToken, tokenColumns } from "./sealing";

const mutableEnv = env as { CALENDAR_ENC_KEY?: string };
const before = mutableEnv.CALENDAR_ENC_KEY;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

beforeAll(async () => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.CALENDAR_ENC_KEY = randomBytes(32).toString("base64");
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

async function connected(
    opts: { flag?: boolean; refreshedAgoMs?: number } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("gcal-sweep") },
    });
    const organizationId = org.id;
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "GOOGLE_CALENDAR",
            organizationId,
            enabled: opts.flag !== false,
        },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("p")}@example.com`, name: "Meera" },
    });
    const membership = await prisma.membership.create({
        data: { organizationId, userId: user.id, role: "MEMBER" },
    });
    const staff = await prisma.staffMember.create({
        data: { organizationId, membershipId: membership.id, name: "Meera" },
    });
    const row = await prisma.googleCalendarConnection.create({
        data: {
            organizationId,
            membershipId: membership.id,
            googleEmail: `${uniq("meera")}@example.com`,
            scopes: Object.values(SCOPES),
            busyRefreshedAt: new Date(
                Date.now() - (opts.refreshedAgoMs ?? 60_000),
            ),
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
            name: "Meera",
            writeTo: true,
            checkBusy: true,
        },
    });
    return {
        organizationId,
        connectionId: row.id,
        membershipId: membership.id,
        staffId: staff.id,
        userId: user.id,
    };
}

const waiting = (connectionId: string) =>
    prisma.job.count({
        where: {
            type: CALENDAR_BUSY_TYPE,
            status: "PENDING",
            payload: { path: ["connectionId"], equals: connectionId },
        },
    });

describe("calendar.sweep", () => {
    it("restarts a stopped busy chain, and only one", async () => {
        const c = await connected();
        expect(await waiting(c.connectionId)).toBe(0);
        const sweep = new CalendarSweepJob();
        await sweep.sweep(new Date());
        await sweep.sweep(new Date());
        expect(await waiting(c.connectionId)).toBe(1);
    });

    it("leaves a paused connection alone", async () => {
        const c = await connected({ flag: false });
        await new CalendarSweepJob().sweep(new Date());
        expect(await waiting(c.connectionId)).toBe(0);
    });

    it("tells the person once that their busy times are behind", async () => {
        const c = await connected({
            refreshedAgoMs: GOOGLE_BUSY_FRESH_MS + 60_000,
        });
        const sweep = new CalendarSweepJob();
        await sweep.sweep(new Date());
        await sweep.sweep(new Date());
        const notices = await prisma.notification.findMany({
            where: {
                organizationId: c.organizationId,
                userId: c.userId,
                type: CALENDAR_BEHIND_NOTICE,
            },
        });
        expect(notices).toHaveLength(1);
        expect(notices[0].staffId).toBe(c.staffId);
    });

    it("keeps one waiting run of itself", async () => {
        const sweep = new CalendarSweepJob();
        await sweep.ensureScheduled();
        await sweep.ensureScheduled();
        expect(
            await prisma.job.count({
                where: { type: "calendar.sweep", status: "PENDING" },
            }),
        ).toBe(1);
    });
});

describe("releasing a removed member's calendar (GC-09)", () => {
    it("takes their upcoming events off quietly, then deletes the connection", async () => {
        const c = await connected();
        const google = new FakeGoogleCalendar();
        const svc = await prisma.service.create({
            data: {
                organizationId: c.organizationId,
                name: "Consultation",
                durationMinutes: 30,
                timezone: "UTC",
            },
        });
        const startAt = new Date(Date.now() + 86_400_000);
        const booking = await prisma.booking.create({
            data: {
                organizationId: c.organizationId,
                serviceId: svc.id,
                staffId: c.staffId,
                startAt,
                endAt: new Date(startAt.getTime() + 1_800_000),
                timezone: "UTC",
                snapshot: {},
            },
        });
        const eventId = eventIdFor(booking.id, c.connectionId);
        await google.putEvent("at", "primary-cal", {
            eventId,
            title: "Consultation",
            description: "",
            startAt,
            endAt: booking.endAt,
            timeZone: "UTC",
            bookingId: booking.id,
        });
        await prisma.googleCalendarEvent.create({
            data: {
                organizationId: c.organizationId,
                bookingId: booking.id,
                connectionId: c.connectionId,
                calendarId: "primary-cal",
                eventId,
            },
        });

        await new CalendarReleaseService(
            google,
            new CalendarLapseService(),
        ).releaseMember(c.organizationId, c.membershipId);

        expect(google.events.get("primary-cal")?.get(eventId)).toMatchObject({
            status: "cancelled",
            quiet: true,
        });
        expect(google.revoked).toHaveLength(1);
        expect(
            await prisma.googleCalendarConnection.count({
                where: { id: c.connectionId },
            }),
        ).toBe(0);
    });
});
