/**
 * A class the business cancels as a whole, against a real Postgres (DEC-174
 * U17, #1148): every booked place hears "‹Business› cancelled this class",
 * with what happened to the money, and everyone waiting for it hears it is
 * off. Neither is behind the COURSE switch.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { CustomerNotifyPayload } from "../site-accounts/customer-notify-queue";
import { loadSubject } from "../site-accounts/customer-notify.handler";
import { noticeSentence, renderNotice } from "../site-accounts/notices";
import type { BookingNotifyPayload } from "./booking-notify.handler";
import { tellAboutBooking } from "./booking-notify.handler";
import { BookingsService } from "./bookings.service";
import type { SignedInCustomer } from "./public-bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import { WaitlistService } from "./waitlist.service";

const bookings = new BookingsService();
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const waitlist = new WaitlistService();

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
        data: { name: "Pulse Fitness", slug: `u17-class-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `u17-desk-${process.pid}@example.com` },
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

async function customer(first = "Sneha"): Promise<SignedInCustomer> {
    people += 1;
    const email = `u17-person-${people}-${process.pid}@example.com`;
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

function book(who: SignedInCustomer, serviceId: string, startAt: Date) {
    return publicBookings.bookOnline(
        serviceId,
        {
            startAt: startAt.toISOString(),
            bookerEmail: "",
            idempotencyKey: `u17-${++keys}`,
            pay: "DESK",
        },
        undefined,
        new Date(),
        who,
    );
}

/** The class as the workspace cancels it: every place, closing the line. */
async function cancelClass(ids: string[]): Promise<void> {
    for (const id of ids) {
        await bookings.cancelBooking(owner, id, undefined, {
            returnCredit: true,
            closesClass: true,
        });
    }
}

/** The cancels' booking.notify jobs (not the bookings' own). */
function bookingJobs(ids: string[]) {
    return prisma.job.findMany({
        where: {
            organizationId: owner.organizationId,
            type: "booking.notify",
            AND: [
                { payload: { path: ["reason"], equals: "cancelled" } },
                {
                    OR: ids.map((id) => ({
                        payload: { path: ["bookingId"], equals: id },
                    })),
                },
            ],
        },
    });
}

function waitlistJobs(serviceId: string) {
    return prisma.job
        .findMany({
            where: {
                organizationId: owner.organizationId,
                type: "customer.notify",
                payload: { path: ["kind"], equals: "WAITLIST_CLASS_CANCELLED" },
            },
        })
        .then(async (jobs) => {
            const entries = await prisma.classWaitlistEntry.findMany({
                where: { serviceId },
                select: { id: true },
            });
            const mine = new Set(entries.map((e) => e.id));
            return jobs.filter((j) =>
                mine.has(
                    (j.payload as { waitlistEntryId: string }).waitlistEntryId,
                ),
            );
        });
}

function load(payload: CustomerNotifyPayload) {
    return runInOrgContext(owner.organizationId, () =>
        prisma.$transaction((tx) =>
            loadSubject(tx, owner.organizationId, payload),
        ),
    );
}

/** What the booking.notify job hands customer.notify, and its words. */
async function told(bookingId: string) {
    const [job] = await bookingJobs([bookingId]);
    const sent: CustomerNotifyPayload[] = [];
    await runInOrgContext(owner.organizationId, () =>
        prisma.$transaction((tx) =>
            tellAboutBooking(
                tx,
                {
                    notify: (_tx, _org, payload) => {
                        sent.push(payload);
                        return Promise.resolve({} as never);
                    },
                },
                {
                    organizationId: owner.organizationId,
                    jobId: job!.id,
                    payload: job!.payload as unknown as BookingNotifyPayload,
                    now: new Date(),
                },
            ),
        ),
    );
    const payload = sent[0]!;
    const subject = await load(payload);
    return {
        payload,
        sentence: subject ? noticeSentence(subject.vars) : null,
        email: subject ? renderNotice(subject.vars) : null,
    };
}

describe("a class the business cancels (U17)", () => {
    it("6 booked and 3 waiting: all 9 are told, each with the right words", async () => {
        const at = nextMonday(7, 3);
        const serviceId = await classOf(6);
        const booked: string[] = [];
        for (let i = 0; i < 6; i += 1) {
            booked.push(
                (await book(await customer(), serviceId, at)).booking.id,
            );
        }
        const waiting = [
            await customer("Bina"),
            await customer("Chetan"),
            await customer("Divya"),
        ];
        for (const w of waiting) {
            await waitlist.join(w, serviceId, at.toISOString());
        }

        await cancelClass(booked);

        const jobs = await bookingJobs(booked);
        expect(jobs).toHaveLength(6);
        for (const job of jobs) {
            expect(job.payload).toMatchObject({
                reason: "cancelled",
                classCancelled: true,
            });
        }
        const lineJobs = await waitlistJobs(serviceId);
        expect(lineJobs).toHaveLength(3);
        // Nobody in the line is offered a place in a cancelled class.
        expect(
            await prisma.classWaitlistEntry.count({
                where: { serviceId, status: "CLOSED" },
            }),
        ).toBe(3);

        const first = await told(booked[0]!);
        expect(first.payload).toMatchObject({
            kind: "BOOKING_CANCELLED",
            classCancelled: true,
        });
        expect(first.sentence).toMatch(
            /^Pulse Fitness cancelled this class: HIIT \d+ on Mon \d+ \w+ at 7:00 am\. Your place in it is cancelled\.$/,
        );
        expect(first.email?.subject).toBe("Pulse Fitness cancelled your class");

        for (const job of lineJobs) {
            const subject = await load(
                job.payload as unknown as CustomerNotifyPayload,
            );
            expect(subject).not.toBeNull();
            expect(noticeSentence(subject!.vars)).toMatch(
                /^Pulse Fitness cancelled HIIT \d+ on Mon \d+ \w+ at 7:00 am, the class you were waiting for\. You're no longer on its waitlist\.$/,
            );
            expect(renderNotice(subject!.vars).subject).toMatch(
                /^Pulse Fitness cancelled HIIT \d+$/,
            );
        }
        expect(
            new Set(
                await Promise.all(
                    lineJobs.map(
                        async (j) =>
                            (
                                await load(
                                    j.payload as unknown as CustomerNotifyPayload,
                                )
                            )?.contactId,
                    ),
                ),
            ),
        ).toEqual(new Set(waiting.map((w) => w.contactId)));
    });

    it("a place paid with a pack says the class is back in it, with what is left", async () => {
        const at = nextMonday(7, 4);
        const serviceId = await classOf(2);
        const who = await customer();
        const { booking } = await book(who, serviceId, at);
        const pack = await prisma.classPack.create({
            data: {
                organizationId: owner.organizationId,
                name: "Ten classes",
                credits: 10,
                validityDays: 90,
                price: "4000",
                currency: "INR",
            },
        });
        const purchase = await prisma.packPurchase.create({
            data: {
                organizationId: owner.organizationId,
                packId: pack.id,
                contactId: who.contactId,
                credits: 10,
                price: "4000",
                currency: "INR",
                expiresAt: new Date(at.getTime() + 90 * 86_400_000),
            },
        });
        await prisma.packRedemption.createMany({
            data: [
                {
                    organizationId: owner.organizationId,
                    purchaseId: purchase.id,
                    bookingId: booking.id,
                },
            ],
        });
        // Another class already used from the same pack.
        const other = await book(await customer(), serviceId, at);
        await prisma.packRedemption.create({
            data: {
                organizationId: owner.organizationId,
                purchaseId: purchase.id,
                bookingId: other.booking.id,
            },
        });
        await prisma.booking.update({
            where: { id: booking.id },
            data: { paidWith: "PACK" },
        });

        await cancelClass([booking.id]);

        const { sentence } = await told(booking.id);
        expect(sentence).toContain(
            "Your place in it is cancelled. The class is back in your pack: 9 classes left.",
        );
    });

    it("an unpaid hold in the class is told too: no payment was taken", async () => {
        const at = nextMonday(7, 5);
        const serviceId = await classOf(3);
        const who = await customer();
        const hold = await prisma.booking.create({
            data: {
                organizationId: owner.organizationId,
                serviceId,
                contactId: who.contactId,
                startAt: at,
                endAt: new Date(at.getTime() + 3_600_000),
                timezone: "UTC",
                status: "PENDING",
                holdExpiresAt: new Date(Date.now() + 15 * 60_000),
                snapshot: {},
                bookerEmail: `hold-${process.pid}@example.com`,
                bookerName: "Hema Rao",
            },
        });

        await cancelClass([hold.id]);

        const jobs = await bookingJobs([hold.id]);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]!.payload).toMatchObject({
            reason: "cancelled",
            classCancelled: true,
        });
        const { sentence } = await told(hold.id);
        expect(sentence).toMatch(
            /Your place in it is cancelled\. No payment was taken\.$/,
        );
    });

    it("a single place cancelled (not the whole class) keeps the plain words and offers the line", async () => {
        const at = nextMonday(7, 6);
        const serviceId = await classOf(2);
        const { booking } = await book(await customer(), serviceId, at);
        await book(await customer(), serviceId, at);
        await waitlist.join(
            await customer("Bina"),
            serviceId,
            at.toISOString(),
        );

        await bookings.cancelBooking(owner, booking.id);

        const [job] = await bookingJobs([booking.id]);
        expect(job!.payload).not.toHaveProperty("classCancelled");
        expect(await waitlistJobs(serviceId)).toHaveLength(0);
        const { payload, sentence } = await told(booking.id);
        expect(payload).not.toHaveProperty("classCancelled");
        expect(sentence).toMatch(/^Your HIIT \d+ on .+ has been cancelled\.$/);
    });

    it("with Course emails off, class cancel notices still go", async () => {
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: owner.organizationId,
                kind: "COURSE",
                enabled: false,
            },
        });
        try {
            const at = nextMonday(7, 7);
            const serviceId = await classOf(2);
            const { booking } = await book(await customer(), serviceId, at);
            const other = await book(await customer(), serviceId, at);
            await waitlist.join(
                await customer("Bina"),
                serviceId,
                at.toISOString(),
            );

            await cancelClass([booking.id, other.booking.id]);

            expect(
                await bookingJobs([booking.id, other.booking.id]),
            ).toHaveLength(2);
            const [line] = await waitlistJobs(serviceId);
            expect(line).toBeDefined();
            expect(
                await load(line!.payload as unknown as CustomerNotifyPayload),
            ).not.toBeNull();
            expect((await told(booking.id)).sentence).toContain(
                "Pulse Fitness cancelled this class",
            );
        } finally {
            await prisma.customerNoticeSetting.deleteMany({
                where: { organizationId: owner.organizationId },
            });
        }
    });
});
