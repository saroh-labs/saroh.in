/**
 * Connecting a person's own Google Calendar (#1047, U4) against a real
 * Postgres, with the in-memory Google: start and callback make a CONNECTED
 * row with its token sealed, the primary calendar chosen and the busy read
 * queued; the refusals (flag off, Free plan, Reviewer, nobody on the
 * diary, a second calendar, a bad state); partial grants; a reconnect
 * after a lapse; and disconnect. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { planMeter } from "../billing/metering.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { roleDenial } from "../organizations/organization-policy";
import { markLapsed } from "./calendar-access";
import { CalendarConnectService } from "./calendar-connect.service";
import { CALENDAR_BUSY_TYPE } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import { signState, verifyState } from "./connect-state";
import { FakeGoogleCalendar } from "./google/fake-google-calendar";
import { SCOPES } from "./google/google-calendar.port";
import { sealedToken } from "./sealing";

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
let service: CalendarConnectService;

beforeAll(() => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.CALENDAR_ENC_KEY = randomBytes(32).toString("base64");
    mutableEnv.API_PUBLIC_URL = "https://api.example.com";
});
afterAll(async () => {
    Object.assign(mutableEnv, before);
    await prisma.$disconnect();
});
beforeEach(() => {
    flags.isEnabled.mockResolvedValue(true);
    google = new FakeGoogleCalendar();
    service = new CalendarConnectService(
        google,
        flags as unknown as FeatureFlagService,
        new CalendarLapseService(),
    );
});

/** A business with one person who signs in and takes bookings. */
async function person(opts: { onDiary?: boolean; role?: string } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("gcal") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("meera")}@example.com`, name: "Meera" },
    });
    const membership = await prisma.membership.create({
        data: {
            organizationId: org.id,
            userId: user.id,
            role: opts.role ?? "MEMBER",
        },
    });
    if (opts.onDiary !== false) {
        await prisma.staffMember.create({
            data: {
                organizationId: org.id,
                membershipId: membership.id,
                name: "Meera",
            },
        });
    }
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: (opts.role ?? "MEMBER") as OrganizationContext["role"],
        edition: "INDIA",
    };
    return { ctx, membershipId: membership.id };
}

/** Start, then come back from Google with a code. */
async function connectFlow(ctx: OrganizationContext) {
    const { url } = await service.start(ctx);
    const state = new URL(url).searchParams.get("state") ?? "";
    return service.callback({ code: uniq("code"), state }, ctx.userId, () =>
        Promise.resolve(ctx),
    );
}

describe("connecting Google Calendar", () => {
    it("connects: sealed token, the primary calendar chosen, busy read queued", async () => {
        const { ctx, membershipId } = await person();
        const to = await connectFlow(ctx);
        expect(to).toMatch(/\/settings\/google-calendar\?calendar=connected$/);

        const row = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, membershipId },
            include: { calendars: true },
        });
        expect(row.status).toBe("CONNECTED");
        expect(row.googleEmail).toBe("meera@example.com");
        expect(sealedToken(row)).not.toBeNull();
        expect(row.tokenCiphertext).not.toContain("refresh-");
        expect(row.calendars).toEqual([
            expect.objectContaining({
                calendarId: "primary-cal",
                writeTo: true,
                checkBusy: true,
            }),
        ]);
        const jobs = await prisma.job.count({
            where: {
                type: CALENDAR_BUSY_TYPE,
                status: "PENDING",
                payload: { path: ["connectionId"], equals: row.id },
            },
        });
        expect(jobs).toBe(1);

        const status = await service.status(ctx);
        expect(status).toMatchObject({
            state: "CONNECTED",
            googleEmail: "meera@example.com",
            calendarsAllowed: 1,
        });
    });

    it("refuses with the flag off", async () => {
        const { ctx } = await person();
        flags.isEnabled.mockResolvedValue(false);
        await expect(service.start(ctx)).rejects.toMatchObject({ status: 404 });
    });

    it("refuses a plan without connected providers", async () => {
        const { ctx } = await person();
        const locked = new ForbiddenException({
            message: "Your plan doesn't include this.",
            details: { code: "MODULE_LOCKED" },
        });
        const spy = jest
            .spyOn(planMeter, "assertIncluded")
            .mockRejectedValueOnce(locked);
        await expect(service.start(ctx)).rejects.toBe(locked);
        expect(spy).toHaveBeenCalledWith(ctx.organizationId, "integrations");
        spy.mockRestore();
    });

    it("refuses a Reviewer by role", async () => {
        const { ctx } = await person({ role: "REVIEWER" });
        await expect(service.start(ctx)).rejects.toMatchObject({
            response: roleDenial("calendar:connect-own"),
        });
    });

    it("refuses someone who isn't on the diary", async () => {
        const { ctx } = await person({ onDiary: false });
        await expect(service.start(ctx)).rejects.toMatchObject({
            response: { details: { code: "NOT_ON_DIARY" } },
        });
    });

    it("refuses a state for someone else, an expired one and a tampered one", async () => {
        const { ctx, membershipId } = await person();
        const { ctx: other } = await person();
        const { url } = await service.start(ctx);
        const state = new URL(url).searchParams.get("state") ?? "";
        const resolve = () => Promise.resolve(ctx);

        await expect(
            service.callback({ code: "c", state }, other.userId, resolve),
        ).resolves.toMatch(/calendar=someone-else$/);
        const old = signState(
            {
                organizationId: ctx.organizationId,
                membershipId,
                userId: ctx.userId,
            },
            new Date(Date.now() - 11 * 60_000),
        );
        await expect(
            service.callback({ code: "c", state: old }, ctx.userId, resolve),
        ).resolves.toMatch(/calendar=expired$/);
        await expect(
            service.callback(
                { code: "c", state: `${state}x` },
                ctx.userId,
                resolve,
            ),
        ).resolves.toMatch(/calendar=invalid$/);
        expect(typeof verifyState(state)).toBe("object");
        expect(
            await prisma.googleCalendarConnection.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
    });

    it("saves what a partial grant allows, and says so", async () => {
        const { ctx, membershipId } = await person();
        google.grantScopes = [SCOPES.freeBusy, SCOPES.calendars];
        await expect(connectFlow(ctx)).resolves.toMatch(/calendar=partial$/);
        const row = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, membershipId },
            include: { calendars: true },
        });
        expect(row.calendars).toEqual([
            expect.objectContaining({ writeTo: false, checkBusy: true }),
        ]);
        const status = await service.status(ctx);
        expect(status.granted).toMatchObject({ events: false, freeBusy: true });
        await expect(
            service.choose(ctx, { writeTo: "primary-cal", checkBusy: [] }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("refuses a second calendar at the cap of one", async () => {
        const { ctx } = await person();
        await connectFlow(ctx);
        await expect(
            service.choose(ctx, {
                writeTo: "primary-cal",
                checkBusy: ["family-cal"],
            }),
        ).rejects.toMatchObject({ status: 400 });
        const status = await service.choose(ctx, {
            writeTo: "family-cal",
            checkBusy: ["family-cal"],
        });
        expect(status.calendars).toEqual([
            {
                id: "family-cal",
                name: "Family",
                writeTo: true,
                checkBusy: true,
            },
        ]);
    });

    it("reconnecting after a lapse reuses the row and keeps the choices", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        await service.choose(ctx, {
            writeTo: "family-cal",
            checkBusy: ["family-cal"],
        });
        const row = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, membershipId },
        });
        await markLapsed(row.id);
        expect((await service.status(ctx)).state).toBe("LAPSED");

        await connectFlow(ctx);
        const again = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, membershipId },
            include: { calendars: true },
        });
        expect(again.id).toBe(row.id);
        expect(again.status).toBe("CONNECTED");
        expect(again.lapsedAt).toBeNull();
        expect(again.calendars.map((c) => c.calendarId)).toEqual([
            "family-cal",
        ]);
    });

    it("disconnecting revokes, deletes the row and busy times, and leaves Google's events", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const row = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, membershipId },
        });
        const staff = await prisma.staffMember.findFirstOrThrow({
            where: { membershipId },
        });
        await prisma.googleCalendarBusy.create({
            data: {
                organizationId: ctx.organizationId,
                connectionId: row.id,
                staffId: staff.id,
                startAt: new Date(Date.now() + 3_600_000),
                endAt: new Date(Date.now() + 7_200_000),
            },
        });
        await google.putEvent("at", "primary-cal", {
            eventId: "keep",
            title: "A booking",
            description: "",
            startAt: new Date(),
            endAt: new Date(Date.now() + 1_800_000),
            timeZone: "Asia/Kolkata",
            bookingId: "bk",
        });

        await expect(service.disconnect(ctx)).resolves.toMatchObject({
            state: "NOT_CONNECTED",
        });
        expect(google.revoked).toHaveLength(1);
        expect(
            await prisma.googleCalendarConnection.count({
                where: { id: row.id },
            }),
        ).toBe(0);
        expect(
            await prisma.googleCalendarBusy.count({
                where: { connectionId: row.id },
            }),
        ).toBe(0);
        expect(google.liveEvents()).toHaveLength(1);
    });
});
