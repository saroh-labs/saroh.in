/**
 * Bookings on a phone, the API (#1017, DEC-170; owner's answers of 19 Oct)
 * against a real Postgres:
 *
 * - a caller who gives a name and phone is booked, kept by that phone as a
 *   walk-in is for orders; the same phone books the customer who has it;
 * - the front desk (a Member) books, marks who came, moves and cancels,
 *   and takes no money; a Reviewer changes nothing, and Calendar only
 *   changes only its own diary;
 * - "Paid now" says how, written with the booking in one transaction;
 * - a service only customers book is refused to the team.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and with
 * TEST_RLS=on.
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import {
    backendPid,
    waitUntilAdvisoryBlockedBy,
} from "../../../test/lock-wait";
import type { OrganizationContext } from "../../common/types/organization-context";
import { isReservedContactEmail } from "../contacts/contact-email";
import { lockWalkInPhone } from "../orders/walk-in-customer";
import { resolveCapabilities } from "../organizations/organization-policy";
import { StaffService } from "../staff/staff.service";
import { BookingEventType } from "./booking-event-type";
import { BookingsService } from "./bookings.service";
import { NO_BOOKER_MESSAGE } from "./hand-booker";
import { TREATMENT_NEEDS_EMAIL } from "./visits";

const bookings = new BookingsService();
const staff = new StaffService();
const tag = `${process.pid}-${Date.now()}`;
const DAY = 86_400_000;

let owner: OrganizationContext;
let member: OrganizationContext;
let reviewer: OrganizationContext;
let calendarOnly: OrganizationContext;
let rival: OrganizationContext;
let orgId = "";
let facialId = "";
let freeId = "";
let raviStaffId = "";
let day = 0;

/** 09:00 UTC on a day of its own, so no two tests clash. */
function nextStart(hour = 9): string {
    day += 1;
    const d = new Date(Date.now() + (day + 2) * DAY);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
}

/** A service open all day, every day, in UTC. */
async function makeService(
    name: string,
    over: { priceCents?: number | null; visits?: number } = {},
): Promise<string> {
    return (
        await prisma.service.create({
            data: {
                organizationId: orgId,
                name,
                durationMinutes: 60,
                capacity: 1,
                timezone: "UTC",
                status: "ACTIVE",
                priceCents:
                    over.priceCents === undefined ? 120_000 : over.priceCents,
                currency: "INR",
                visits: over.visits ?? 1,
                availabilityRules: {
                    create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                        organizationId: orgId,
                        dayOfWeek,
                        startMinute: 0,
                        endMinute: 1440,
                    })),
                },
            },
        })
    ).id;
}

async function contactsWithPhone(digits: string): Promise<number> {
    const rows = await prisma.contact.findMany({
        where: { organizationId: orgId },
        select: { phone: true },
    });
    return rows.filter((r) =>
        (r.phone ?? "").replace(/\D/g, "").endsWith(digits),
    ).length;
}

beforeAll(async () => {
    const [org, other] = await Promise.all([
        prisma.organization.create({
            data: { name: "Glow Studio", slug: `bk-u1-${tag}` },
        }),
        prisma.organization.create({
            data: { name: "Another salon", slug: `bk-u1-o-${tag}` },
        }),
    ]);
    orgId = org.id;
    await giveBusinessDetails(orgId);
    const [ownerUser, memberUser, reviewerUser, raviUser] = await Promise.all(
        ["owner", "member", "reviewer", "ravi"].map((who) =>
            prisma.user.create({
                data: { email: `bk-u1-${who}-${tag}@example.com` },
            }),
        ),
    );
    owner = { organizationId: orgId, userId: ownerUser.id, role: "OWNER" };
    // The built-in roles, with their shipped permissions.
    member = { organizationId: orgId, userId: memberUser.id, role: "MEMBER" };
    reviewer = {
        organizationId: orgId,
        userId: reviewerUser.id,
        role: "REVIEWER",
    };
    rival = { organizationId: other.id, userId: ownerUser.id, role: "OWNER" };

    facialId = await makeService("Facial");
    freeId = await makeService("Free consult", { priceCents: null });

    // Ravi takes bookings and signs in as Calendar only (#868).
    const ravi = await prisma.membership.create({
        data: {
            organizationId: orgId,
            userId: raviUser.id,
            role: "calendar-only",
        },
    });
    raviStaffId = (await staff.create(owner, { name: "Ravi" })).id;
    await prisma.staffMember.update({
        where: { id: raviStaffId },
        data: { membershipId: ravi.id },
    });
    calendarOnly = {
        organizationId: orgId,
        userId: raviUser.id,
        role: "MEMBER",
        roleKey: "calendar-only",
        actions: resolveCapabilities("calendar-only"),
    };
});

describe("booking a caller with a name and phone (DEC-170)", () => {
    it("books them with a name and phone only: the customer has that phone and no email", async () => {
        const booked = await bookings.bookByHand(owner, facialId, {
            startAt: nextStart(),
            bookerName: "Kiran Shah",
            bookerPhone: "+91 98450 11111",
        });
        // Kept as the one phone rule keeps it (#1036): E.164.
        expect(booked).toMatchObject({
            status: "CONFIRMED",
            bookerName: "Kiran Shah",
            bookerPhone: "+919845011111",
            bookerEmail: null,
        });
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: booked.contactId ?? "" },
        });
        expect(contact).toMatchObject({
            organizationId: orgId,
            firstName: "Kiran",
            lastName: "Shah",
            phone: "+919845011111",
            source: "manual",
        });
        // Kept by their phone: the placeholder every reader treats as none.
        expect(isReservedContactEmail(contact.email)).toBe(true);
        const snapshot = booked.snapshot as { booker: { email: unknown } };
        expect(snapshot.booker.email).toBeNull();
    });

    it("the same phone books the customer who has it, written any way, and makes no duplicate", async () => {
        const first = await bookings.bookByHand(owner, facialId, {
            startAt: nextStart(),
            bookerName: "Leela Menon",
            bookerPhone: "98450 22222",
        });
        const again = await bookings.bookByHand(member, facialId, {
            startAt: nextStart(),
            bookerName: "Leela M",
            bookerPhone: "+91-98450-22222",
        });
        expect(again.contactId).toBe(first.contactId);
        // As they stand: the name they were saved with.
        expect(again.bookerName).toBe("Leela Menon");
        expect(await contactsWithPhone("9845022222")).toBe(1);
    });

    it("a phone already a customer's with an email books them, email and all", async () => {
        const asha = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `asha-${tag}@example.com`,
                firstName: "Asha",
                phone: "9845033333",
            },
        });
        const booked = await bookings.bookByHand(owner, facialId, {
            startAt: nextStart(),
            bookerName: "Someone else",
            bookerPhone: "+91 98450 33333",
        });
        expect(booked).toMatchObject({
            contactId: asha.id,
            bookerName: "Asha",
            bookerEmail: `asha-${tag}@example.com`,
        });
        expect(await contactsWithPhone("9845033333")).toBe(1);
    });

    it("an email and a phone of two different customers: the email wins, as today", async () => {
        const byEmail = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `nisha-${tag}@example.com`,
                firstName: "Nisha",
            },
        });
        await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `other-${tag}@example.com`,
                firstName: "Other",
                phone: "9845044444",
            },
        });
        const booked = await bookings.bookByHand(owner, facialId, {
            startAt: nextStart(),
            bookerEmail: `nisha-${tag}@example.com`,
            bookerPhone: "9845044444",
        });
        expect(booked.contactId).toBe(byEmail.id);
    });

    it("two bookings for one new number at once make one customer", async () => {
        const [a, b] = await Promise.allSettled([
            bookings.bookByHand(owner, facialId, {
                startAt: nextStart(),
                bookerName: "Ravi Kumar",
                bookerPhone: "9845055555",
            }),
            bookings.bookByHand(owner, facialId, {
                startAt: nextStart(),
                bookerName: "Ravi Kumar",
                bookerPhone: "9845055555",
            }),
        ]);
        const made = [a, b].filter((r) => r.status === "fulfilled");
        expect(made.length).toBeGreaterThanOrEqual(1);
        expect(await contactsWithPhone("9845055555")).toBe(1);
    });

    it("a contact saved with a trunk 0 or 0091 is found by the number in E.164, and the other way round", async () => {
        const trunk = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `trunk-${tag}@example.com`,
                firstName: "Trunk",
                phone: "098450 99991",
            },
        });
        const intl = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `intl-${tag}@example.com`,
                firstName: "Intl",
                phone: "0091 98450 99993",
            },
        });
        const e164 = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `e164-${tag}@example.com`,
                firstName: "Plus",
                phone: "+919845099992",
            },
        });
        for (const [typed, who] of [
            ["+91 98450 99991", trunk.id],
            ["+919845099993", intl.id],
            ["098450 99992", e164.id],
            ["0091 98450 99992", e164.id],
        ] as const) {
            const booked = await bookings.bookByHand(owner, facialId, {
                startAt: nextStart(),
                bookerName: "Someone",
                bookerPhone: typed,
            });
            expect(booked.contactId).toBe(who);
        }
        for (const digits of ["9845099991", "9845099992", "9845099993"]) {
            expect(await contactsWithPhone(digits)).toBe(1);
        }
    });

    it("a phone the rule can't read is refused on bookerPhone, in its words", async () => {
        await expect(
            bookings.bookByHand(owner, facialId, {
                startAt: nextStart(),
                bookerName: "Someone",
                bookerPhone: "98765",
            }),
        ).rejects.toMatchObject({
            response: {
                field: "bookerPhone",
                message: expect.stringContaining("+91 98450 12345"),
            },
        });
    });

    it("a walk-in order making the number's customer mid-booking: one customer, the booking on it", async () => {
        const key = "9845012121";
        let booking: Promise<{ contactId: string | null }> | undefined;
        let made = "";
        // The order holds the phone's lock, as New order does, while the
        // booking starts; it makes the customer and commits.
        await prisma.$transaction(async (tx) => {
            await lockWalkInPhone(tx, orgId, key);
            const holder = await backendPid(tx);
            booking = bookings.bookByHand(owner, facialId, {
                startAt: nextStart(),
                bookerName: "Walk In",
                bookerPhone: "+91 98450 12121",
            });
            // The booking's transaction has its snapshot and now waits on
            // the phone's lock.
            await waitUntilAdvisoryBlockedBy(holder);
            made = (
                await tx.contact.create({
                    data: {
                        organizationId: orgId,
                        email: `walkin-${tag}@example.com`,
                        firstName: "Walk",
                        phone: "+919845012121",
                    },
                })
            ).id;
        });
        await expect(booking).resolves.toMatchObject({ contactId: made });
        expect(await contactsWithPhone(key)).toBe(1);
    });

    it("no customer, no email and no phone: a clear message naming the phone", async () => {
        const before = await prisma.booking.count({
            where: { organizationId: orgId },
        });
        const refusal = bookings.bookByHand(owner, facialId, {
            startAt: nextStart(),
        });
        await expect(refusal).rejects.toBeInstanceOf(BadRequestException);
        await expect(refusal).rejects.toMatchObject({
            response: { message: NO_BOOKER_MESSAGE, field: "bookerPhone" },
        });
        expect(
            await prisma.booking.count({ where: { organizationId: orgId } }),
        ).toBe(before);
    });

    it("a treatment still needs an email for its bill", async () => {
        await prisma.store.create({
            data: {
                organizationId: orgId,
                name: "Glow Studio",
                slug: `bk-u1-store-${tag}`,
            },
        });
        const peel = await makeService("Peel course", { visits: 3 });
        await expect(
            bookings.bookByHand(owner, peel, {
                startAt: nextStart(),
                bookerName: "Kiran Shah",
                bookerPhone: "9845011111",
            }),
        ).rejects.toMatchObject({
            response: { message: TREATMENT_NEEDS_EMAIL, field: "bookerEmail" },
        });
    });
});

describe("the front desk (DEC-170, Q13)", () => {
    it("a Member books, marks Came, moves and cancels", async () => {
        const booked = await bookings.bookByHand(member, facialId, {
            startAt: nextStart(),
            bookerName: "Meera Iyer",
            bookerPhone: "9845066666",
            paidWith: "DESK",
        });
        expect(booked.paidWith).toBe("DESK");

        const later = nextStart(11);
        const moved = await bookings.rescheduleBooking(member, booked.id, {
            startAt: later,
        });
        expect(moved.startAt.toISOString()).toBe(later);

        await bookings.recordOutcome(
            member,
            booked.id,
            "ATTENDED",
            new Date(Date.parse(later) + 2 * 3_600_000),
        );
        const came = await prisma.booking.findUniqueOrThrow({
            where: { id: booked.id },
        });
        expect(came.outcome).toBe("ATTENDED");

        const second = await bookings.bookByHand(member, facialId, {
            startAt: nextStart(),
            bookerName: "Meera Iyer",
            bookerPhone: "9845066666",
        });
        const cancelled = await bookings.cancelBooking(member, second.id);
        expect(cancelled.status).toBe("CANCELLED");
        // The history names the Member who did it.
        const events = await prisma.bookingEvent.findMany({
            where: { bookingId: booked.id },
            select: { type: true, actorUserId: true },
        });
        expect(events).toContainEqual({
            type: BookingEventType.Booked,
            actorUserId: member.userId,
        });
    });

    it("a Member can't take a payment, send a payment link or say Paid now", async () => {
        const booked = await bookings.bookByHand(member, facialId, {
            startAt: nextStart(),
            bookerName: "Meera Iyer",
            bookerPhone: "9845066666",
            paidWith: "DESK",
        });
        await expect(
            bookings.takeDeskPayment(member, booked.id, {
                method: "CASH",
                amountCents: 120_000,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            bookings.payLink(member, booked.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            bookings.bookByHand(member, facialId, {
                startAt: nextStart(),
                bookerName: "Meera Iyer",
                bookerPhone: "9845066666",
                paidWith: "PAID",
                paidBy: "UPI",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(
            await prisma.invoice.count({ where: { bookingId: booked.id } }),
        ).toBe(0);
    });

    it("a Member gets a 404 for another business's booking", async () => {
        const theirsService = (
            await prisma.service.create({
                data: {
                    organizationId: rival.organizationId,
                    name: "Theirs",
                    durationMinutes: 60,
                    timezone: "UTC",
                },
            })
        ).id;
        const theirs = await prisma.booking.create({
            data: {
                organizationId: rival.organizationId,
                serviceId: theirsService,
                startAt: new Date(nextStart()),
                endAt: new Date(Date.parse(nextStart()) + 3_600_000),
                timezone: "UTC",
                snapshot: {},
            },
        });
        await expect(
            bookings.cancelBooking(member, theirs.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            bookings.bookByHand(member, theirsService, {
                startAt: nextStart(),
                bookerName: "X",
                bookerPhone: "9845077777",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("a Reviewer can't change bookings or hours", async () => {
        const booked = await bookings.bookByHand(owner, facialId, {
            startAt: nextStart(),
            bookerName: "Meera Iyer",
            bookerPhone: "9845066666",
        });
        for (const write of [
            () =>
                bookings.bookByHand(reviewer, facialId, {
                    startAt: nextStart(),
                    bookerName: "X",
                    bookerPhone: "9845088888",
                }),
            () =>
                bookings.rescheduleBooking(reviewer, booked.id, {
                    startAt: nextStart(),
                }),
            () => bookings.recordOutcome(reviewer, booked.id, "NO_SHOW"),
            () => bookings.cancelBooking(reviewer, booked.id),
            () => staff.replaceHours(reviewer, raviStaffId, []),
        ]) {
            await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
        }
        await expect(
            prisma.booking.findUniqueOrThrow({ where: { id: booked.id } }),
        ).resolves.toMatchObject({ status: "CONFIRMED", outcome: null });
    });

    it("Calendar only can't change anyone else's bookings, nor set hours", async () => {
        const someoneElses = await bookings.bookByHand(owner, facialId, {
            startAt: nextStart(),
            bookerName: "Meera Iyer",
            bookerPhone: "9845066666",
        });
        for (const write of [
            () =>
                bookings.rescheduleBooking(calendarOnly, someoneElses.id, {
                    startAt: nextStart(),
                }),
            () =>
                bookings.recordOutcome(
                    calendarOnly,
                    someoneElses.id,
                    "NO_SHOW",
                ),
            () => bookings.cancelBooking(calendarOnly, someoneElses.id),
            () => staff.replaceHours(calendarOnly, raviStaffId, []),
            () =>
                staff.addTimeOff(calendarOnly, raviStaffId, {
                    fromDate: nextStart().slice(0, 10),
                }),
        ]) {
            await expect(write()).rejects.toBeInstanceOf(ForbiddenException);
        }
        await expect(
            prisma.booking.findUniqueOrThrow({
                where: { id: someoneElses.id },
            }),
        ).resolves.toMatchObject({ status: "CONFIRMED", outcome: null });
    });
});

describe("Paid now says how (DEC-170)", () => {
    it("Paid now by UPI: the booking is paid and the payment recorded as UPI, together", async () => {
        const booked = await bookings.bookByHand(owner, facialId, {
            startAt: nextStart(),
            bookerName: "Kiran Shah",
            bookerPhone: "9845011111",
            paidWith: "PAID",
            paidBy: "UPI",
        });
        expect(booked.paidWith).toBe("PAID");
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { bookingId: booked.id, source: "BOOKING" },
        });
        expect(invoice).toMatchObject({
            organizationId: orgId,
            kind: "INVOICE",
            status: "PAID",
            paymentMethod: "UPI",
        });
        expect(String(invoice.total)).toBe("1200");
        const events = await prisma.bookingEvent.findMany({
            where: { bookingId: booked.id },
            select: { type: true },
        });
        expect(events.map((e) => e.type)).toEqual(
            expect.arrayContaining([
                BookingEventType.Booked,
                BookingEventType.PaidAtDesk,
            ]),
        );
        // Nothing left to take at the desk.
        const detail = await bookings.getBooking(owner, booked.id);
        expect(detail.money.dueCents ?? 0).toBe(0);
    });

    it("if the payment fails, no booking is left behind", async () => {
        const start = nextStart();
        const before = await prisma.booking.count({
            where: { serviceId: freeId },
        });
        // Nothing to take on a service with no price: the desk refuses,
        // and the booking goes with it.
        await expect(
            bookings.bookByHand(owner, freeId, {
                startAt: start,
                bookerName: "Kiran Shah",
                bookerPhone: "9845011111",
                paidWith: "PAID",
                paidBy: "CASH",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
            await prisma.booking.count({ where: { serviceId: freeId } }),
        ).toBe(before);
        expect(
            await prisma.invoice.count({
                where: {
                    organizationId: orgId,
                    booking: { serviceId: freeId },
                },
            }),
        ).toBe(0);
        // The time is still free.
        await expect(
            bookings.bookByHand(owner, freeId, {
                startAt: start,
                bookerName: "Kiran Shah",
                bookerPhone: "9845011111",
            }),
        ).resolves.toMatchObject({ status: "CONFIRMED" });
    });
});

describe("Who can book it (Q5)", () => {
    it("a service the team can't book: booking by hand is refused with a clear message", async () => {
        const online = await makeService("Online only facial");
        await bookings.updateService(owner, online, { bookableByTeam: false });
        await expect(
            bookings.bookByHand(owner, online, {
                startAt: nextStart(),
                bookerName: "Kiran Shah",
                bookerPhone: "9845011111",
            }),
        ).rejects.toMatchObject({
            response: {
                message: expect.stringContaining(
                    "Your team can't book Online only facial.",
                ),
                details: { reason: "not-bookable-by-team" },
            },
        });
        expect(
            await prisma.booking.count({ where: { serviceId: online } }),
        ).toBe(0);
    });

    it("a new service is bookable by the team, and the tick is saved and read back", async () => {
        const made = await bookings.createService(owner, {
            name: `Brow shape ${tag}`,
            durationMinutes: 30,
            timezone: "UTC",
        });
        expect(made.bookableByTeam).toBe(true);
        const paused = await bookings.updateService(owner, made.id, {
            bookableByTeam: false,
            showOnBookingPage: false,
        });
        expect(paused).toMatchObject({
            bookableByTeam: false,
            showOnBookingPage: false,
        });
        await expect(
            bookings.updateService(member, made.id, { bookableByTeam: true }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe("New booking's times, the API (U8)", () => {
    it("a class says how many places each start has left; a one-to-one doesn't", async () => {
        const classId = (
            await prisma.service.create({
                data: {
                    organizationId: orgId,
                    name: `Mat Pilates ${tag}`,
                    durationMinutes: 60,
                    capacity: 3,
                    timezone: "UTC",
                    status: "ACTIVE",
                    availabilityRules: {
                        create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                            organizationId: orgId,
                            dayOfWeek,
                            startMinute: 7 * 60,
                            endMinute: 8 * 60,
                        })),
                    },
                },
            })
        ).id;
        const start = nextStart(7);
        await bookings.bookByHand(owner, classId, {
            startAt: start,
            bookerName: "Farah Khan",
            bookerPhone: "+91 98450 77777",
        });
        const from = new Date(Date.parse(start) - DAY).toISOString();
        const to = new Date(Date.parse(start) + DAY).toISOString();
        const slots = await bookings.availability(owner, classId, from, to);
        const booked = slots.find((s) => s.startAt.toISOString() === start);
        expect(booked?.placesLeft).toBe(2);
        expect(
            slots
                .filter((s) => s.startAt.toISOString() !== start)
                .every((s) => s.placesLeft === 3),
        ).toBe(true);

        const one = await bookings.availability(owner, facialId, from, to);
        expect(one.every((s) => s.placesLeft === undefined)).toBe(true);
    });
});
