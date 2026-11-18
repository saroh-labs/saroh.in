/**
 * Bookings to Google Calendar (#1047, #1048, U5) against a real Postgres,
 * with the in-memory Google: made, moved, cancelled and handed to someone
 * else; Meet links (pending, tightened, a personal account's refusal);
 * the no-ops; Google's "try later" and a refused token; and the same job
 * twice. Then the review's fixes: paused by the plan or a lost permission
 * (GC-02, GC-03), the last retry telling the person once (GC-05), a cancel
 * that lands mid-create (GC-11), past events deleted with no email and a
 * quiet rewrite (GC-09). Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import { planMeter } from "../billing/metering.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { CALENDAR_SYNC_TYPE } from "./calendar-jobs";
import {
    CALENDAR_SYNC_FAILED_NOTICE,
    CalendarLapseService,
} from "./calendar-lapse.service";
import { CalendarSyncHandler } from "./calendar-sync.handler";
import { eventIdFor } from "./event-shape";
import { FakeGoogleCalendar } from "./google/fake-google-calendar";
import { SCOPES } from "./google/google-calendar.port";
import { queueCalendarSyncInTx } from "./queue-sync";
import { sealToken, tokenColumns } from "./sealing";

const mutableEnv = env as { CALENDAR_ENC_KEY?: string };
const before = mutableEnv.CALENDAR_ENC_KEY;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
let google: FakeGoogleCalendar;
let handler: CalendarSyncHandler;

beforeAll(() => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.CALENDAR_ENC_KEY = randomBytes(32).toString("base64");
});
afterAll(async () => {
    mutableEnv.CALENDAR_ENC_KEY = before;
    await prisma.$disconnect();
});
beforeEach(() => {
    flags.isEnabled.mockResolvedValue(true);
    google = new FakeGoogleCalendar();
    handler = new CalendarSyncHandler(
        google,
        flags as unknown as FeatureFlagService,
        new CalendarLapseService(),
    );
});

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("gcal-sync") },
    });
    return org.id;
}

/** Someone on the diary; connected to Google, writing to `cal`, when asked. */
async function staff(
    organizationId: string,
    opts: { connected?: boolean; cal?: string; login?: boolean } = {},
) {
    let membershipId: string | null = null;
    if (opts.login !== false) {
        const user = await prisma.user.create({
            data: { email: `${uniq("p")}@example.com`, name: "Meera" },
        });
        membershipId = (
            await prisma.membership.create({
                data: { organizationId, userId: user.id, role: "MEMBER" },
            })
        ).id;
    }
    const person = await prisma.staffMember.create({
        data: { organizationId, membershipId, name: "Meera" },
    });
    let connectionId: string | null = null;
    if (opts.connected && membershipId) {
        const row = await prisma.googleCalendarConnection.create({
            data: {
                organizationId,
                membershipId,
                googleEmail: "meera@example.com",
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
                calendarId: opts.cal ?? "primary-cal",
                name: "Meera",
                writeTo: true,
                checkBusy: true,
            },
        });
        connectionId = row.id;
    }
    return { staffId: person.id, connectionId, membershipId };
}

async function service(
    organizationId: string,
    opts: { online?: boolean; meet?: boolean; capacity?: number } = {},
) {
    return prisma.service.create({
        data: {
            organizationId,
            name: "Consultation",
            durationMinutes: 30,
            timezone: "Asia/Kolkata",
            capacity: opts.capacity ?? 1,
            locationType: opts.online ? "ONLINE" : "IN_PERSON",
            meetingLink: opts.meet ? "GOOGLE_MEET" : "MANUAL",
        },
    });
}

async function booking(
    organizationId: string,
    serviceId: string,
    staffId: string | null,
    opts: { email?: string | null; startAt?: Date } = {},
) {
    const startAt = opts.startAt ?? new Date(Date.now() + 2 * 86_400_000);
    return prisma.booking.create({
        data: {
            organizationId,
            serviceId,
            staffId,
            startAt,
            endAt: new Date(startAt.getTime() + 1_800_000),
            timezone: "Asia/Kolkata",
            snapshot: {},
            bookerName: "Asha",
            bookerEmail:
                opts.email === undefined ? "asha@example.com" : opts.email,
        },
    });
}

const job = (organizationId: string, bookingId: string): Job =>
    ({
        id: uniq("job"),
        organizationId,
        type: CALENDAR_SYNC_TYPE,
        payload: { bookingId },
    }) as unknown as Job;

describe("calendar.sync", () => {
    it("makes one event with the customer invited, and keeps the mapping", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const s = await service(org);
        const b = await booking(org, s.id, a.staffId);

        await handler.handle(job(org, b.id));

        const events = google.liveEvents();
        expect(events).toHaveLength(1);
        expect(events[0].calendarId).toBe("primary-cal");
        expect(events[0].input.guest).toEqual({
            email: "asha@example.com",
            name: "Asha",
        });
        const mapping = await prisma.googleCalendarEvent.findUniqueOrThrow({
            where: { bookingId: b.id },
        });
        expect(mapping.eventId).toBe(eventIdFor(b.id, a.connectionId ?? ""));
    });

    it("makes an event with no guest when the customer left no email", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const s = await service(org);
        const b = await booking(org, s.id, a.staffId, { email: null });
        await handler.handle(job(org, b.id));
        expect(google.liveEvents()[0].input.guest).toBeUndefined();
    });

    it("updates the same event on a move, and twice is the same as once", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const s = await service(org);
        const b = await booking(org, s.id, a.staffId);
        await handler.handle(job(org, b.id));
        const later = new Date(b.startAt.getTime() + 3_600_000);
        await prisma.booking.update({
            where: { id: b.id },
            data: {
                startAt: later,
                endAt: new Date(later.getTime() + 1_800_000),
            },
        });
        await handler.handle(job(org, b.id));
        await handler.handle(job(org, b.id));
        const events = google.liveEvents();
        expect(events).toHaveLength(1);
        expect(events[0].input.startAt).toEqual(later);
    });

    it("deletes the event on a cancel, and an event already gone is fine", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const s = await service(org);
        const b = await booking(org, s.id, a.staffId);
        await handler.handle(job(org, b.id));
        await prisma.booking.update({
            where: { id: b.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        await handler.handle(job(org, b.id));
        expect(google.liveEvents()).toHaveLength(0);
        expect(
            await prisma.googleCalendarEvent.count({
                where: { bookingId: b.id },
            }),
        ).toBe(0);
        // Again, with nothing left anywhere: no error.
        await expect(handler.handle(job(org, b.id))).resolves.toBeUndefined();
    });

    it("moves the event from A to B on a hand-over, and only removes it for C", async () => {
        const org = await business();
        const a = await staff(org, { connected: true, cal: "cal-a" });
        const bPerson = await staff(org, { connected: true, cal: "cal-b" });
        const c = await staff(org, { connected: false });
        const s = await service(org);
        const b = await booking(org, s.id, a.staffId);
        await handler.handle(job(org, b.id));

        await prisma.booking.update({
            where: { id: b.id },
            data: { staffId: bPerson.staffId },
        });
        await handler.handle(job(org, b.id));
        expect(google.liveEvents().map((e) => e.calendarId)).toEqual(["cal-b"]);

        await prisma.booking.update({
            where: { id: b.id },
            data: { staffId: c.staffId },
        });
        await handler.handle(job(org, b.id));
        expect(google.liveEvents()).toHaveLength(0);
    });

    it("saves a Meet link once Google has made it, and tightens who may join", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const s = await service(org, { online: true, meet: true });
        const b = await booking(org, s.id, a.staffId);
        google.meetPendingReads = 1;

        await handler.handle(job(org, b.id));
        const retry = await prisma.job.findFirst({
            where: {
                organizationId: org,
                type: CALENDAR_SYNC_TYPE,
                payload: { path: ["bookingId"], equals: b.id },
            },
        });
        expect(retry?.payload).toMatchObject({ meetTries: 1 });
        expect(
            (await prisma.booking.findUniqueOrThrow({ where: { id: b.id } }))
                .meetingUrl,
        ).toBeNull();

        await handler.handle({
            ...job(org, b.id),
            payload: retry?.payload,
        } as Job);
        const saved = await prisma.booking.findUniqueOrThrow({
            where: { id: b.id },
        });
        expect(saved.meetingUrl).toMatch(/^https:\/\/meet\./);
        const code = google.liveEvents()[0].meetCode ?? "";
        expect(google.spaces.get(code)).toBe("RESTRICTED");
    });

    it("keeps TRUSTED when a personal account refuses RESTRICTED", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const s = await service(org, { online: true, meet: true });
        const b = await booking(org, s.id, a.staffId);
        google.personalAccount = true;
        await handler.handle(job(org, b.id));
        const code = google.liveEvents()[0].meetCode ?? "";
        expect(google.spaces.get(code)).toBe("TRUSTED");
        expect(
            (await prisma.booking.findUniqueOrThrow({ where: { id: b.id } }))
                .meetingUrl,
        ).toMatch(/^https:\/\/meet\./);
    });

    it("queues nothing for someone with no connection or no login", async () => {
        const org = await business();
        const nobody = await staff(org, { connected: false });
        const loginless = await staff(org, { login: false });
        const s = await service(org);
        for (const staffId of [nobody.staffId, loginless.staffId, null]) {
            const b = await booking(org, s.id, staffId);
            await prisma.$transaction((tx) =>
                queueCalendarSyncInTx(tx, {
                    organizationId: org,
                    bookingId: b.id,
                    staffId,
                }),
            );
        }
        expect(
            await prisma.job.count({
                where: { organizationId: org, type: CALENDAR_SYNC_TYPE },
            }),
        ).toBe(0);
    });

    it("does nothing with the flag off, or for a class", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const b = await booking(org, (await service(org)).id, a.staffId);
        flags.isEnabled.mockResolvedValue(false);
        await handler.handle(job(org, b.id));
        expect(google.calls).toHaveLength(0);

        flags.isEnabled.mockResolvedValue(true);
        const cls = await service(org, { capacity: 8 });
        const seat = await booking(org, cls.id, a.staffId);
        await handler.handle(job(org, seat.id));
        expect(google.liveEvents()).toHaveLength(0);
    });

    it("throws Google's 429 for the worker's retry, and stops on a refused token", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const s = await service(org);
        const b = await booking(org, s.id, a.staffId);

        google.failNext("putEvent", "retry");
        await expect(handler.handle(job(org, b.id))).rejects.toMatchObject({
            kind: "retry",
        });

        google.failNext("refresh", "lapsed");
        await expect(handler.handle(job(org, b.id))).resolves.toBeUndefined();
        const row = await prisma.googleCalendarConnection.findUniqueOrThrow({
            where: { id: a.connectionId ?? "" },
        });
        expect(row.status).toBe("LAPSED");
        expect(row.tokenCiphertext).toBeNull();
        expect(google.liveEvents()).toHaveLength(0);
    });

    it("does nothing for a business moved down to Free, and keeps its events (GC-02)", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const b = await booking(org, (await service(org)).id, a.staffId);
        await handler.handle(job(org, b.id));
        await prisma.booking.update({
            where: { id: b.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        const spy = jest
            .spyOn(planMeter, "isIncluded")
            .mockResolvedValue(false);
        try {
            google.calls.length = 0;
            await handler.handle(job(org, b.id));
            expect(google.calls).toHaveLength(0);
            expect(google.liveEvents()).toHaveLength(1);
        } finally {
            spy.mockRestore();
        }
    });

    it("leaves alone the calendar of someone who lost the permission (GC-03)", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const b = await booking(org, (await service(org)).id, a.staffId);
        await handler.handle(job(org, b.id));
        await prisma.membership.update({
            where: { id: a.membershipId ?? "" },
            data: { role: "REVIEWER" },
        });
        const later = new Date(b.startAt.getTime() + 3_600_000);
        await prisma.booking.update({
            where: { id: b.id },
            data: {
                startAt: later,
                endAt: new Date(later.getTime() + 1_800_000),
            },
        });
        google.calls.length = 0;
        await handler.handle(job(org, b.id));
        expect(google.calls).toHaveLength(0);
        // A new booking for them isn't copied either.
        const fresh = await booking(org, (await service(org)).id, a.staffId);
        await handler.handle(job(org, fresh.id));
        expect(google.calls).toHaveLength(0);
    });

    it("tells the person once when the last retry fails (GC-05)", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const s = await service(org);
        const last = (bookingId: string): Job =>
            ({ ...job(org, bookingId), attempts: 5, maxAttempts: 6 }) as Job;
        const first = await booking(org, s.id, a.staffId);
        const second = await booking(org, s.id, a.staffId);

        google.failNext("putEvent", "retry", 2);
        await expect(handler.handle(last(first.id))).rejects.toMatchObject({
            kind: "retry",
        });
        await expect(handler.handle(last(second.id))).rejects.toMatchObject({
            kind: "retry",
        });

        const notices = await prisma.notification.findMany({
            where: { organizationId: org, type: CALENDAR_SYNC_FAILED_NOTICE },
        });
        expect(notices).toHaveLength(1);
        expect(notices[0].bookingId).toBe(first.id);
    });

    it("doesn't tell anyone about an attempt that will be retried", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const b = await booking(org, (await service(org)).id, a.staffId);
        google.failNext("putEvent", "retry");
        await expect(
            handler.handle({
                ...job(org, b.id),
                attempts: 0,
                maxAttempts: 6,
            } as Job),
        ).rejects.toMatchObject({ kind: "retry" });
        expect(
            await prisma.notification.count({
                where: {
                    organizationId: org,
                    type: CALENDAR_SYNC_FAILED_NOTICE,
                },
            }),
        ).toBe(0);
    });

    it("queues one more pass when the booking is cancelled while its event is made (GC-11)", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const b = await booking(org, (await service(org)).id, a.staffId);
        const put = google.putEvent.bind(google);
        const spy = jest
            .spyOn(google, "putEvent")
            .mockImplementation(async (...args: Parameters<typeof put>) => {
                const made = await put(...args);
                // The cancel commits while Google is answering.
                await prisma.booking.update({
                    where: { id: b.id },
                    data: { status: "CANCELLED", cancelledAt: new Date() },
                });
                return made;
            });
        await handler.handle(job(org, b.id));
        const again = await prisma.job.findFirst({
            where: {
                organizationId: org,
                type: CALENDAR_SYNC_TYPE,
                status: "PENDING",
                payload: { path: ["bookingId"], equals: b.id },
            },
        });
        expect(again).not.toBeNull();
        spy.mockRestore();
        await handler.handle(job(org, b.id));
        expect(google.liveEvents()).toHaveLength(0);
    });

    it("deletes a past booking's event with no email, and never adds one for it (GC-09)", async () => {
        const org = await business();
        const a = await staff(org, { connected: true, cal: "cal-a" });
        const other = await staff(org, { connected: true, cal: "cal-b" });
        const s = await service(org);
        const past = await booking(org, s.id, a.staffId);
        await handler.handle(job(org, past.id));
        const ago = new Date(Date.now() - 3 * 86_400_000);
        await prisma.booking.update({
            where: { id: past.id },
            data: {
                startAt: ago,
                endAt: new Date(ago.getTime() + 1_800_000),
                staffId: other.staffId,
            },
        });
        await handler.handle(job(org, past.id));
        const all = [...google.events.values()].flatMap((m) => [...m.values()]);
        expect(all.filter((e) => e.calendarId === "cal-a")[0]).toMatchObject({
            status: "cancelled",
            quiet: true,
        });
        expect(google.liveEvents()).toHaveLength(0);
    });

    it("rewrites an event quietly for a privacy removal (GC-09)", async () => {
        const org = await business();
        const a = await staff(org, { connected: true });
        const b = await booking(org, (await service(org)).id, a.staffId);
        await handler.handle(job(org, b.id));
        await prisma.booking.update({
            where: { id: b.id },
            data: { bookerName: "Removed customer", bookerEmail: null },
        });
        await handler.handle({
            ...job(org, b.id),
            payload: { bookingId: b.id, quiet: true },
        } as Job);
        const [event] = google.liveEvents();
        expect(event.quiet).toBe(true);
        expect(event.input.guest).toBeUndefined();
        expect(event.input.title).not.toContain("Asha");
    });
});
