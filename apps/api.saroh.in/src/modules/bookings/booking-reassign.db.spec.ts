/**
 * Changing who a booking is with (#1157) against a real Postgres:
 *
 * - a booking handed to someone free is theirs, with one REASSIGNED line
 *   naming both people, one customer notice ("now with Meera") and an
 *   alert in each person's own inbox (never the one who made the change);
 * - a person booked then is a 409 that says when; one not working then,
 *   or who doesn't take the service, is a 400; a class is refused;
 * - a booking with nobody can be given someone; the time can change in
 *   the same step;
 * - the money, deposit, pay link, pack credit and waitlist place stay on
 *   the booking, untouched;
 * - who may: an owner gives anyone's to anyone; a Member hands over their
 *   own, or takes one with nobody, and nothing else; Calendar only the
 *   same within their diary; a Reviewer nothing; another business's
 *   booking or person is a 404;
 * - the picker's read: who is free, busy (and when) or off at a time.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and with
 * TEST_RLS=on.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import type { Booking } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { NotificationsService } from "../notifications/notifications.service";
import {
    CALENDAR_ONLY_ACTIONS,
    CALENDAR_ONLY_ROLE_KEY,
} from "../organizations/calendar-only-role";
import { resolveCapabilities } from "../organizations/organization-policy";
import { loadSubject } from "../site-accounts/customer-notify.handler";
import { noticeSentence } from "../site-accounts/notify-templates";
import { BookingEventType } from "./booking-event-type";
import {
    BOOKING_REASSIGNED_NOTIFICATION_TYPE,
    CLASS_INSTRUCTOR_ELSEWHERE,
    NOT_YOURS_TO_REASSIGN,
    TAKE_ONLY_YOURSELF,
} from "./booking-reassign";
import { BookingsService } from "./bookings.service";
import * as reservation from "./reservation";

const tag = `${process.pid}-${Date.now()}`;
const bookings = new BookingsService();
const inbox = new NotificationsService();

let orgId = "";
let owner: OrganizationContext;
let ashaCtx: OrganizationContext;
let meeraCtx: OrganizationContext;
let kiranCtx: OrganizationContext;
let reviewer: OrganizationContext;
let rival: OrganizationContext;
let physio = "";
let yoga = "";
const staff: Record<"asha" | "meera" | "ravi" | "kiran", string> = {
    asha: "",
    meera: "",
    ravi: "",
    kiran: "",
};
let rivalPerson = "";
let rivalBookingId = "";
let slot = 0;

const MONDAY = 1;

/** The Monday `weeksOut` weeks ahead, at `hour`:`minute` UTC. */
function monday(hour: number, minute = 0, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour, minute);
    return d;
}

async function user(name: string) {
    return prisma.user.create({
        data: { email: `reassign-${name}-${tag}@example.com`, name },
    });
}

/** Someone on the diary who takes Physio, Mondays 09:00–17:00 UTC. */
async function person(
    organizationId: string,
    name: string,
    serviceIds: string[],
    login?: { userId: string; role: string },
): Promise<string> {
    const membership = login
        ? await prisma.membership.create({
              data: {
                  organizationId,
                  userId: login.userId,
                  role: login.role,
              },
          })
        : null;
    const row = await prisma.staffMember.create({
        data: {
            organizationId,
            name,
            membershipId: membership?.id ?? null,
            services: {
                create: serviceIds.map((serviceId) => ({
                    organizationId,
                    serviceId,
                })),
            },
            hours: {
                create: {
                    organizationId,
                    dayOfWeek: MONDAY,
                    startMinute: 9 * 60,
                    endMinute: 17 * 60,
                },
            },
        },
    });
    return row.id;
}

/**
 * A Physio booking with `staffId` on a Monday of its own weeks out, so
 * tests never meet each other's bookings; the hour is `hour` UTC.
 */
async function bookWith(
    staffId: string | null,
    hour = 10,
    weeksOut?: number,
): Promise<Booking> {
    slot += 1;
    const weeks = weeksOut ?? slot + 1;
    const startAt = monday(hour, 0, weeks);
    if (staffId) {
        return bookings.bookByHand(owner, physio, {
            startAt: startAt.toISOString(),
            bookerName: "Kabir Singh",
            bookerEmail: `kabir-${slot}-${tag}@example.com`,
            staffId,
        });
    }
    // Made before staff existed: nobody on it.
    const contact = await prisma.contact.create({
        data: {
            organizationId: orgId,
            email: `kabir-${slot}-${tag}@example.com`,
            firstName: "Kabir",
            lastName: "Singh",
        },
    });
    return prisma.booking.create({
        data: {
            organizationId: orgId,
            serviceId: physio,
            contactId: contact.id,
            startAt,
            endAt: new Date(startAt.getTime() + 60 * 60_000),
            timezone: "UTC",
            status: "CONFIRMED",
            paidWith: "DESK",
            bookerName: "Kabir Singh",
            bookerEmail: contact.email,
            snapshot: { service: { priceCents: 80_000, currency: "INR" } },
        },
    });
}

/** The REASSIGNED lines of a booking. */
function reassignedLines(bookingId: string) {
    return prisma.bookingEvent.findMany({
        where: { bookingId, type: BookingEventType.Reassigned },
    });
}

/** The `booking.notify` jobs queued about one event. */
async function noticeJobsFor(eventId: string) {
    const jobs = await prisma.job.findMany({
        where: { organizationId: orgId, type: "booking.notify" },
    });
    return jobs.filter(
        (j) => (j.payload as { eventId?: string } | null)?.eventId === eventId,
    );
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kaya Physio", slug: `kaya-reassign-${tag}` },
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
    yoga = (
        await prisma.service.create({
            data: {
                organizationId: orgId,
                name: "Mat Pilates",
                durationMinutes: 60,
                capacity: 6,
                priceCents: 50_000,
                currency: "INR",
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: orgId,
                        dayOfWeek: MONDAY,
                        startMinute: 9 * 60,
                        endMinute: 17 * 60,
                    },
                },
            },
        })
    ).id;

    const asha = await user("Asha");
    const meera = await user("Meera");
    const kiran = await user("Kiran");
    staff.asha = await person(orgId, "Asha Rao", [physio, yoga], {
        userId: asha.id,
        role: "MEMBER",
    });
    staff.meera = await person(orgId, "Meera Iyer", [physio], {
        userId: meera.id,
        role: "MEMBER",
    });
    // On the diary with no login: no inbox to tell.
    staff.ravi = await person(orgId, "Ravi Kumar", [physio]);
    staff.kiran = await person(orgId, "Kiran Das", [physio], {
        userId: kiran.id,
        role: CALENDAR_ONLY_ROLE_KEY,
    });
    ashaCtx = { organizationId: orgId, userId: asha.id, role: "MEMBER" };
    meeraCtx = { organizationId: orgId, userId: meera.id, role: "MEMBER" };
    kiranCtx = {
        organizationId: orgId,
        userId: kiran.id,
        role: "MEMBER",
        roleKey: CALENDAR_ONLY_ROLE_KEY,
        actions: resolveCapabilities(
            CALENDAR_ONLY_ROLE_KEY,
            CALENDAR_ONLY_ACTIONS,
        ),
    };
    const reviewerUser = await user("Reviewer");
    await prisma.membership.create({
        data: {
            organizationId: orgId,
            userId: reviewerUser.id,
            role: "REVIEWER",
        },
    });
    reviewer = {
        organizationId: orgId,
        userId: reviewerUser.id,
        role: "REVIEWER",
    };

    // Another business, with its own person and booking.
    const other = await prisma.organization.create({
        data: { name: "Other Clinic", slug: `other-reassign-${tag}` },
    });
    await prisma.businessProfile.create({
        data: { organizationId: other.id, timezone: "UTC" },
    });
    const rivalUser = await user("Rival");
    await prisma.membership.create({
        data: {
            organizationId: other.id,
            userId: rivalUser.id,
            role: "OWNER",
        },
    });
    rival = {
        organizationId: other.id,
        userId: rivalUser.id,
        role: "OWNER",
    };
    const theirs = await prisma.service.create({
        data: {
            organizationId: other.id,
            name: "Their physio",
            durationMinutes: 60,
            capacity: 1,
            priceCents: 80_000,
            currency: "INR",
            timezone: "UTC",
        },
    });
    rivalPerson = await person(other.id, "Rival Person", [theirs.id]);
    rivalBookingId = (
        await bookings.bookByHand(rival, theirs.id, {
            startAt: monday(10, 0, 1).toISOString(),
            bookerName: "Someone Else",
            bookerEmail: `someone-${tag}@example.com`,
            staffId: rivalPerson,
        })
    ).id;
});

describe("giving a booking to someone free", () => {
    it("moves it to them, writes one REASSIGNED line naming both, and queues one notice", async () => {
        const booking = await bookWith(staff.asha);
        const moved = await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.meera,
        });
        expect(moved.staffId).toBe(staff.meera);
        expect(moved.startAt).toEqual(booking.startAt);

        const lines = await reassignedLines(booking.id);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
            actorUserId: owner.userId,
            fromStaffId: staff.asha,
            toStaffId: staff.meera,
            fromStartAt: booking.startAt,
            toStartAt: booking.startAt,
        });
        // No RESCHEDULED line beside it: one change, one line.
        expect(
            await prisma.bookingEvent.count({
                where: {
                    bookingId: booking.id,
                    type: BookingEventType.Rescheduled,
                },
            }),
        ).toBe(0);
        expect(await noticeJobsFor(lines[0].id)).toHaveLength(1);
    });

    it("tells the customer once that it is now with Meera, through the moved notice", async () => {
        const booking = await bookWith(staff.asha);
        await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.meera,
        });
        const [line] = await reassignedLines(booking.id);
        const subject = await runInOrgContext(orgId, () =>
            prisma.$transaction((tx) =>
                loadSubject(tx, orgId, {
                    kind: "BOOKING_MOVED",
                    eventKey: `test:${line.id}`,
                    bookingId: booking.id,
                    bookingEventId: line.id,
                }),
            ),
        );
        expect(subject).not.toBeNull();
        expect(noticeSentence(subject!.vars)).toMatch(
            /^Your Physio assessment on Mon \d+ \w+ at 10:00 am is now with Meera Iyer\.$/,
        );
    });

    it("says the new time too when it moves in the same step", async () => {
        const booking = await bookWith(staff.asha);
        const later = new Date(booking.startAt.getTime() + 2 * 3_600_000);
        const moved = await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.meera,
            startAt: later.toISOString(),
        });
        expect(moved.staffId).toBe(staff.meera);
        expect(moved.startAt).toEqual(later);
        expect(moved.endAt).toEqual(new Date(later.getTime() + 3_600_000));
        const [line] = await reassignedLines(booking.id);
        expect(line.fromStartAt).toEqual(booking.startAt);
        expect(line.toStartAt).toEqual(later);
        const subject = await runInOrgContext(orgId, () =>
            prisma.$transaction((tx) =>
                loadSubject(tx, orgId, {
                    kind: "BOOKING_MOVED",
                    eventKey: `test:${line.id}`,
                    bookingId: booking.id,
                    bookingEventId: line.id,
                }),
            ),
        );
        expect(noticeSentence(subject!.vars)).toMatch(
            /is now with Meera Iyer on Mon \d+ \w+ at 12:00 pm\. It was Mon \d+ \w+ at 10:00 am\.$/,
        );
    });

    it("alerts both people in their own inbox, never the one who made the change", async () => {
        const booking = await bookWith(staff.asha);
        // Asha hands her own booking to Meera: only Meera is told.
        await bookings.reassignBooking(ashaCtx, booking.id, {
            staffId: staff.meera,
        });
        // Meera reads it in her own alerts; Asha's bell never holds it.
        const meeraSees = await inbox.list(meeraCtx);
        expect(
            meeraSees.some(
                (n) =>
                    n.type === BOOKING_REASSIGNED_NOTIFICATION_TYPE &&
                    n.bookingId === booking.id,
            ),
        ).toBe(true);
        const ashaSees = await inbox.list(ashaCtx);
        expect(ashaSees.some((n) => n.bookingId === booking.id)).toBe(false);
        const mine = await prisma.notification.findMany({
            where: {
                organizationId: orgId,
                bookingId: booking.id,
                type: BOOKING_REASSIGNED_NOTIFICATION_TYPE,
            },
        });
        expect(mine.map((n) => n.userId)).toEqual([meeraCtx.userId]);
        expect(mine[0].title).toBe(
            "Kabir Singh's Physio assessment is now with you",
        );
        expect(mine[0].body).toMatch(/It was with Asha Rao\.$/);

        // The owner moves it back: both Meera and Asha are told.
        await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.asha,
        });
        const told = await prisma.notification.findMany({
            where: {
                organizationId: orgId,
                bookingId: booking.id,
                type: BOOKING_REASSIGNED_NOTIFICATION_TYPE,
            },
            orderBy: { createdAt: "asc" },
        });
        expect(
            told
                .slice(1)
                .map((n) => n.userId)
                .sort(),
        ).toEqual([ashaCtx.userId, meeraCtx.userId].sort());
        // Neither is the business's inbox: an owner's bell doesn't hold them.
        expect(told.every((n) => n.userId !== null)).toBe(true);
    });

    it("tells nobody's inbox for someone with no login", async () => {
        const booking = await bookWith(staff.asha, 13);
        await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.ravi,
        });
        const told = await prisma.notification.findMany({
            where: { bookingId: booking.id },
        });
        // Asha hears it left her diary; Ravi has no inbox.
        expect(told.map((n) => n.userId)).toEqual([ashaCtx.userId]);
    });

    it("changes nothing for the same person at the same time", async () => {
        const booking = await bookWith(staff.asha);
        await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.asha,
        });
        expect(await reassignedLines(booking.id)).toHaveLength(0);
    });
});

describe("someone who can't take it", () => {
    it("refuses a person booked then, saying when", async () => {
        const week = 40;
        await bookWith(staff.meera, 10, week);
        const booking = await bookWith(staff.asha, 10, week);
        const error = await bookings
            .reassignBooking(owner, booking.id, { staffId: staff.meera })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ConflictException);
        const body = (error as ConflictException).getResponse() as {
            message: string;
            details: { reason: string };
        };
        expect(body.message).toBe(
            "Meera Iyer is already booked from 10:00 am to 11:00 am. Pick someone else or another time.",
        );
        expect(body.details.reason).toBe("person-busy");
        // Nothing changed.
        const after = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(after.staffId).toBe(staff.asha);
        expect(await reassignedLines(booking.id)).toHaveLength(0);
    });

    it("refuses a person off then", async () => {
        const booking = await bookWith(staff.asha, 10, 41);
        await prisma.staffTimeOff.create({
            data: {
                organizationId: orgId,
                staffId: staff.ravi,
                startAt: monday(0, 0, 41),
                endAt: monday(23, 0, 41),
            },
        });
        await expect(
            bookings.reassignBooking(owner, booking.id, {
                staffId: staff.ravi,
            }),
        ).rejects.toThrow("Ravi Kumar isn't working then.");
    });

    it("refuses outside their hours, saying so, and changes nothing", async () => {
        const booking = await bookWith(staff.asha, 10);
        const evening = new Date(booking.startAt.getTime() + 8 * 3_600_000);
        const error = await bookings
            .reassignBooking(owner, booking.id, {
                staffId: staff.meera,
                startAt: evening.toISOString(),
            })
            .catch((e: unknown) => e);
        // Any 400 would have passed before (review #35): this one says why.
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(
            "Meera Iyer isn't working then.",
        );
        const after = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(after.staffId).toBe(staff.asha);
        expect(after.startAt).toEqual(booking.startAt);
        expect(await reassignedLines(booking.id)).toHaveLength(0);
    });

    it("refuses a person who doesn't take the service (review #27)", async () => {
        const booking = await bookWith(staff.asha, 10);
        // On the diary, but for classes only.
        const nisha = await person(orgId, `Nisha Pal ${tag}`, [yoga]);
        const error = await bookings
            .reassignBooking(owner, booking.id, { staffId: nisha })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(
            "That person doesn't take this service.",
        );
        const after = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(after.staffId).toBe(staff.asha);
        expect(await reassignedLines(booking.id)).toHaveLength(0);
    });

    it("refuses when nobody takes the service yet (review #27)", async () => {
        const massage = await prisma.service.create({
            data: {
                organizationId: orgId,
                name: `Massage ${tag}`,
                durationMinutes: 60,
                capacity: 1,
                priceCents: 120_000,
                currency: "INR",
                timezone: "UTC",
            },
        });
        const startAt = monday(10, 0, 60);
        const booking = await prisma.booking.create({
            data: {
                organizationId: orgId,
                serviceId: massage.id,
                startAt,
                endAt: new Date(startAt.getTime() + 3_600_000),
                timezone: "UTC",
                status: "CONFIRMED",
                bookerName: "Kabir Singh",
                snapshot: {},
            },
        });
        const error = await bookings
            .reassignBooking(owner, booking.id, { staffId: staff.asha })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(
            "Nobody takes this service yet. Add who takes it on the service first.",
        );
        const after = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(after.staffId).toBeNull();
    });

    it("refuses a class: its instructor is changed on the class", async () => {
        const startAt = monday(9, 0, 42);
        const seat = await prisma.booking.create({
            data: {
                organizationId: orgId,
                serviceId: yoga,
                staffId: staff.asha,
                startAt,
                endAt: new Date(startAt.getTime() + 3_600_000),
                timezone: "UTC",
                status: "CONFIRMED",
                bookerName: "Class Goer",
                snapshot: {},
            },
        });
        await expect(
            bookings.reassignBooking(owner, seat.id, { staffId: staff.meera }),
        ).rejects.toThrow(CLASS_INSTRUCTOR_ELSEWHERE);
    });

    it("refuses a cancelled booking", async () => {
        const booking = await bookWith(staff.asha);
        await prisma.booking.update({
            where: { id: booking.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        await expect(
            bookings.reassignBooking(owner, booking.id, {
                staffId: staff.meera,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("losing a race with another booking (review #33)", () => {
    // Postgres's 40001, as Prisma reports it, from inside the move's
    // serializable write (where a concurrent booking makes it).
    const raced = () =>
        Object.assign(new Error("could not serialize access"), {
            code: "P2034",
        });

    it("tries again, and hands it over once the race is gone", async () => {
        const booking = await bookWith(staff.asha, 11);
        const real = reservation.assertPersonFreeInTx;
        let calls = 0;
        const spy = jest
            .spyOn(reservation, "assertPersonFreeInTx")
            .mockImplementation((...args) => {
                calls += 1;
                return calls <= 2 ? Promise.reject(raced()) : real(...args);
            });
        try {
            const moved = await bookings.reassignBooking(owner, booking.id, {
                staffId: staff.meera,
            });
            expect(moved.staffId).toBe(staff.meera);
            expect(calls).toBe(3);
        } finally {
            spy.mockRestore();
        }
        expect(await reassignedLines(booking.id)).toHaveLength(1);
    });

    it("says others are booking, never fully booked, when every try loses", async () => {
        const booking = await bookWith(staff.asha, 12);
        const spy = jest
            .spyOn(reservation, "assertPersonFreeInTx")
            .mockImplementation(() => Promise.reject(raced()));
        let error: unknown;
        try {
            error = await bookings
                .reassignBooking(owner, booking.id, { staffId: staff.meera })
                .catch((e: unknown) => e);
            expect(spy).toHaveBeenCalledTimes(3);
        } finally {
            spy.mockRestore();
        }
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe(
            "Lots of people are booking right now. Try again.",
        );
        const after = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(after.staffId).toBe(staff.asha);
    });
});

describe("a booking with nobody", () => {
    it("can be given someone, the line saying it had nobody", async () => {
        const booking = await bookWith(null);
        const given = await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.meera,
        });
        expect(given.staffId).toBe(staff.meera);
        const [line] = await reassignedLines(booking.id);
        expect(line.fromStaffId).toBeNull();
        expect(line.toStaffId).toBe(staff.meera);
        // Meera hears it is hers, with no "It was with".
        const [alert] = await prisma.notification.findMany({
            where: { bookingId: booking.id },
        });
        expect(alert.userId).toBe(meeraCtx.userId);
        expect(alert.body).not.toMatch(/It was with/);
    });
});

describe("what stays on the booking", () => {
    it("keeps its payment, deposit invoice and pay link, pack credit, waitlist place and terms", async () => {
        const booking = await bookWith(staff.asha);
        await prisma.booking.update({
            where: { id: booking.id },
            data: { paidWith: "PACK" },
        });
        const pack = await prisma.classPack.create({
            data: {
                organizationId: orgId,
                name: "5-visit pack",
                credits: 5,
                validityDays: 365,
                price: "3500.00",
                currency: "INR",
                status: "ACTIVE",
            },
        });
        const purchase = await prisma.packPurchase.create({
            data: {
                organizationId: orgId,
                packId: pack.id,
                contactId: booking.contactId!,
                credits: 5,
                price: "3500.00",
                currency: "INR",
                expiresAt: new Date(Date.now() + 300 * 86_400_000),
            },
        });
        const redemption = await prisma.packRedemption.create({
            data: {
                organizationId: orgId,
                purchaseId: purchase.id,
                bookingId: booking.id,
            },
        });
        const invoice = await prisma.invoice.create({
            data: {
                organizationId: orgId,
                status: "ISSUED",
                number: `DEP-${booking.id.slice(-6)}`,
                kind: "INVOICE",
                source: "BOOKING",
                bookingId: booking.id,
                contactId: booking.contactId,
                billToName: "Kabir Singh",
                billToEmail: booking.bookerEmail,
                currency: "INR",
                subtotal: "400",
                total: "400",
                issuedAt: new Date(),
                lines: {
                    create: {
                        organizationId: orgId,
                        position: 0,
                        description: "Deposit",
                        quantity: 1,
                        unitPrice: "400",
                        amount: "400",
                    },
                },
            },
        });
        const waiting = await prisma.classWaitlistEntry.create({
            data: {
                organizationId: orgId,
                serviceId: physio,
                startAt: booking.startAt,
                endAt: booking.endAt,
                contactId: booking.contactId!,
                position: 1,
                status: "ACCEPTED",
                closedAt: new Date(),
                bookingId: booking.id,
            },
        });
        const before = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        const invoiceBefore = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoice.id },
        });

        await bookings.reassignBooking(owner, booking.id, {
            staffId: staff.meera,
        });

        const after = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(after.staffId).toBe(staff.meera);
        const keep = (b: Booking) => ({
            status: b.status,
            paidWith: b.paidWith,
            subscriptionId: b.subscriptionId,
            contactId: b.contactId,
            freeCancelUntil: b.freeCancelUntil,
            snapshot: b.snapshot,
            courseEnrollmentId: b.courseEnrollmentId,
            orderId: b.orderId,
            startAt: b.startAt,
        });
        expect(keep(after)).toEqual(keep(before));
        expect(
            await prisma.invoice.findUniqueOrThrow({
                where: { id: invoice.id },
            }),
        ).toEqual(invoiceBefore);
        expect(
            await prisma.packRedemption.findUniqueOrThrow({
                where: { id: redemption.id },
            }),
        ).toEqual(redemption);
        expect(
            await prisma.classWaitlistEntry.findUniqueOrThrow({
                where: { id: waiting.id },
            }),
        ).toEqual(waiting);
        // Nothing was cancelled or booked again.
        expect(
            await prisma.booking.count({
                where: { contactId: booking.contactId },
            }),
        ).toBe(1);
    });
});

describe("who may", () => {
    it("lets a Member hand over their own booking", async () => {
        const booking = await bookWith(staff.asha);
        const moved = await bookings.reassignBooking(ashaCtx, booking.id, {
            staffId: staff.meera,
        });
        expect(moved.staffId).toBe(staff.meera);
    });

    it("lets a Member take a booking that has nobody, for themselves only", async () => {
        const booking = await bookWith(null);
        await expect(
            bookings.reassignBooking(ashaCtx, booking.id, {
                staffId: staff.meera,
            }),
        ).rejects.toThrow(TAKE_ONLY_YOURSELF);
        const taken = await bookings.reassignBooking(ashaCtx, booking.id, {
            staffId: staff.asha,
        });
        expect(taken.staffId).toBe(staff.asha);
    });

    it("refuses a Member giving away someone else's booking", async () => {
        const booking = await bookWith(staff.meera);
        const error = await bookings
            .reassignBooking(ashaCtx, booking.id, { staffId: staff.ravi })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as Error).message).toBe(NOT_YOURS_TO_REASSIGN);
        // Not even to themselves.
        await expect(
            bookings.reassignBooking(ashaCtx, booking.id, {
                staffId: staff.asha,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets a role with service:write give anyone's booking to anyone", async () => {
        const booking = await bookWith(staff.meera);
        const lead: OrganizationContext = {
            organizationId: orgId,
            userId: ashaCtx.userId,
            role: "MEMBER",
            roleKey: "lead-1157",
            actions: resolveCapabilities("lead-1157", [
                "booking:write",
                "service:write",
            ]),
        };
        const moved = await bookings.reassignBooking(lead, booking.id, {
            staffId: staff.ravi,
        });
        expect(moved.staffId).toBe(staff.ravi);
    });

    it("keeps Calendar only to their own diary", async () => {
        const theirs = await bookWith(staff.kiran);
        const moved = await bookings.reassignBooking(kiranCtx, theirs.id, {
            staffId: staff.meera,
        });
        expect(moved.staffId).toBe(staff.meera);
        const someoneElses = await bookWith(staff.asha);
        await expect(
            bookings.reassignBooking(kiranCtx, someoneElses.id, {
                staffId: staff.kiran,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses a Reviewer, who can't change bookings", async () => {
        const booking = await bookWith(staff.asha);
        await expect(
            bookings.reassignBooking(reviewer, booking.id, {
                staffId: staff.meera,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            bookings.reassignCandidates(reviewer, booking.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("is a 404 for another business's booking or person", async () => {
        await expect(
            bookings.reassignBooking(owner, rivalBookingId, {
                staffId: staff.meera,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        const booking = await bookWith(staff.asha);
        await expect(
            bookings.reassignBooking(owner, booking.id, {
                staffId: rivalPerson,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            bookings.reassignBooking(rival, booking.id, {
                staffId: rivalPerson,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            bookings.reassignCandidates(rival, booking.id),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("the picker's read", () => {
    it("says who is free, who is booked then (and when) and who is off", async () => {
        const week = 43;
        await bookWith(staff.meera, 10, week);
        const booking = await bookWith(staff.asha, 10, week);
        await prisma.staffTimeOff.create({
            data: {
                organizationId: orgId,
                staffId: staff.ravi,
                startAt: monday(0, 0, week),
                endAt: monday(23, 0, week),
            },
        });
        const read = await bookings.reassignCandidates(owner, booking.id);
        expect(read.startAt).toBe(booking.startAt.toISOString());
        const byId = new Map(read.people.map((p) => [p.id, p]));
        expect(byId.get(staff.asha)?.state).toBe("current");
        expect(byId.get(staff.kiran)?.state).toBe("free");
        expect(byId.get(staff.meera)).toMatchObject({
            state: "busy",
            busyFrom: monday(10, 0, week).toISOString(),
            busyTo: monday(11, 0, week).toISOString(),
        });
        expect(byId.get(staff.ravi)?.state).toBe("off");
        // Current first, then free, busy, off.
        expect(read.people.map((p) => p.state)).toEqual([
            "current",
            "free",
            "busy",
            "off",
        ]);

        // At another time Meera is free.
        const later = await bookings.reassignCandidates(
            owner,
            booking.id,
            monday(14, 0, week).toISOString(),
        );
        expect(later.people.find((p) => p.id === staff.meera)?.state).toBe(
            "free",
        );
    });
});
