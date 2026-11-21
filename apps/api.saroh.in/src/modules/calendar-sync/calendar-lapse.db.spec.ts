/**
 * When Google stops answering for a person (#1047, U7), against a real
 * Postgres with the in-memory Google: a refused token lapses the
 * connection and tells the person once, however many jobs meet it; a
 * reconnect clears it; while lapsed, slots go on Saroh's own times; and
 * the status reads behind when busy times are over two hours old. Runs in
 * the integration project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { setGoogleBusyGate } from "../bookings/google-busy-gate";
import {
    GOOGLE_BUSY_FRESH_MS,
    loadPeople,
} from "../bookings/staff-availability";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { googleBusyConnections } from "./calendar-allowed";
import { CalendarBusyHandler } from "./calendar-busy.handler";
import { CalendarConnectService } from "./calendar-connect.service";
import { CALENDAR_BUSY_TYPE } from "./calendar-jobs";
import {
    CALENDAR_LAPSED_NOTICE,
    CalendarLapseService,
} from "./calendar-lapse.service";
import { CalendarReleaseService } from "./calendar-release.service";
import { FakeGoogleCalendar } from "./google/fake-google-calendar";
import { SCOPES } from "./google/google-calendar.port";
import { sealToken, tokenColumns } from "./sealing";

const mutableEnv = env as {
    CALENDAR_ENC_KEY?: string;
    API_PUBLIC_URL?: string;
};
const before = { ...mutableEnv };

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
let google: FakeGoogleCalendar;
let lapses: CalendarLapseService;

beforeAll(async () => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.CALENDAR_ENC_KEY = randomBytes(32).toString("base64");
    mutableEnv.API_PUBLIC_URL = "https://api.example.com";
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
    Object.assign(mutableEnv, before);
    await prisma.$disconnect();
});
beforeEach(() => {
    google = new FakeGoogleCalendar();
    lapses = new CalendarLapseService();
});

async function connected() {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("gcal-lapse") },
    });
    const organizationId = org.id;
    await prisma.featureFlagOverride.create({
        data: { flagKey: "GOOGLE_CALENDAR", organizationId, enabled: true },
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
            googleEmail: "meera@example.com",
            scopes: Object.values(SCOPES),
            busyRefreshedAt: new Date(),
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
    await prisma.googleCalendarBusy.create({
        data: {
            organizationId,
            connectionId: row.id,
            staffId: staff.id,
            startAt: new Date(Date.now() + 86_400_000),
            endAt: new Date(Date.now() + 90_000_000),
        },
    });
    const ctx: OrganizationContext = {
        organizationId,
        userId: user.id,
        role: "MEMBER",
        edition: "INDIA",
    };
    return { ctx, connectionId: row.id, staffId: staff.id, userId: user.id };
}

const notices = (organizationId: string, userId: string) =>
    prisma.notification.count({
        where: { organizationId, userId, type: CALENDAR_LAPSED_NOTICE },
    });

const busyJob = (organizationId: string, connectionId: string): Job =>
    ({
        id: uniq("job"),
        organizationId,
        type: CALENDAR_BUSY_TYPE,
        payload: { connectionId },
    }) as unknown as Job;

describe("a lapsed Google Calendar", () => {
    it("tells the person once, not once per job", async () => {
        const c = await connected();
        const handler = new CalendarBusyHandler(
            google,
            flags as unknown as FeatureFlagService,
            lapses,
        );
        google.failNext("refresh", "lapsed", 3);
        await handler.handle(busyJob(c.ctx.organizationId, c.connectionId));
        await handler.handle(busyJob(c.ctx.organizationId, c.connectionId));
        await lapses.lapse(c.connectionId);

        expect(await notices(c.ctx.organizationId, c.userId)).toBe(1);
        const row = await prisma.googleCalendarConnection.findUniqueOrThrow({
            where: { id: c.connectionId },
        });
        expect(row.status).toBe("LAPSED");
        expect(row.lapsedAt).not.toBeNull();
    });

    it("goes on Saroh's own times while lapsed", async () => {
        const c = await connected();
        const read = () =>
            loadPeople(
                prisma,
                c.ctx.organizationId,
                [c.staffId],
                new Date(),
                new Date(Date.now() + 3 * 86_400_000),
            );
        expect((await read())[0].timeOff).toHaveLength(1);
        await lapses.lapse(c.connectionId);
        expect((await read())[0].timeOff).toHaveLength(0);
    });

    it("is cleared by connecting again, and can then tell again", async () => {
        const c = await connected();
        await lapses.lapse(c.connectionId);
        const service = new CalendarConnectService(
            google,
            flags as unknown as FeatureFlagService,
            lapses,
            new CalendarReleaseService(google),
        );
        await expect(
            service.connect(
                c.ctx,
                (
                    await prisma.googleCalendarConnection.findUniqueOrThrow({
                        where: { id: c.connectionId },
                    })
                ).membershipId,
                "code",
            ),
        ).resolves.toBe("connected");
        expect((await service.status(c.ctx)).state).toBe("CONNECTED");

        await lapses.lapse(c.connectionId);
        expect(await notices(c.ctx.organizationId, c.userId)).toBe(2);
    });

    it("reads behind once busy times are over two hours old", async () => {
        const c = await connected();
        const service = new CalendarConnectService(
            google,
            flags as unknown as FeatureFlagService,
            lapses,
            new CalendarReleaseService(google),
        );
        expect((await service.status(c.ctx)).accounts[0].behind).toBe(false);
        await prisma.googleCalendarConnection.update({
            where: { id: c.connectionId },
            data: {
                busyRefreshedAt: new Date(
                    Date.now() - GOOGLE_BUSY_FRESH_MS - 60_000,
                ),
            },
        });
        expect((await service.status(c.ctx)).accounts[0].behind).toBe(true);
    });
});
