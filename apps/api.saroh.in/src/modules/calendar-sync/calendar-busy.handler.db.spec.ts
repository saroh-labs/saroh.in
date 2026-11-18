/**
 * Google busy times (#1047, U6) against a real Postgres, with the
 * in-memory Google: a read keeps the blocks and a later one replaces
 * them; Google's error keeps the old ones until they're stale; one
 * waiting run per connection; and slots read only fresh blocks. Runs in
 * the integration project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import {
    GOOGLE_BUSY_FRESH_MS,
    loadPeople,
} from "../bookings/staff-availability";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { CalendarBusyHandler } from "./calendar-busy.handler";
import { CALENDAR_BUSY_TYPE, scheduleBusy } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
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

beforeAll(() => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.CALENDAR_ENC_KEY = randomBytes(32).toString("base64");
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
    return { organizationId, connectionId: row.id, staffId: staff.id };
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
        google.failNext("freeBusy", "retry");
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
});
