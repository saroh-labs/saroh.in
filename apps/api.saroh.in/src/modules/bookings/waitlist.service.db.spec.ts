/**
 * The class waitlist against a real Postgres (round-2 A12, R13; defaults 9
 * and 76): a full class offers its line, a freed place is held for the
 * first in line and counts as taken for everyone else, the person offered
 * it books it through the normal path, an unanswered offer passes to the
 * next, and a cancelled class closes its line.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { loadSubject } from "../site-accounts/customer-notify.handler";
import { BookingsService } from "./bookings.service";
import type { SignedInCustomer } from "./public-bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import { mergeWaitlistInTx } from "./waitlist-merge";
import { expireLapsedOffers } from "./waitlist-offer";
import { WaitlistOfferHandler } from "./waitlist-offer.handler";
import { OFFER_HOLD_MS, WAITLIST_WORDS } from "./waitlist-rules";
import { WaitlistService } from "./waitlist.service";

const bookings = new BookingsService();
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const waitlist = new WaitlistService();
const offers = new WaitlistOfferHandler();

const MONDAY = 1;
let owner: OrganizationContext;
let people = 0;
let keys = 0;
let services = 0;

/** The Monday `weeksOut` weeks ahead, at `hour`:00 UTC. */
function nextMonday(hour: number, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour);
    return d;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `a12-waitlist-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `a12-desk-${process.pid}@example.com` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
});

/** A class of `capacity` places on Monday mornings, 07:00–08:00 UTC. */
async function classOf(capacity: number): Promise<string> {
    services += 1;
    const service = await prisma.service.create({
        data: {
            organizationId: owner.organizationId,
            name: `HIIT ${services}`,
            durationMinutes: 60,
            capacity,
            priceCents: 50_000,
            currency: "INR",
            timezone: "UTC",
            availabilityRules: {
                create: {
                    organizationId: owner.organizationId,
                    dayOfWeek: MONDAY,
                    startMinute: 7 * 60,
                    endMinute: 8 * 60,
                },
            },
        },
    });
    return service.id;
}

/** A signed-in customer of the business: a contact and its site account. */
async function customer(first = "Sneha"): Promise<SignedInCustomer> {
    people += 1;
    const email = `a12-person-${people}-${process.pid}@example.in`;
    const contact = await prisma.contact.create({
        data: {
            organizationId: owner.organizationId,
            email,
            firstName: first,
            lastName: `Pillai ${people}`,
        },
    });
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: owner.organizationId,
            contactId: contact.id,
            email,
            emailVerifiedAt: new Date(),
        },
    });
    return {
        organizationId: owner.organizationId,
        accountId: account.id,
        contactId: contact.id,
    };
}

/** Book the session signed in, to pay at the desk. */
function book(who: SignedInCustomer, serviceId: string, startAt: Date) {
    return publicBookings.bookOnline(
        serviceId,
        {
            startAt: startAt.toISOString(),
            bookerEmail: "",
            idempotencyKey: `a12-${++keys}`,
            pay: "DESK",
        },
        undefined,
        new Date(),
        who,
    );
}

/** A class of `capacity`, filled by new customers. Returns who booked. */
async function fullClass(capacity: number, startAt: Date) {
    const serviceId = await classOf(capacity);
    const booked = [];
    for (let i = 0; i < capacity; i += 1) {
        const who = await customer();
        booked.push({
            who,
            booking: (await book(who, serviceId, startAt)).booking,
        });
    }
    return { serviceId, booked };
}

function entryOf(who: SignedInCustomer, serviceId: string, startAt: Date) {
    return prisma.classWaitlistEntry.findFirstOrThrow({
        where: { contactId: who.contactId, serviceId, startAt },
        orderBy: { createdAt: "desc" },
    });
}

function offerJobs(serviceId: string) {
    return prisma.job.findMany({
        where: {
            organizationId: owner.organizationId,
            type: "waitlist.offer",
            payload: { path: ["serviceId"], equals: serviceId },
        },
        orderBy: { createdAt: "asc" },
    });
}

function noticeJobs(entryId: string) {
    return prisma.job.findMany({
        where: {
            organizationId: owner.organizationId,
            type: "customer.notify",
            payload: { path: ["waitlistEntryId"], equals: entryId },
        },
    });
}

function runOffer(serviceId: string, startAt: Date, now = new Date()) {
    return offers.offer(
        owner.organizationId,
        { serviceId, startAt: startAt.toISOString() },
        now,
    );
}

async function refusal(p: Promise<unknown>): Promise<{
    status: number;
    message: string;
    reason?: string;
}> {
    try {
        await p;
    } catch (err) {
        const e = err as ConflictException;
        const body = e.getResponse() as
            string | { message: string; details?: { reason?: string } };
        return typeof body === "string"
            ? { status: e.getStatus(), message: body }
            : {
                  status: e.getStatus(),
                  message: body.message,
                  reason: body.details?.reason,
              };
    }
    throw new Error("expected a refusal");
}

describe("the class waitlist (A12)", () => {
    it("a freed place is offered to the first in line, who books it", async () => {
        const at = nextMonday(7);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer("Bina");
        const c = await customer("Chetan");

        const joinedB = await waitlist.join(b, serviceId, at.toISOString());
        const joinedC = await waitlist.join(c, serviceId, at.toISOString());
        expect(joinedB).toMatchObject({ status: "WAITING", placeInLine: 1 });
        expect(joinedC).toMatchObject({ status: "WAITING", placeInLine: 2 });
        // Nothing is sent: no provider, and the thread isn't live.
        expect(joinedB.reach).toBe("NONE");

        // A place frees: the cancel queues an offer for the session.
        await bookings.cancelBooking(owner, booked[0].booking.id);
        expect(await offerJobs(serviceId)).toHaveLength(1);

        expect(await runOffer(serviceId, at)).toBe(1);
        const offered = await entryOf(b, serviceId, at);
        expect(offered.status).toBe("OFFERED");
        expect(offered.offeredUntil).not.toBeNull();
        // Held for 2 hours: the class is days away.
        expect(
            offered.offeredUntil!.getTime() - offered.offeredAt!.getTime(),
        ).toBe(OFFER_HOLD_MS);
        // Told once, through customer.notify, keyed to the entry.
        const notices = await noticeJobs(offered.id);
        expect(notices).toHaveLength(1);
        expect(notices[0].payload).toMatchObject({
            kind: "WAITLIST_OFFER",
            eventKey: `waitlist:${offered.id}`,
        });
        // And the offer's own expiry is queued, for when it runs out.
        const jobs = await offerJobs(serviceId);
        expect(jobs.at(-1)?.runAt.getTime()).toBe(
            offered.offeredUntil!.getTime(),
        );
        expect((await entryOf(c, serviceId, at)).status).toBe("WAITING");

        // What the notice says, read when it runs.
        const subject = await prisma.$transaction((tx) =>
            loadSubject(tx, owner.organizationId, {
                kind: "WAITLIST_OFFER",
                eventKey: `waitlist:${offered.id}`,
                waitlistEntryId: offered.id,
            }),
        );
        expect(subject?.contactId).toBe(b.contactId);
        expect(subject?.vars).toMatchObject({
            kind: "WAITLIST_OFFER",
            waitlist: { firstName: "Bina", heldUntil: offered.offeredUntil },
        });

        // B sees it held on the booking page, and books it.
        expect((await waitlist.mine(b, serviceId)).places).toEqual([
            expect.objectContaining({ status: "OFFERED", placeInLine: null }),
        ]);
        const { booking } = await book(b, serviceId, at);
        expect(booking.status).toBe("CONFIRMED");
        const accepted = await entryOf(b, serviceId, at);
        expect(accepted).toMatchObject({
            status: "ACCEPTED",
            bookingId: booking.id,
        });
        // C is now first in line.
        expect((await waitlist.mine(c, serviceId)).places).toEqual([
            expect.objectContaining({ status: "WAITING", placeInLine: 1 }),
        ]);
    });

    it("the offered place counts as taken, so nobody else can book it", async () => {
        // Inside the booking page's two weeks.
        const at = nextMonday(7);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        await bookings.cancelBooking(owner, booked[0].booking.id);
        await runOffer(serviceId, at);

        // Another customer on the booking page: full.
        const d = await customer();
        await expect(book(d, serviceId, at)).rejects.toBeInstanceOf(
            ConflictException,
        );
        // The desk booking by hand: full too.
        await expect(
            bookings.bookByHand(owner, serviceId, {
                startAt: at.toISOString(),
                bookerName: "Walk In",
                bookerEmail: `a12-walkin-${process.pid}@example.in`,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        // The booking page reads it as full.
        const days = await publicBookings.publicDays(serviceId);
        const start = days.days
            .flatMap((d) => d.starts)
            .find((s) => s.startAt === at.toISOString());
        expect(start?.placesLeft).toBe(0);
    });

    it("an unanswered offer runs out and passes to the next in line", async () => {
        const at = nextMonday(7, 3);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        const c = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        await waitlist.join(c, serviceId, at.toISOString());
        await bookings.cancelBooking(owner, booked[0].booking.id);
        await runOffer(serviceId, at);
        const offeredB = await entryOf(b, serviceId, at);

        // The offer's delayed job runs once it has run out.
        const later = new Date(offeredB.offeredUntil!.getTime() + 1_000);
        expect(await runOffer(serviceId, at, later)).toBe(1);
        expect((await entryOf(b, serviceId, at)).status).toBe("EXPIRED");
        expect((await entryOf(c, serviceId, at)).status).toBe("OFFERED");
        // B's notice, read now, tells nobody: it isn't held any more.
        expect(
            await prisma.$transaction((tx) =>
                loadSubject(
                    tx,
                    owner.organizationId,
                    {
                        kind: "WAITLIST_OFFER",
                        eventKey: `waitlist:${offeredB.id}`,
                        waitlistEntryId: offeredB.id,
                    },
                    later,
                ),
            ),
        ).toBeNull();
    });

    it("the sweep ends a lapsed offer and queues the next", async () => {
        const at = nextMonday(7, 4);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        const c = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        await waitlist.join(c, serviceId, at.toISOString());
        await bookings.cancelBooking(owner, booked[0].booking.id);
        await runOffer(serviceId, at);
        const offeredB = await entryOf(b, serviceId, at);
        const before = (await offerJobs(serviceId)).length;

        const later = new Date(offeredB.offeredUntil!.getTime() + 1_000);
        expect(await expireLapsedOffers(later)).toBeGreaterThanOrEqual(1);
        expect((await entryOf(b, serviceId, at)).status).toBe("EXPIRED");
        expect((await offerJobs(serviceId)).length).toBe(before + 1);
    });

    it("two places free at once make two offers", async () => {
        const at = nextMonday(7, 5);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        const c = await customer();
        const d = await customer();
        for (const who of [b, c, d]) {
            await waitlist.join(who, serviceId, at.toISOString());
        }
        await bookings.cancelBooking(owner, booked[0].booking.id);
        await bookings.cancelBooking(owner, booked[1].booking.id);
        expect(await runOffer(serviceId, at)).toBe(2);
        expect((await entryOf(b, serviceId, at)).status).toBe("OFFERED");
        expect((await entryOf(c, serviceId, at)).status).toBe("OFFERED");
        expect((await entryOf(d, serviceId, at)).status).toBe("WAITING");
        // Run again: nothing more is free.
        expect(await runOffer(serviceId, at)).toBe(0);
    });

    it("makes no offer inside the hour before the class", async () => {
        const at = nextMonday(7, 6);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        await bookings.cancelBooking(owner, booked[0].booking.id);
        const late = new Date(at.getTime() - 30 * 60_000);
        expect(await runOffer(serviceId, at, late)).toBe(0);
        expect((await entryOf(b, serviceId, at)).status).toBe("WAITING");
    });

    it("holds an offer until an hour before the class when that is sooner", async () => {
        const at = nextMonday(7, 7);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        await bookings.cancelBooking(owner, booked[0].booking.id);
        const now = new Date(at.getTime() - 90 * 60_000);
        await runOffer(serviceId, at, now);
        expect((await entryOf(b, serviceId, at)).offeredUntil).toEqual(
            new Date(at.getTime() - 60 * 60_000),
        );
    });

    it("refuses to join a class with room, a class already held, or past ten", async () => {
        const at = nextMonday(7, 8);
        const serviceId = await classOf(2);
        const b = await customer();
        expect(
            await refusal(waitlist.join(b, serviceId, at.toISOString())),
        ).toMatchObject({
            status: 409,
            message: WAITLIST_WORDS.room,
            reason: "room",
        });

        const { serviceId: full, booked } = await fullClass(2, at);
        expect(
            await refusal(waitlist.join(booked[0].who, full, at.toISOString())),
        ).toMatchObject({ status: 409, reason: "already-booked" });

        // Ten full classes on one account, then an eleventh.
        const busy = await customer();
        for (let week = 9; week < 19; week += 1) {
            const when = nextMonday(7, week);
            const { serviceId: s } = await fullClass(2, when);
            await waitlist.join(busy, s, when.toISOString());
        }
        const eleventh = nextMonday(7, 19);
        const { serviceId: s11 } = await fullClass(2, eleventh);
        expect(
            await refusal(waitlist.join(busy, s11, eleventh.toISOString())),
        ).toMatchObject({
            status: 409,
            message: WAITLIST_WORDS.tooMany,
            reason: "too-many",
        });
    });

    it("joining twice answers the same place", async () => {
        const at = nextMonday(7, 20);
        const { serviceId } = await fullClass(2, at);
        const b = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        const again = await waitlist.join(b, serviceId, at.toISOString());
        expect(again).toMatchObject({ status: "WAITING", placeInLine: 1 });
        expect(
            await prisma.classWaitlistEntry.count({
                where: { serviceId, contactId: b.contactId },
            }),
        ).toBe(1);
    });

    it("leaving a held place offers it to the next in line", async () => {
        const at = nextMonday(7, 21);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        const c = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        await waitlist.join(c, serviceId, at.toISOString());
        await bookings.cancelBooking(owner, booked[0].booking.id);
        await runOffer(serviceId, at);
        const before = (await offerJobs(serviceId)).length;

        expect(await waitlist.leave(b, serviceId, at.toISOString())).toEqual({
            left: true,
        });
        expect((await entryOf(b, serviceId, at)).status).toBe("LEFT");
        expect((await offerJobs(serviceId)).length).toBe(before + 1);
        expect(await runOffer(serviceId, at)).toBe(1);
        expect((await entryOf(c, serviceId, at)).status).toBe("OFFERED");
        // Leaving a line they aren't in is not an error.
        expect(await waitlist.leave(b, serviceId, at.toISOString())).toEqual({
            left: false,
        });
    });

    it("a cancelled class closes its line and offers nothing", async () => {
        const at = nextMonday(7, 22);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        await bookings.cancelBooking(owner, booked[0].booking.id, undefined, {
            returnCredit: true,
            closesClass: true,
        });
        expect((await entryOf(b, serviceId, at)).status).toBe("CLOSED");
        expect(await offerJobs(serviceId)).toHaveLength(0);
    });

    it("moving a booking away offers its old place", async () => {
        const at = nextMonday(7, 23);
        const to = nextMonday(7, 24);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer();
        await waitlist.join(b, serviceId, at.toISOString());
        await bookings.rescheduleBooking(owner, booked[0].booking.id, {
            startAt: to.toISOString(),
        });
        expect(await offerJobs(serviceId)).toHaveLength(1);
        expect(await runOffer(serviceId, at)).toBe(1);
    });

    it("lists the line for the team, the held place first", async () => {
        const at = nextMonday(7, 25);
        const { serviceId, booked } = await fullClass(2, at);
        const b = await customer("Bina");
        const c = await customer("Chetan");
        await waitlist.join(b, serviceId, at.toISOString());
        await waitlist.join(c, serviceId, at.toISOString());
        await bookings.cancelBooking(owner, booked[0].booking.id);
        await runOffer(serviceId, at);

        const { rows } = await waitlist.roster(
            owner,
            serviceId,
            at.toISOString(),
        );
        expect(rows.map((r) => [r.name?.split(" ")[0], r.status])).toEqual([
            ["Bina", "OFFERED"],
            ["Chetan", "WAITING"],
        ]);
    });

    it("a merge keeps the better place of two in one class", async () => {
        const at = nextMonday(7, 26);
        const { serviceId, booked } = await fullClass(2, at);
        const survivor = await customer();
        const other = await customer();
        await waitlist.join(survivor, serviceId, at.toISOString());
        await waitlist.join(other, serviceId, at.toISOString());
        // The survivor joined first: its place is the earlier one.
        await prisma.$transaction((tx) =>
            mergeWaitlistInTx(tx, {
                organizationId: owner.organizationId,
                from: other.contactId,
                to: survivor.contactId,
                now: new Date(),
            }),
        );
        const live = await prisma.classWaitlistEntry.findMany({
            where: {
                serviceId,
                contactId: survivor.contactId,
                status: { in: ["WAITING", "OFFERED"] },
            },
        });
        expect(live).toHaveLength(1);
        expect(live[0].position).toBe(1);
        void booked;
    });
});
