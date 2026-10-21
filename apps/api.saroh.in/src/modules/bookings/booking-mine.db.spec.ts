/**
 * "Bookings with you" (DEC-174, #1138) against a real Postgres, end to end:
 * a booking, a move, a hand-over or a cancel queues `booking.notify`; that
 * queues `team.alert` `booking-mine` for the person it is with; that writes
 * their own notice and emails them alone.
 *
 * - Asha books with Ravi (who has a login): Ravi's own bell and an email;
 *   the owner sees no personal notice.
 * - The owner gives it from Ravi to Meera: both are told.
 * - Ravi cancels his own booking: Ravi isn't told.
 * - Ravi turned email off: the bell only. Bell off: his own notice is
 *   hidden, and comes back when he turns it on.
 * - Someone with no login: nothing queued.
 * - Each alert goes once, however often its job runs.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and with
 * TEST_RLS=on.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        APP_URL: "https://app.saroh.localhost",
    },
}));

import type { Booking, Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { NotificationsService } from "../notifications/notifications.service";
import type { AlertEmail } from "../notifications/team-alert.handler";
import { tellTeam } from "../notifications/team-alert.handler";
import type { TeamAlertPayload } from "../notifications/team-alerts";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import type { CustomerNotifyService } from "../site-accounts/customer-notify.handler";
import type { BookingNotifyPayload } from "./booking-notify.handler";
import { tellAboutBooking } from "./booking-notify.handler";
import { BookingsService } from "./bookings.service";

const tag = `${process.pid}-${Date.now()}`;
const bookings = new BookingsService();
const inbox = new NotificationsService();
// The customer's side is customer.notify's, proven in its own specs.
const notices = {
    notify: jest.fn().mockResolvedValue({ duplicate: false }),
} as unknown as Pick<CustomerNotifyService, "notify">;

let orgId = "";
let owner: OrganizationContext;
let raviCtx: OrganizationContext;
let meeraCtx: OrganizationContext;
let physio = "";
const staff = { ravi: "", meera: "", noLogin: "" };
const email: Record<string, string> = {};
let slot = 0;
const done = new Set<string>();

const MONDAY = 1;

function monday(hour: number, weeksOut: number): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour);
    return d;
}

async function user(name: string) {
    const u = await prisma.user.create({
        data: { email: `mine-${name}-${tag}@example.com`, name },
    });
    email[name] = u.email;
    return u;
}

/** Someone on the diary who takes Physio, Mondays 09:00-17:00 UTC. */
async function person(
    name: string,
    login?: { userId: string; role: string },
): Promise<string> {
    const membership = login
        ? await prisma.membership.create({
              data: {
                  organizationId: orgId,
                  userId: login.userId,
                  role: login.role,
              },
          })
        : null;
    const row = await prisma.staffMember.create({
        data: {
            organizationId: orgId,
            name,
            membershipId: membership?.id ?? null,
            services: {
                create: { organizationId: orgId, serviceId: physio },
            },
            hours: {
                create: {
                    organizationId: orgId,
                    dayOfWeek: MONDAY,
                    startMinute: 9 * 60,
                    endMinute: 17 * 60,
                },
            },
        },
    });
    return row.id;
}

/** A Physio booking by hand with `staffId`, on a Monday of its own. */
async function bookWith(
    by: OrganizationContext,
    staffId: string,
): Promise<Booking> {
    slot += 1;
    return bookings.bookByHand(by, physio, {
        startAt: monday(10, slot + 1).toISOString(),
        bookerName: "Asha Rao",
        bookerEmail: `asha-${slot}-${tag}@example.com`,
        staffId,
    });
}

/** Run every queued job of `type` not run yet, as the worker would. */
async function pending(type: string): Promise<Job[]> {
    const jobs = await prisma.job.findMany({
        where: { organizationId: orgId, type },
        orderBy: { createdAt: "asc" },
    });
    return jobs.filter((j) => !done.has(j.id));
}

/**
 * Run the queued `booking.notify` jobs, then the `booking-mine` alerts
 * they queued; answers who was emailed.
 */
async function tell(): Promise<AlertEmail[]> {
    for (const job of await pending("booking.notify")) {
        done.add(job.id);
        await runInOrgContext(orgId, () =>
            prisma.$transaction((tx) =>
                tellAboutBooking(tx, notices, {
                    organizationId: orgId,
                    jobId: job.id,
                    payload: job.payload as unknown as BookingNotifyPayload,
                    now: new Date(),
                }),
            ),
        );
    }
    const emails: AlertEmail[] = [];
    for (const job of await mineJobs()) {
        if (done.has(job.id)) continue;
        done.add(job.id);
        emails.push(...(await runAlert(job)));
    }
    return emails;
}

async function mineJobs(): Promise<Job[]> {
    return (
        await prisma.job.findMany({
            where: { organizationId: orgId, type: TEAM_ALERT_TYPE },
            orderBy: { createdAt: "asc" },
        })
    ).filter(
        (j) =>
            (j.payload as { event?: string } | null)?.event === "booking-mine",
    );
}

async function runAlert(job: Job): Promise<AlertEmail[]> {
    const out = await runInOrgContext(orgId, () =>
        prisma.$transaction((tx) =>
            tellTeam(tx, orgId, job.payload as unknown as TeamAlertPayload),
        ),
    );
    return out.emails;
}

/** The personal notices someone sees in their own alerts. */
async function mineSeenBy(ctx: OrganizationContext) {
    return (await inbox.list(ctx)).filter(
        (n) =>
            n.type.startsWith("booking.mine.") ||
            n.type === "booking.reassigned",
    );
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kaya Physio", slug: `kaya-mine-${tag}` },
    });
    orgId = org.id;
    await prisma.businessProfile.create({
        data: { organizationId: orgId, timezone: "UTC" },
    });
    const ownerUser = await user("Owner");
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerUser.id, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerUser.id, role: "OWNER" };
    physio = (
        await prisma.service.create({
            data: {
                organizationId: orgId,
                name: "Physio assessment",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                timezone: "UTC",
            },
        })
    ).id;
    const ravi = await user("Ravi");
    const meera = await user("Meera");
    staff.ravi = await person("Ravi Kumar", {
        userId: ravi.id,
        role: "MEMBER",
    });
    staff.meera = await person("Meera Iyer", {
        userId: meera.id,
        role: "MEMBER",
    });
    staff.noLogin = await person("Kiran Das");
    raviCtx = { organizationId: orgId, userId: ravi.id, role: "MEMBER" };
    meeraCtx = { organizationId: orgId, userId: meera.id, role: "MEMBER" };
});

afterEach(async () => {
    await prisma.notificationPreference.deleteMany({
        where: { organizationId: orgId },
    });
});

describe("Bookings with you", () => {
    it("Asha books with Ravi: Ravi's own bell and an email; the owner sees no personal notice", async () => {
        const booking = await bookWith(owner, staff.ravi);
        const emails = await tell();

        expect(emails.map((e) => e.to)).toEqual([email.Ravi]);
        expect(emails[0]!.mail).toMatchObject({
            subject: "Kaya Physio: A booking with you: Physio assessment",
            heading: "A booking with you: Physio assessment",
            url: `https://app.saroh.localhost/bookings/${booking.id}`,
        });
        expect(JSON.stringify(emails[0]!.mail)).not.toContain("Asha");

        const seen = await mineSeenBy(raviCtx);
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({
            type: "booking.mine.new",
            userId: raviCtx.userId,
            bookingId: booking.id,
            title: "Asha Rao booked Physio assessment with you",
            target: { kind: "booking", id: booking.id },
        });
        expect(await mineSeenBy(owner)).toEqual([]);
        expect(await mineSeenBy(meeraCtx)).toEqual([]);
    });

    it("tells once, however often its job runs", async () => {
        const booking = await bookWith(owner, staff.ravi);
        expect(await tell()).toHaveLength(1);
        const [last] = (await mineJobs()).slice(-1);
        expect(await runAlert(last!)).toEqual([]);
        expect(
            await prisma.notification.count({
                where: {
                    organizationId: orgId,
                    userId: raviCtx.userId,
                    bookingId: booking.id,
                },
            }),
        ).toBe(1);
    });

    it("the owner gives it from Ravi to Meera: both are told", async () => {
        const booking = await bookWith(owner, staff.ravi);
        await tell();
        await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.meera,
        });
        const emails = await tell();

        expect(emails.map((e) => e.to).sort()).toEqual(
            [email.Ravi, email.Meera].sort(),
        );
        const toRavi = emails.find((e) => e.to === email.Ravi)!.mail;
        expect(toRavi.heading).toBe("A booking was given to someone else");
        expect(toRavi.body).toContain("is now with Meera Iyer");
        const toMeera = emails.find((e) => e.to === email.Meera)!.mail;
        expect(toMeera.heading).toBe("A booking with you: Physio assessment");

        // One bell each, written by the hand-over itself (#1157): not two.
        const onBooking = (n: { bookingId: string | null }) =>
            n.bookingId === booking.id;
        expect(
            (await mineSeenBy(meeraCtx)).filter(onBooking).map((n) => n.type),
        ).toEqual(["booking.reassigned"]);
        expect(
            (await mineSeenBy(raviCtx)).filter(onBooking).map((n) => n.type),
        ).toEqual(["booking.reassigned", "booking.mine.new"]);
    });

    it("moved to another time by the owner: Ravi hears the new time", async () => {
        const booking = await bookWith(owner, staff.ravi);
        await tell();
        await bookings.rescheduleBooking(owner, booking.id, {
            startAt: new Date(
                booking.startAt.getTime() + 2 * 60 * 60_000,
            ).toISOString(),
        });
        const emails = await tell();
        expect(emails.map((e) => e.to)).toEqual([email.Ravi]);
        expect(emails[0]!.mail.heading).toBe("A booking with you was moved");
        const [moved] = (await mineSeenBy(raviCtx)).filter(
            (n) =>
                n.bookingId === booking.id && n.type === "booking.mine.moved",
        );
        expect(moved?.title).toBe(
            "Asha Rao's Physio assessment with you was moved",
        );
    });

    it("Ravi cancels his own booking: Ravi isn't told", async () => {
        const booking = await bookWith(owner, staff.ravi);
        await tell();
        await bookings.cancelBooking(raviCtx, booking.id);
        expect(await tell()).toEqual([]);
        expect(
            (await mineSeenBy(raviCtx)).filter(
                (n) =>
                    n.bookingId === booking.id &&
                    n.type === "booking.mine.cancelled",
            ),
        ).toEqual([]);
    });

    it("the owner cancels it: Ravi is told", async () => {
        const booking = await bookWith(owner, staff.ravi);
        await tell();
        await bookings.cancelBooking(owner, booking.id);
        const emails = await tell();
        expect(emails.map((e) => e.to)).toEqual([email.Ravi]);
        expect(emails[0]!.mail.heading).toBe(
            "A booking with you was cancelled",
        );
    });

    it("Ravi booked it himself: nobody is told", async () => {
        await bookWith(raviCtx, staff.ravi);
        expect(await tell()).toEqual([]);
    });

    it("Ravi turned email off: the bell only", async () => {
        await prisma.notificationPreference.create({
            data: {
                organizationId: orgId,
                userId: raviCtx.userId,
                event: "mine",
                channel: "email",
                enabled: false,
            },
        });
        const booking = await bookWith(owner, staff.ravi);
        expect(await tell()).toEqual([]);
        expect(
            (await mineSeenBy(raviCtx)).filter(
                (n) => n.bookingId === booking.id,
            ),
        ).toHaveLength(1);
    });

    it("Ravi turned the bell off: his own notices are hidden, and back when he turns it on", async () => {
        const booking = await bookWith(owner, staff.ravi);
        await tell();
        const mine = (n: { bookingId: string | null }) =>
            n.bookingId === booking.id;
        expect((await mineSeenBy(raviCtx)).filter(mine)).toHaveLength(1);
        await prisma.notificationPreference.create({
            data: {
                organizationId: orgId,
                userId: raviCtx.userId,
                event: "mine",
                channel: "bell",
                enabled: false,
            },
        });
        expect((await mineSeenBy(raviCtx)).filter(mine)).toEqual([]);
        await prisma.notificationPreference.deleteMany({
            where: { organizationId: orgId, userId: raviCtx.userId },
        });
        expect((await mineSeenBy(raviCtx)).filter(mine)).toHaveLength(1);
    });

    it("someone with no login: nothing queued", async () => {
        const before = (await mineJobs()).length;
        await bookWith(owner, staff.noLogin);
        expect(await tell()).toEqual([]);
        expect(await mineJobs()).toHaveLength(before);
    });

    it("another business never sees Ravi's notices", async () => {
        await bookWith(owner, staff.ravi);
        await tell();
        const other = await prisma.organization.create({
            data: { name: "Other", slug: `other-mine-${tag}` },
        });
        await prisma.membership.create({
            data: {
                organizationId: other.id,
                userId: raviCtx.userId,
                role: "MEMBER",
            },
        });
        const elsewhere: OrganizationContext = {
            organizationId: other.id,
            userId: raviCtx.userId,
            role: "MEMBER",
        };
        expect(await mineSeenBy(elsewhere)).toEqual([]);
    });
});
