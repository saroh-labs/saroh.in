/**
 * Google Calendar v2's booking side (DEC-233) against a real Postgres, with
 * the in-memory Google: "Move my upcoming bookings", a booking's own Meet
 * (made, pasted, who may join, what Google applied), the business's
 * default, the team's read and a reassign's note. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import {
    BOOKING_NOTIFY_TYPE,
    BookingNotifyHandler,
} from "../bookings/booking-notify.handler";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import {
    CALENDAR_ONLY_ACTIONS,
    CALENDAR_ONLY_ROLE_KEY,
} from "../organizations/calendar-only-role";
import { resolveCapabilities } from "../organizations/organization-policy";
import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import type { CustomerNotifyService } from "../site-accounts/customer-notify.handler";
import { CalendarBookingsService } from "./calendar-bookings.service";
import { CALENDAR_SYNC_TYPE } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import { CalendarSyncHandler } from "./calendar-sync.handler";
import { reassignNote } from "./calendar-target";
import { FakeGoogleCalendar } from "./google/fake-google-calendar";
import { SCOPES } from "./google/google-calendar.port";
import { sealToken, tokenColumns } from "./sealing";

// Google Calendar on, everything else as it is: the gates' own flag reads
// (`calendar-allowed.ts`) make their own FeatureFlagService.
jest.mock("../feature-flags/feature-flags.service", () => ({
    ...jest.requireActual("../feature-flags/feature-flags.service"),
    FeatureFlagService: jest.fn().mockImplementation(() => ({
        isEnabled: (key: string) => Promise.resolve(key === "GOOGLE_CALENDAR"),
    })),
}));

const mutableEnv = env as { CALENDAR_ENC_KEY?: string };
const before = mutableEnv.CALENDAR_ENC_KEY;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const flags = {
    isEnabled: (key: string) => Promise.resolve(key === "GOOGLE_CALENDAR"),
} as unknown as FeatureFlagService;
let google: FakeGoogleCalendar;
let sync: CalendarSyncHandler;
let service: CalendarBookingsService;

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
    sync = new CalendarSyncHandler(google, flags, new CalendarLapseService());
    service = new CalendarBookingsService(flags, sync);
});

/** A business, its owner, and Meera on the diary, connected when asked. */
async function setUp(opts: { connected?: boolean } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("gcal-bk") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("meera")}@example.com`, name: "Meera" },
    });
    const membership = await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const staff = await prisma.staffMember.create({
        data: {
            organizationId: org.id,
            membershipId: membership.id,
            name: "Meera",
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        edition: "INDIA",
    };
    const connectionId =
        opts.connected === false
            ? null
            : await connect(org.id, membership.id, "primary-cal");
    return {
        ctx,
        orgId: org.id,
        staffId: staff.id,
        connectionId,
        membershipId: membership.id,
    };
}

async function connect(
    organizationId: string,
    membershipId: string,
    calendarId: string,
    email = `${uniq("meera")}@example.com`,
): Promise<string> {
    const row = await prisma.googleCalendarConnection.create({
        data: {
            organizationId,
            membershipId,
            googleEmail: email,
            scopes: Object.values(SCOPES),
        },
    });
    await prisma.googleCalendarConnection.update({
        where: { id: row.id },
        data: tokenColumns(
            sealToken(`refresh|${email}`, {
                organizationId,
                connectionId: row.id,
            }),
        ),
    });
    await prisma.googleCalendarLink.create({
        data: {
            organizationId,
            connectionId: row.id,
            calendarId,
            name: "Meera",
            writeTo: true,
            checkBusy: true,
        },
    });
    return row.id;
}

async function booking(
    organizationId: string,
    staffId: string,
    opts: { online?: boolean; capacity?: number } = {},
) {
    const svc = await prisma.service.create({
        data: {
            organizationId,
            name: "Consultation",
            durationMinutes: 30,
            timezone: "UTC",
            capacity: opts.capacity ?? 1,
            locationType: opts.online ? "ONLINE" : "IN_PERSON",
        },
    });
    const startAt = new Date(Date.now() + 2 * 86_400_000);
    return prisma.booking.create({
        data: {
            organizationId,
            serviceId: svc.id,
            staffId,
            startAt,
            endAt: new Date(startAt.getTime() + 1_800_000),
            timezone: "UTC",
            snapshot: {},
            bookerName: "Asha",
            bookerEmail: "asha@example.com",
        },
    });
}

/** Run every waiting calendar.sync job of the business, once. */
async function runJobs(organizationId: string) {
    const jobs = await prisma.job.findMany({
        where: { organizationId, type: CALENDAR_SYNC_TYPE, status: "PENDING" },
    });
    for (const j of jobs) {
        await sync.handle(j as Job);
        await prisma.job.update({
            where: { id: j.id },
            data: { status: "COMPLETED" },
        });
    }
    return jobs;
}

describe("a booking's own Google Meet (DEC-233)", () => {
    it("adds a Meet to an in-person booking, says what Google applied, and changes who may join", async () => {
        const { ctx, orgId, staffId } = await setUp();
        const b = await booking(orgId, staffId);

        const made = await service.setBookingMeeting(ctx, b.id, {
            meetingLink: "GOOGLE_MEET",
        });
        expect(made).toMatchObject({
            meetingLink: "GOOGLE_MEET",
            meetingUrl: expect.stringMatching(/^https:\/\/meet\./),
            meetAccess: {
                own: null,
                chosen: "RESTRICTED",
                applied: "RESTRICTED",
            },
            google: "READY",
        });
        // The customer is told of the link: not a quiet update.
        expect(google.liveEvents()[0].quiet).toBe(false);

        const open = await service.setBookingMeeting(ctx, b.id, {
            meetAccess: "OPEN",
        });
        expect(open.meetAccess).toEqual({
            own: "OPEN",
            chosen: "OPEN",
            applied: "OPEN",
        });
        expect(google.liveEvents()[0].quiet).toBe(true);

        // A personal Gmail host keeps TRUSTED, and the answer says so.
        google.personalAccount = true;
        const restricted = await service.setBookingMeeting(ctx, b.id, {
            meetAccess: "RESTRICTED",
        });
        expect(restricted.meetAccess).toMatchObject({
            chosen: "RESTRICTED",
            applied: "OPEN",
        });
    });

    it("says NOT_CONNECTED when whoever takes it has no Google Calendar", async () => {
        const { ctx, orgId, staffId } = await setUp({ connected: false });
        const b = await booking(orgId, staffId);
        await expect(
            service.setBookingMeeting(ctx, b.id, {
                meetingLink: "GOOGLE_MEET",
            }),
        ).resolves.toMatchObject({ google: "NOT_CONNECTED", meetingUrl: null });
    });

    it("keeps a pasted https link, refuses anything else, and refuses a class", async () => {
        const { ctx, orgId, staffId } = await setUp();
        const b = await booking(orgId, staffId);
        await expect(
            service.setBookingMeeting(ctx, b.id, {
                meetingLink: "MANUAL",
                meetingUrl: "https://zoom.example.com/j/1",
            }),
        ).resolves.toMatchObject({
            meetingLink: "MANUAL",
            meetingUrl: "https://zoom.example.com/j/1",
            google: "NONE",
        });
        await expect(
            service.setBookingMeeting(ctx, b.id, {
                meetingLink: "MANUAL",
                meetingUrl: "http://zoom.example.com/j/1",
            }),
        ).rejects.toMatchObject({ status: 400 });
        const seat = await booking(orgId, staffId, { capacity: 6 });
        await expect(
            service.setBookingMeeting(ctx, seat.id, {
                meetingLink: "GOOGLE_MEET",
            }),
        ).rejects.toMatchObject({ status: 400 });
        const member = { ...ctx, role: "REVIEWER" } as OrganizationContext;
        await expect(
            service.setBookingMeeting(member, b.id, { meetingLink: "NONE" }),
        ).rejects.toMatchObject({ status: 403 });
    });

    it("the business's default reaches upcoming Meets that chose nothing", async () => {
        const { ctx, orgId, staffId } = await setUp();
        const b = await booking(orgId, staffId);
        await service.setBookingMeeting(ctx, b.id, {
            meetingLink: "GOOGLE_MEET",
        });
        const own = await booking(orgId, staffId);
        await service.setBookingMeeting(ctx, own.id, {
            meetingLink: "GOOGLE_MEET",
            meetAccess: "RESTRICTED",
        });

        await expect(
            service.setBusinessMeetAccess(ctx, "TRUSTED"),
        ).resolves.toEqual({ meetAccess: "TRUSTED", updating: 1 });
        const jobs = await runJobs(orgId);
        expect(jobs.map((j) => j.payload)).toEqual([
            { bookingId: b.id, quietUpdate: true },
        ]);
        expect(
            await prisma.googleCalendarEvent.findUniqueOrThrow({
                where: { bookingId: b.id },
            }),
        ).toMatchObject({ meetAccess: "TRUSTED" });
    });
});

describe("Move my upcoming bookings (DEC-233)", () => {
    it("moves what isn't on the bookings-go-to calendar, and nothing twice", async () => {
        const { ctx, orgId, staffId, connectionId, membershipId } =
            await setUp();
        const onOld = await booking(orgId, staffId);
        const none = await booking(orgId, staffId);
        await sync.sync(orgId, {
            bookingId: onOld.id,
            meetTries: 0,
            quiet: false,
        });
        // The old account goes; a new one takes the bookings.
        await prisma.googleCalendarConnection.update({
            where: { id: connectionId ?? "" },
            data: { status: "DISCONNECTED", tokenCiphertext: null },
        });
        await prisma.googleCalendarLink.updateMany({
            where: { connectionId: connectionId ?? "" },
            data: { writeTo: false },
        });
        await connect(orgId, membershipId, "new-cal");

        const moved = await service.moveBookings(ctx);
        expect(moved.moving).toBe(2);
        await runJobs(orgId);
        const onNew = google
            .liveEvents()
            .filter((e) => e.calendarId === "new-cal")
            .map((e) => e.input.bookingId)
            .sort();
        expect(onNew).toEqual([none.id, onOld.id].sort());
        // The old account's event stays where it was.
        expect(
            google.liveEvents().filter((e) => e.calendarId === "primary-cal"),
        ).toHaveLength(1);

        await expect(service.moveBookings(ctx)).resolves.toMatchObject({
            moving: 0,
        });
    });

    it("needs somewhere for bookings to go", async () => {
        const { ctx } = await setUp({ connected: false });
        await expect(service.moveBookings(ctx)).rejects.toMatchObject({
            status: 400,
        });
    });
});

describe("the team's read and a reassign's note (DEC-233)", () => {
    it("lists who has connected, for owners only", async () => {
        const { ctx, staffId } = await setUp();
        await expect(service.members(ctx)).resolves.toEqual([
            expect.objectContaining({
                staffId,
                name: "Meera",
                bookingsGoToGoogle: true,
                pausedBecause: null,
                accounts: [expect.objectContaining({ state: "CONNECTED" })],
            }),
        ]);
        const member = { ...ctx, role: "MEMBER" } as OrganizationContext;
        await expect(service.members(member)).rejects.toMatchObject({
            status: 403,
        });
    });

    it("says a booking moves, or comes off Google for someone not connected", async () => {
        const { orgId, staffId } = await setUp();
        const b = await booking(orgId, staffId, { online: true });
        await sync.sync(orgId, { bookingId: b.id, meetTries: 0, quiet: false });
        const other = await prisma.staffMember.create({
            data: { organizationId: orgId, name: "Arjun" },
        });
        await expect(
            reassignNote(orgId, b.id, { id: other.id, name: "Arjun" }),
        ).resolves.toMatchObject({ event: "REMOVED" });
        await expect(
            reassignNote(orgId, b.id, { id: staffId, name: "Meera" }),
        ).resolves.toMatchObject({ event: "MOVES" });
    });
});

describe("after a disconnect, and a reassign's notice (DEC-233)", () => {
    it("says a booking's old Google event is out of date once it changed", async () => {
        const { ctx, orgId, staffId, connectionId } = await setUp();
        const b = await booking(orgId, staffId);
        await sync.sync(orgId, { bookingId: b.id, meetTries: 0, quiet: false });
        await expect(service.bookingMeeting(ctx, b.id)).resolves.toMatchObject({
            googleEvent: { connected: true, outOfDate: false, message: null },
        });
        await prisma.googleCalendarConnection.update({
            where: { id: connectionId ?? "" },
            data: { status: "DISCONNECTED", tokenCiphertext: null },
        });
        await expect(service.bookingMeeting(ctx, b.id)).resolves.toMatchObject({
            googleEvent: { connected: false, outOfDate: false },
        });
        // Moved while disconnected: Google can't follow, and the read says so.
        await sync.sync(orgId, { bookingId: b.id, meetTries: 0, quiet: false });
        await expect(service.bookingMeeting(ctx, b.id)).resolves.toMatchObject({
            googleEvent: {
                connected: false,
                outOfDate: true,
                message: expect.stringContaining("isn't updated any more"),
            },
        });
        // And a reassign's note says the old event is left behind.
        const other = await prisma.staffMember.create({
            data: { organizationId: orgId, name: "Arjun" },
        });
        await expect(
            reassignNote(orgId, b.id, { id: other.id, name: "Arjun" }),
        ).resolves.toMatchObject({ event: "REMOVED", oldEventLeft: true });
    });

    it("holds the reassigned notice until the new Meet link is saved", async () => {
        const { orgId, staffId } = await setUp();
        const b = await booking(orgId, staffId, { online: true });
        await prisma.booking.update({
            where: { id: b.id },
            data: { meetingLink: "GOOGLE_MEET" },
        });
        const notices = { notify: jest.fn().mockResolvedValue(undefined) };
        const notify = new BookingNotifyHandler(
            notices as unknown as CustomerNotifyService,
        );
        const job = (payload: object) =>
            ({
                id: uniq("job"),
                organizationId: orgId,
                type: BOOKING_NOTIFY_TYPE,
                payload,
            }) as unknown as Job;

        await notify.handle(job({ bookingId: b.id, reason: "reassigned" }));
        expect(notices.notify).not.toHaveBeenCalled();
        const waiting = await prisma.job.findFirstOrThrow({
            where: {
                organizationId: orgId,
                type: BOOKING_NOTIFY_TYPE,
                payload: { path: ["bookingId"], equals: b.id },
            },
        });
        expect(waiting.payload).toMatchObject({ meetWaits: 1 });
        expect(waiting.runAt.getTime()).toBeGreaterThan(Date.now());

        // The Meet is saved: the notice goes, with the link on the booking.
        await sync.sync(orgId, { bookingId: b.id, meetTries: 0, quiet: false });
        await notify.handle(job(waiting.payload as object));
        expect(notices.notify).toHaveBeenCalledTimes(1);
        expect(
            (await prisma.booking.findUniqueOrThrow({ where: { id: b.id } }))
                .meetingUrl,
        ).toMatch(/^https:\/\/meet\./);

        // Past its waits it goes anyway, link or not.
        notices.notify.mockClear();
        google.meetPendingReads = 0;
        await prisma.googleCalendarEvent.deleteMany({
            where: { bookingId: b.id },
        });
        await notify.handle(
            job({ bookingId: b.id, reason: "reassigned", meetWaits: 6 }),
        );
        expect(notices.notify).toHaveBeenCalledTimes(1);
    });
});

describe("the security review's fixes (09-calendar-v2)", () => {
    /** Kiran: on the diary, signs in as Calendar only, connected. */
    async function calendarOnly(orgId: string) {
        const kiran = await prisma.user.create({
            data: { email: `${uniq("kiran")}@example.com`, name: "Kiran" },
        });
        const membership = await prisma.membership.create({
            data: {
                organizationId: orgId,
                userId: kiran.id,
                role: CALENDAR_ONLY_ROLE_KEY,
            },
        });
        const staff = await prisma.staffMember.create({
            data: {
                organizationId: orgId,
                membershipId: membership.id,
                name: "Kiran",
            },
        });
        await connect(orgId, membership.id, "kiran-cal");
        const ctx: OrganizationContext = {
            organizationId: orgId,
            userId: kiran.id,
            role: "MEMBER",
            roleKey: CALENDAR_ONLY_ROLE_KEY,
            actions: resolveCapabilities(
                CALENDAR_ONLY_ROLE_KEY,
                CALENDAR_ONLY_ACTIONS,
            ),
        };
        return { ctx, staffId: staff.id };
    }

    it("a Calendar only person can't read or change a colleague's booking meeting (H1)", async () => {
        const { orgId, staffId } = await setUp();
        const meeras = await booking(orgId, staffId);
        const kiran = await calendarOnly(orgId);
        await expect(
            service.bookingMeeting(kiran.ctx, meeras.id),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
            service.setBookingMeeting(kiran.ctx, meeras.id, {
                meetingLink: "MANUAL",
                meetingUrl: "https://phish.example.com/j/1",
            }),
        ).rejects.toMatchObject({ status: 403 });
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: meeras.id },
                })
            ).meetingUrl,
        ).toBeNull();
        // Their own: read and changed.
        const own = await booking(orgId, kiran.staffId);
        await expect(
            service.setBookingMeeting(kiran.ctx, own.id, {
                meetingLink: "MANUAL",
                meetingUrl: "https://zoom.example.com/j/2",
            }),
        ).resolves.toMatchObject({ meetingLink: "MANUAL" });
    });

    it("shows the host's Google address only to the host or an admin, and 404s with the switch off (L2)", async () => {
        const { ctx, orgId } = await setUp();
        const kiran = await calendarOnly(orgId);
        const own = await booking(orgId, kiran.staffId);
        await sync.sync(orgId, {
            bookingId: own.id,
            meetTries: 0,
            quiet: false,
        });
        const email = expect.stringContaining("@example.com");
        await expect(
            service.bookingMeeting(kiran.ctx, own.id),
        ).resolves.toMatchObject({ googleEvent: { googleEmail: email } });
        await expect(
            service.bookingMeeting(ctx, own.id),
        ).resolves.toMatchObject({ googleEvent: { googleEmail: email } });
        const member = { ...ctx, role: "MEMBER" } as OrganizationContext;
        await expect(
            service.bookingMeeting(member, own.id),
        ).resolves.toMatchObject({ googleEvent: { googleEmail: null } });

        const off = new CalendarBookingsService(
            {
                isEnabled: () => Promise.resolve(false),
            } as unknown as FeatureFlagService,
            sync,
        );
        await expect(off.bookingMeeting(ctx, own.id)).rejects.toMatchObject({
            status: 404,
        });
    });

    it("queues one job per booking however often it's asked, and limits a business's changes (M2)", async () => {
        const { ctx, orgId, staffId } = await setUp();
        const b = await booking(orgId, staffId);
        await service.setBookingMeeting(ctx, b.id, {
            meetingLink: "GOOGLE_MEET",
        });
        await service.setBusinessMeetAccess(ctx, "TRUSTED");
        await service.setBusinessMeetAccess(ctx, "OPEN");
        expect(
            await prisma.job.count({
                where: {
                    organizationId: orgId,
                    type: CALENDAR_SYNC_TYPE,
                    status: "PENDING",
                },
            }),
        ).toBe(1);

        const limited = new CalendarBookingsService(
            flags,
            sync,
            new FixedWindowRateLimiter(1, 60_000),
        );
        await limited.setBusinessMeetAccess(ctx, "TRUSTED");
        await expect(limited.moveBookings(ctx)).rejects.toMatchObject({
            status: 429,
        });
        // Another business has its own hour.
        const other = await setUp();
        await expect(
            limited.setBusinessMeetAccess(other.ctx, "OPEN"),
        ).resolves.toMatchObject({ meetAccess: "OPEN" });
    });
});
