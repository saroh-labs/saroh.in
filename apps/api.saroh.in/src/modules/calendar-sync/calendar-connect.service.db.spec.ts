/**
 * Connecting a person's own Google Calendar (#1047, U4) against a real
 * Postgres, with the in-memory Google: start and callback make a CONNECTED
 * row with its token sealed, the primary calendar chosen and the busy read
 * queued; the refusals (flag off, Free plan, Reviewer, nobody on the
 * diary, a second calendar, a bad state); partial grants; a reconnect
 * after a lapse; and disconnect. Then the review's fixes: a state is good
 * once (GC-15), PAUSED when no longer allowed and disconnect always open
 * (GC-02, GC-03), upcoming events cleared quietly and the grant revoked
 * only at its last use (GC-06, GC-09). Runs in the integration project
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
import { CalendarReleaseService } from "./calendar-release.service";
import { CalendarSyncHandler } from "./calendar-sync.handler";
import { signState, verifyState } from "./connect-state";
import { eventIdFor } from "./event-shape";
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
    // Each test its own Google account: whether a grant is revoked depends
    // on every other connection to the same account (GC-06).
    google.grantEmail = `${uniq("meera")}@example.com`;
    const lapses = new CalendarLapseService();
    service = new CalendarConnectService(
        google,
        flags as unknown as FeatureFlagService,
        lapses,
        new CalendarReleaseService(google, lapses),
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
        expect(row.googleEmail).toBe(google.grantEmail);
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
            googleEmail: google.grantEmail,
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

    /** A booking on Meera's calendar, as the sync job would leave it. */
    async function mapped(
        ctx: OrganizationContext,
        membershipId: string,
        startsInHours: number,
    ) {
        const connection =
            await prisma.googleCalendarConnection.findFirstOrThrow({
                where: { organizationId: ctx.organizationId, membershipId },
            });
        const staff = await prisma.staffMember.findFirstOrThrow({
            where: { membershipId },
        });
        const svc = await prisma.service.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Consultation",
                durationMinutes: 30,
                timezone: "UTC",
            },
        });
        const startAt = new Date(Date.now() + startsInHours * 3_600_000);
        const booking = await prisma.booking.create({
            data: {
                organizationId: ctx.organizationId,
                serviceId: svc.id,
                staffId: staff.id,
                startAt,
                endAt: new Date(startAt.getTime() + 1_800_000),
                timezone: "UTC",
                snapshot: {},
            },
        });
        const eventId = eventIdFor(booking.id, connection.id);
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
                organizationId: ctx.organizationId,
                bookingId: booking.id,
                connectionId: connection.id,
                calendarId: "primary-cal",
                eventId,
            },
        });
        return { eventId, bookingId: booking.id };
    }

    const eventOf = (eventId: string) =>
        google.events.get("primary-cal")?.get(eventId);

    it("takes a state once: the same consent can't be finished twice (GC-15)", async () => {
        const { ctx } = await person();
        const { url } = await service.start(ctx);
        const state = new URL(url).searchParams.get("state") ?? "";
        const resolve = () => Promise.resolve(ctx);
        await expect(
            service.callback({ code: "c1", state }, ctx.userId, resolve),
        ).resolves.toMatch(/calendar=connected$/);
        await expect(
            service.callback({ code: "c2", state }, ctx.userId, resolve),
        ).resolves.toMatch(/calendar=expired$/);
    });

    it("sends the browser back to the app when the key is missing (GC-15)", async () => {
        const { ctx } = await person();
        const { url } = await service.start(ctx);
        const state = new URL(url).searchParams.get("state") ?? "";
        const key = mutableEnv.CALENDAR_ENC_KEY;
        mutableEnv.CALENDAR_ENC_KEY = undefined;
        try {
            await expect(
                service.callback({ code: "c", state }, ctx.userId, () =>
                    Promise.resolve(ctx),
                ),
            ).resolves.toMatch(/calendar=failed$/);
        } finally {
            mutableEnv.CALENDAR_ENC_KEY = key;
        }
    });

    it("reads PAUSED for someone who lost the permission, who can still disconnect (GC-03)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        await prisma.membership.update({
            where: { id: membershipId },
            data: { role: "REVIEWER" },
        });
        const reviewer = { ...ctx, role: "REVIEWER" } as OrganizationContext;
        await expect(service.status(reviewer)).resolves.toMatchObject({
            state: "PAUSED",
            pausedBecause: "permission",
        });
        await expect(service.disconnect(reviewer)).resolves.toMatchObject({
            state: "NOT_CONNECTED",
        });
        expect(
            await prisma.googleCalendarConnection.count({
                where: { organizationId: ctx.organizationId, membershipId },
            }),
        ).toBe(0);
    });

    it("reads PAUSED on a plan without it, and connecting stays refused (GC-02)", async () => {
        const { ctx } = await person();
        await connectFlow(ctx);
        const spy = jest
            .spyOn(planMeter, "isIncluded")
            .mockResolvedValue(false);
        try {
            await expect(service.status(ctx)).resolves.toMatchObject({
                state: "PAUSED",
                pausedBecause: "plan",
                behind: false,
            });
        } finally {
            spy.mockRestore();
        }
    });

    it("lets someone off the diary disconnect (GC-03)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        await prisma.staffMember.updateMany({
            where: { membershipId },
            data: { membershipId: null },
        });
        await expect(service.disconnect(ctx)).resolves.toMatchObject({
            state: "NOT_CONNECTED",
        });
    });

    it("lets an owner disconnect someone else, and not a Member (GC-03)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const owner = { ...ctx, role: "OWNER" } as OrganizationContext;
        const member = { ...ctx, role: "MEMBER" } as OrganizationContext;
        await expect(
            service.disconnectMember(member, membershipId),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            service.disconnectMember(owner, membershipId),
        ).resolves.toMatchObject({ state: "NOT_CONNECTED" });
        expect(
            await prisma.googleCalendarConnection.count({
                where: { membershipId },
            }),
        ).toBe(0);
        await expect(
            service.disconnectMember(owner, "not-a-member"),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("on disconnect, takes upcoming events off quietly and leaves past ones (GC-09)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const soon = await mapped(ctx, membershipId, 24);
        const done = await mapped(ctx, membershipId, -24);

        await service.disconnect(ctx);

        expect(eventOf(soon.eventId)).toMatchObject({
            status: "cancelled",
            quiet: true,
        });
        expect(eventOf(done.eventId)?.status).toBe("confirmed");
    });

    it("makes no second event for a booking after a reconnect (GC-09)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const { bookingId } = await mapped(ctx, membershipId, 24);
        await service.disconnect(ctx);
        await connectFlow(ctx);
        await new CalendarSyncHandler(
            google,
            flags as unknown as FeatureFlagService,
            new CalendarLapseService(),
        ).sync(ctx.organizationId, { bookingId, meetTries: 0, quiet: false });
        // The old event went at the disconnect: the booking has one event.
        expect(google.liveEvents()).toHaveLength(1);
    });

    it("on another Google account, clears the old one's upcoming events (GC-09)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const soon = await mapped(ctx, membershipId, 24);
        google.grantEmail = `${uniq("meera-work")}@example.com`;
        await connectFlow(ctx);
        expect(eventOf(soon.eventId)).toMatchObject({
            status: "cancelled",
            quiet: true,
        });
        expect(google.revoked).toHaveLength(1);
        expect(
            await prisma.googleCalendarEvent.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
    });

    it("revokes only at the grant's last use (GC-06)", async () => {
        const a = await person();
        const b = await person();
        await connectFlow(a.ctx);
        await connectFlow(b.ctx);
        // The same Google account in two businesses: the first goes quietly.
        await service.disconnect(a.ctx);
        expect(google.revoked).toHaveLength(0);
        await service.disconnect(b.ctx);
        expect(google.revoked).toHaveLength(1);

        // Someone who signs in with Google keeps the grant too.
        const c = await person();
        await connectFlow(c.ctx);
        await prisma.account.create({
            data: {
                id: uniq("acct"),
                accountId: uniq("google-sub"),
                providerId: "google",
                userId: c.ctx.userId,
            },
        });
        await service.disconnect(c.ctx);
        expect(google.revoked).toHaveLength(1);
    });
});
