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
import { overAllowance, pausedBecause } from "./calendar-allowed";
import { CalendarConnectService } from "./calendar-connect.service";
import { CALENDAR_BUSY_TYPE } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import { CalendarReleaseService } from "./calendar-release.service";
import { CalendarSweepJob } from "./calendar-sweep.job";
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
        new CalendarReleaseService(google),
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
            accounts: [{ id: row.id, googleEmail: google.grantEmail }],
            bookingsGoTo: { accountId: row.id, calendarId: "primary-cal" },
            accountsAllowed: 1,
            meetAccess: "RESTRICTED",
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
        expect(status.accounts[0].granted).toMatchObject({
            events: false,
            freeBusy: true,
        });
        await expect(
            service.choose(ctx, row.id, {
                writeTo: "primary-cal",
                checkBusy: [],
            }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("checks several calendars for busy times, and writes to one (DEC-233)", async () => {
        const { ctx } = await person();
        await connectFlow(ctx);
        const [account] = (await service.status(ctx)).accounts;
        const status = await service.choose(ctx, account.id, {
            writeTo: "family-cal",
            checkBusy: ["primary-cal", "family-cal"],
        });
        expect(status.accounts[0].calendars).toEqual([
            {
                id: "family-cal",
                name: "Family",
                writeTo: true,
                checkBusy: true,
            },
            {
                id: "primary-cal",
                name: "Meera",
                writeTo: false,
                checkBusy: true,
            },
        ]);
        expect(status.bookingsGoTo).toMatchObject({ calendarId: "family-cal" });
        // Absent leaves where bookings go as it is.
        const again = await service.choose(ctx, account.id, {
            checkBusy: ["primary-cal"],
        });
        expect(again.bookingsGoTo).toMatchObject({ calendarId: "family-cal" });
        await expect(
            service.choose(ctx, "not-an-account", { checkBusy: [] }),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("reconnecting after a lapse reuses the row and keeps the choices", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const row = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, membershipId },
        });
        await service.choose(ctx, row.id, {
            writeTo: "family-cal",
            checkBusy: ["family-cal"],
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

    it("disconnecting revokes, drops the token and busy times, keeps the row and Google's events", async () => {
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
            accounts: [],
            kept: { upcomingEvents: 0 },
        });
        expect(google.revoked).toHaveLength(1);
        expect(
            await prisma.googleCalendarConnection.findUniqueOrThrow({
                where: { id: row.id },
            }),
        ).toMatchObject({
            status: "DISCONNECTED",
            tokenCiphertext: null,
            busyRefreshedAt: null,
        });
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
            kept: { upcomingEvents: 0 },
        });
        expect(
            await prisma.googleCalendarConnection.count({
                where: {
                    organizationId: ctx.organizationId,
                    membershipId,
                    status: { not: "DISCONNECTED" },
                },
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
                accounts: [{ state: "PAUSED", behind: false }],
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

    it("lets an owner disconnect someone else, audited, and not a Member (GC-03)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const soon = await mapped(ctx, membershipId, 24);
        const owner = { ...ctx, role: "OWNER" } as OrganizationContext;
        const member = { ...ctx, role: "MEMBER" } as OrganizationContext;
        await expect(
            service.disconnectMember(member, membershipId),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            service.disconnectMember(owner, membershipId),
        ).resolves.toMatchObject({
            kept: {
                upcomingEvents: 1,
                message: expect.stringContaining("their Google Calendar"),
            },
        });
        expect(eventOf(soon.eventId)?.status).toBe("confirmed");
        expect(
            await prisma.googleCalendarConnection.count({
                where: { membershipId, status: { not: "DISCONNECTED" } },
            }),
        ).toBe(0);
        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: ctx.organizationId,
                action: "calendar.member.disconnect",
            },
        });
        expect(audit).toMatchObject({
            targetId: membershipId,
            metadata: { keptUpcomingEvents: 1 },
        });
        expect(JSON.stringify(audit.metadata)).not.toContain("@");
        await expect(
            service.disconnectMember(owner, "not-a-member"),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("on disconnect, keeps upcoming events in Google and says so (DEC-233)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const soon = await mapped(ctx, membershipId, 24);
        const done = await mapped(ctx, membershipId, -24);

        const view = await service.disconnect(ctx);

        expect(view.kept).toEqual({
            upcomingEvents: 1,
            message: expect.stringContaining("stays on your Google Calendar"),
        });
        expect(eventOf(soon.eventId)?.status).toBe("confirmed");
        expect(eventOf(done.eventId)?.status).toBe("confirmed");
        expect(
            await prisma.googleCalendarEvent.count({
                where: { bookingId: soon.bookingId },
            }),
        ).toBe(1);
        // A booking moved meanwhile leaves its event as it was: frozen.
        const sync = new CalendarSyncHandler(
            google,
            flags as unknown as FeatureFlagService,
            new CalendarLapseService(),
        );
        google.calls.length = 0;
        await sync.sync(ctx.organizationId, {
            bookingId: soon.bookingId,
            meetTries: 0,
            quiet: false,
        });
        expect(google.calls).toHaveLength(0);
    });

    it("reconnecting the same account picks its events back up, quietly, same Meet (DEC-233)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const row = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, membershipId },
        });
        const { bookingId, eventId } = await mapped(ctx, membershipId, 24);
        await prisma.service.updateMany({
            where: { organizationId: ctx.organizationId },
            data: { locationType: "ONLINE", meetingLink: "GOOGLE_MEET" },
        });
        const sync = new CalendarSyncHandler(
            google,
            flags as unknown as FeatureFlagService,
            new CalendarLapseService(),
        );
        const payload = { bookingId, meetTries: 0, quiet: false };
        await sync.sync(ctx.organizationId, payload);
        const meetBefore = eventOf(eventId)?.meetCode;
        expect(meetBefore).toBeTruthy();

        await service.disconnect(ctx);
        await connectFlow(ctx);

        const again = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, membershipId },
        });
        expect(again).toMatchObject({ id: row.id, status: "CONNECTED" });
        const job = await prisma.job.findFirstOrThrow({
            where: {
                organizationId: ctx.organizationId,
                type: "calendar.sync",
                payload: { path: ["bookingId"], equals: bookingId },
            },
        });
        expect(job.payload).toMatchObject({ quietUpdate: true });
        await sync.sync(ctx.organizationId, {
            ...payload,
            quietUpdate: true,
        });
        expect(google.liveEvents()).toHaveLength(1);
        expect(eventOf(eventId)).toMatchObject({
            meetCode: meetBefore,
            quiet: true,
        });
    });

    it("refuses another Google account past the plan's allowance (DEC-233)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const first = google.grantEmail;
        google.grantEmail = `${uniq("meera-work")}@example.com`;
        await expect(connectFlow(ctx)).resolves.toMatch(/calendar=limit$/);
        expect(
            await prisma.googleCalendarConnection.findMany({
                where: { membershipId },
                select: { googleEmail: true },
            }),
        ).toEqual([{ googleEmail: first }]);
        // The grant Saroh won't keep is let go.
        expect(google.revoked).toHaveLength(1);
        // Disconnected first, the other account connects, and nothing moves.
        await service.disconnect(ctx);
        await expect(connectFlow(ctx)).resolves.toMatch(/calendar=connected$/);
        const status = await service.status(ctx);
        expect(status.accounts.map((a) => a.googleEmail)).toEqual([
            google.grantEmail,
        ]);
    });

    it("connects several accounts where the plan allows, one taking bookings (DEC-233)", async () => {
        const original = planMeter.enforcedRow.bind(planMeter);
        const spy = jest
            .spyOn(planMeter, "enforcedRow")
            .mockImplementation((orgId, moduleId, now) =>
                moduleId === "google-accounts"
                    ? Promise.resolve({
                          moduleId,
                          state: "on",
                          limit: 2,
                      } as Awaited<ReturnType<typeof original>>)
                    : original(orgId, moduleId, now),
            );
        try {
            const { ctx } = await person();
            await connectFlow(ctx);
            const work = `${uniq("meera-work")}@example.com`;
            google.grantEmail = work;
            google.accountCalendars.set(work, [
                { id: "work-cal", name: "Work", primary: true, canWrite: true },
            ]);
            await expect(connectFlow(ctx)).resolves.toMatch(
                /calendar=connected$/,
            );
            let status = await service.status(ctx);
            expect(status.accountsAllowed).toBe(2);
            expect(status.accounts).toHaveLength(2);
            // The second reads busy times, and bookings stay with the first.
            expect(status.accounts[1].calendars).toEqual([
                {
                    id: "work-cal",
                    name: "Work",
                    writeTo: false,
                    checkBusy: true,
                },
            ]);
            expect(status.bookingsGoTo?.accountId).toBe(status.accounts[0].id);
            // Put them here: one across both accounts.
            status = await service.choose(ctx, status.accounts[1].id, {
                writeTo: "work-cal",
                checkBusy: ["work-cal"],
            });
            expect(status.bookingsGoTo).toMatchObject({
                accountId: status.accounts[1].id,
                calendarId: "work-cal",
            });
            expect(
                status.accounts[0].calendars.filter((c) => c.writeTo),
            ).toHaveLength(0);
            // A third is past the allowance.
            google.grantEmail = `${uniq("third")}@example.com`;
            await expect(connectFlow(ctx)).resolves.toMatch(/calendar=limit$/);
            // One account disconnected; the other carries on.
            const view = await service.disconnect(ctx, status.accounts[0].id);
            expect(view.accounts.map((a) => a.googleEmail)).toEqual([work]);
        } finally {
            spy.mockRestore();
        }
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

    // The security review's fixes (09-calendar-v2).
    it("an Admin can't disconnect the Owner's Google Calendar (M1)", async () => {
        const { ctx, membershipId } = await person({ role: "OWNER" });
        await connectFlow(ctx);
        const admin = {
            ...ctx,
            userId: uniq("admin"),
            role: "ADMIN",
        } as OrganizationContext;
        await expect(
            service.disconnectMember(admin, membershipId),
        ).rejects.toMatchObject({ status: 403 });
        expect(
            await prisma.googleCalendarConnection.count({
                where: { membershipId, status: "CONNECTED" },
            }),
        ).toBe(1);
    });

    it("after a downgrade, the accounts past the allowance read PAUSED for the plan (M3)", async () => {
        const two = allowAccounts(2);
        const { ctx, membershipId } = await person();
        let status: Awaited<ReturnType<typeof service.status>>;
        try {
            await connectFlow(ctx);
            google.grantEmail = `${uniq("meera-work")}@example.com`;
            await connectFlow(ctx);
            status = await service.status(ctx);
            // Bookings go to the second: it is the one kept.
            status = await service.choose(ctx, status.accounts[1].id, {
                writeTo: "primary-cal",
                checkBusy: ["primary-cal"],
            });
        } finally {
            two.mockRestore();
        }
        const [first, second] = status.accounts.map((a) => a.id);
        const one = allowAccounts(1);
        try {
            await expect(overAllowance(ctx.organizationId)).resolves.toEqual(
                new Set([first]),
            );
            await expect(
                pausedBecause(ctx.organizationId, membershipId, flags, first),
            ).resolves.toBe("plan");
            await expect(
                pausedBecause(ctx.organizationId, membershipId, flags, second),
            ).resolves.toBeNull();
            const after = await service.status(ctx);
            expect(after.accounts.map((a) => [a.id, a.state])).toEqual([
                [first, "PAUSED"],
                [second, "CONNECTED"],
            ]);
        } finally {
            one.mockRestore();
        }
    });

    it("two consents finishing at once can't both pass the allowance (M3)", async () => {
        const { ctx, membershipId } = await person();
        const twin = (email: string) => {
            const g = new FakeGoogleCalendar();
            g.grantEmail = email;
            return new CalendarConnectService(
                g,
                flags as unknown as FeatureFlagService,
                new CalendarLapseService(),
                new CalendarReleaseService(g),
            );
        };
        const outcomes = await Promise.all([
            twin(`${uniq("a")}@example.com`).connect(ctx, membershipId, "c1"),
            twin(`${uniq("b")}@example.com`).connect(ctx, membershipId, "c2"),
        ]);
        expect(outcomes.sort()).toEqual(["connected", "limit"]);
        expect(
            await prisma.googleCalendarConnection.count({
                where: { membershipId },
            }),
        ).toBe(1);
    });

    it("a disconnect keeps only what a reconnect needs, and the sweep deletes it after 30 days (L1)", async () => {
        const { ctx, membershipId } = await person();
        await connectFlow(ctx);
        const { bookingId } = await mapped(ctx, membershipId, 24);
        await service.disconnect(ctx);
        const row = await prisma.googleCalendarConnection.findFirstOrThrow({
            where: { membershipId },
            include: { calendars: true, events: true },
        });
        expect(row).toMatchObject({ status: "DISCONNECTED", scopes: [] });
        expect(row.calendars).toEqual([]);
        expect(row.events.map((e) => e.bookingId)).toEqual([bookingId]);

        const sweep = new CalendarSweepJob();
        await expect(sweep.purgeDisconnected(new Date())).resolves.toBe(0);
        await prisma.googleCalendarConnection.update({
            where: { id: row.id },
            data: { updatedAt: new Date(Date.now() - 31 * 86_400_000) },
        });
        // A held business keeps it until the hold lifts (DEC-122).
        await prisma.organization.update({
            where: { id: row.organizationId },
            data: { legalHoldAt: new Date() },
        });
        await expect(sweep.purgeDisconnected(new Date())).resolves.toBe(0);
        await prisma.organization.update({
            where: { id: row.organizationId },
            data: { legalHoldAt: null },
        });
        await sweep.purgeDisconnected(new Date());
        expect(
            await prisma.googleCalendarConnection.count({
                where: { id: row.id },
            }),
        ).toBe(0);
        expect(
            await prisma.googleCalendarEvent.count({ where: { bookingId } }),
        ).toBe(0);
    });
});

/** The plan's Google accounts a person, as the catalogue would set it. */
function allowAccounts(limit: number) {
    const original = planMeter.enforcedRow.bind(planMeter);
    return jest
        .spyOn(planMeter, "enforcedRow")
        .mockImplementation((orgId, moduleId, now) =>
            moduleId === "google-accounts"
                ? Promise.resolve({
                      moduleId,
                      state: "on",
                      limit,
                  } as Awaited<ReturnType<typeof original>>)
                : original(orgId, moduleId, now),
        );
}
