/**
 * Paying for a class with a credit online, against a real Postgres (round-2
 * A10): a signed-in customer's pack or membership pays the class the way the
 * desk spends one — the balance goes down by one, the booking says how it
 * was paid, and the desk reads the same redemption. The API decides what is
 * offered: only a pack that covers the service, has a class left and is
 * valid at the start; a membership with a class left that month. Someone
 * else's pack is missing, and two tabs spending the last class get one
 * booking between them.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ClassPacksService } from "../class-packs/class-packs.service";
import { InvoicesService } from "../invoices/invoices.service";
import { BookingsService } from "./bookings.service";
import type { SignedInCustomer } from "./public-bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";

const packs = new ClassPacksService(new InvoicesService());
const bookings = new BookingsService();
// Generous: these tests book many times from one address.
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);

const MONDAY = 1;
let owner: OrganizationContext;
let hiit: string;
let pt: string;
/** Three visits: a treatment, sold as one order (E9). */
let course: string;
let people = 0;
let keys = 0;

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
        data: { name: "Pulse Fitness", slug: `a10-credit-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `a10-desk-${process.pid}@example.com` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    const service = (
        name: string,
        capacity: number,
        from: number,
        visits = 1,
    ) =>
        prisma.service.create({
            data: {
                organizationId: org.id,
                name,
                durationMinutes: 60,
                capacity,
                visits,
                priceCents: 50_000,
                currency: "INR",
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: org.id,
                        dayOfWeek: MONDAY,
                        startMinute: from * 60,
                        endMinute: (from + 1) * 60,
                    },
                },
            },
        });
    hiit = (await service("HIIT circuit", 20, 7)).id;
    pt = (await service("Personal training", 1, 9)).id;
    course = (await service("Physio course", 1, 11, 3)).id;
});

/** A signed-in customer of the business: a contact and its site account. */
async function customer(): Promise<SignedInCustomer> {
    people += 1;
    const email = `a10-person-${people}-${process.pid}@example.in`;
    const contact = await prisma.contact.create({
        data: {
            organizationId: owner.organizationId,
            email,
            firstName: "Sneha",
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

/** A pack of `credits` classes for HIIT, valid `days`, sold at the desk. */
async function packFor(
    who: SignedInCustomer,
    credits: number,
    days = 90,
    serviceIds = [hiit],
) {
    const pack = await packs.createPack(owner, {
        name: `${credits} classes`,
        credits,
        validityDays: days,
        price: "2000",
        currency: "INR",
        serviceIds,
    });
    return packs.sell(owner, pack.id, { contactId: who.contactId });
}

/** An active membership with `classes` a month (null: no allowance). */
async function membershipFor(who: SignedInCustomer, classes: number | null) {
    const plan = await prisma.subscriptionPlan.create({
        data: {
            organizationId: owner.organizationId,
            name: `Monthly ${classes ?? "open"} ${people}`,
            price: "2500",
            currency: "INR",
            interval: "MONTH",
            classesPerMonth: classes,
        },
    });
    const now = new Date();
    return prisma.customerSubscription.create({
        data: {
            organizationId: owner.organizationId,
            planId: plan.id,
            contactId: who.contactId,
            price: "2500",
            currency: "INR",
            interval: "MONTH",
            timezone: "UTC",
            anchorAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
            classesPerPeriod: classes,
            classesPerPeriodSetAt: now,
        },
    });
}

function withCredit(
    startAt: Date,
    credit: { packPurchaseId?: string; subscriptionId?: string },
    serviceKey = `a10-${++keys}`,
) {
    return {
        startAt: startAt.toISOString(),
        bookerEmail: "",
        idempotencyKey: serviceKey,
        pay: "CREDIT" as const,
        ...credit,
    };
}

function bookWith(
    who: SignedInCustomer,
    startAt: Date,
    credit: { packPurchaseId?: string; subscriptionId?: string },
    serviceId = hiit,
) {
    return publicBookings.bookOnline(
        serviceId,
        withCredit(startAt, credit),
        undefined,
        new Date(),
        who,
    );
}

async function left(purchaseId: string): Promise<number> {
    return (await packs.getPurchase(owner, purchaseId)).left;
}

describe("the credit the pay step offers (A10)", () => {
    it("offers the pack that covers the class, with its classes left and its last day", async () => {
        const who = await customer();
        const sold = await packFor(who, 5, 60);

        const { credit } = await publicBookings.creditFor(
            who,
            hiit,
            nextMonday(7).toISOString(),
        );

        const purchase = await prisma.packPurchase.findUniqueOrThrow({
            where: { id: sold.id },
        });
        expect(credit).toEqual({
            kind: "PACK",
            id: sold.id,
            name: "5 classes",
            left: 5,
            useBy: purchase.expiresAt.toISOString().slice(0, 10),
        });
    });

    it("offers nothing for a service the pack doesn't cover, or with no pack", async () => {
        const who = await customer();
        await packFor(who, 5);
        expect(
            (
                await publicBookings.creditFor(
                    who,
                    pt,
                    nextMonday(9).toISOString(),
                )
            ).credit,
        ).toBeNull();
        const nobody = await customer();
        expect(
            (
                await publicBookings.creditFor(
                    nobody,
                    hiit,
                    nextMonday(7).toISOString(),
                )
            ).credit,
        ).toBeNull();
    });

    it("never offers a pack that runs out before the class starts", async () => {
        const who = await customer();
        await packFor(who, 5, 7);

        const { credit } = await publicBookings.creditFor(
            who,
            hiit,
            // Eight to fourteen days out: past the pack's seven.
            nextMonday(7, 2).toISOString(),
        );

        expect(credit).toBeNull();
    });

    it("skips a pack with nothing left for the next one that runs out soonest", async () => {
        const who = await customer();
        const empty = await packFor(who, 1, 30);
        await bookWith(who, nextMonday(7), { packPurchaseId: empty.id });
        const later = await packFor(who, 10, 90);

        const { credit } = await publicBookings.creditFor(
            who,
            hiit,
            nextMonday(7, 2).toISOString(),
        );

        expect(credit).toMatchObject({ kind: "PACK", id: later.id, left: 10 });
    });

    it("offers a membership's class first, and the pack once the month's are used", async () => {
        const who = await customer();
        const sub = await membershipFor(who, 1);
        const sold = await packFor(who, 5);
        const at = nextMonday(7);

        const first = await publicBookings.creditFor(
            who,
            hiit,
            at.toISOString(),
        );
        expect(first.credit).toMatchObject({
            kind: "MEMBERSHIP",
            id: sub.id,
            left: 1,
            allowance: 1,
        });

        await bookWith(who, at, { subscriptionId: sub.id });
        // That month's one class is used: the pack is what is left.
        const again = await publicBookings.creditFor(
            who,
            hiit,
            at.toISOString(),
        );
        expect(again.credit).toMatchObject({ kind: "PACK", id: sold.id });
    });

    it("never offers a membership with no classes a month, nor one for a one-to-one", async () => {
        const who = await customer();
        await membershipFor(who, null);
        expect(
            (
                await publicBookings.creditFor(
                    who,
                    hiit,
                    nextMonday(7).toISOString(),
                )
            ).credit,
        ).toBeNull();

        const member = await customer();
        await membershipFor(member, 8);
        expect(
            (
                await publicBookings.creditFor(
                    member,
                    pt,
                    nextMonday(9).toISOString(),
                )
            ).credit,
        ).toBeNull();
    });

    it("offers no pack while the business has Class packs off, and refuses one sent anyway", async () => {
        const who = await customer();
        const sold = await packFor(who, 5);
        const off = await prisma.organizationModule.create({
            data: {
                organizationId: owner.organizationId,
                moduleKey: "CLASS_PACKS",
                status: "DISABLED",
            },
        });
        try {
            expect(
                (
                    await publicBookings.creditFor(
                        who,
                        hiit,
                        nextMonday(7).toISOString(),
                    )
                ).credit,
            ).toBeNull();
            await expect(
                bookWith(who, nextMonday(7), { packPurchaseId: sold.id }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(await left(sold.id)).toBe(5);
        } finally {
            await prisma.organizationModule.delete({ where: { id: off.id } });
        }
    });
});

describe("booking with a credit (A10)", () => {
    it("spends one class of the pack, and the booking is paid with it", async () => {
        const who = await customer();
        const sold = await packFor(who, 5);

        const { booking, payToken } = await bookWith(who, nextMonday(7), {
            packPurchaseId: sold.id,
        });

        expect(payToken).toBeNull();
        expect(booking).toMatchObject({
            status: "CONFIRMED",
            paidWith: "PACK",
            contactId: who.contactId,
            customerAccountId: who.accountId,
            holdExpiresAt: null,
        });
        expect(await left(sold.id)).toBe(4);
        // Nothing to pay: no invoice for the class.
        expect(
            await prisma.invoice.count({ where: { bookingId: booking.id } }),
        ).toBe(0);
    });

    it("reads at the desk as a desk-made pack booking does, and a cancel gives the class back", async () => {
        const who = await customer();
        const sold = await packFor(who, 5);
        const online = await bookWith(who, nextMonday(7), {
            packPurchaseId: sold.id,
        });
        const desk = await bookings.bookByHand(owner, hiit, {
            startAt: nextMonday(7, 2).toISOString(),
            contactId: who.contactId,
            packPurchaseId: sold.id,
        });

        const seen = await bookings.getBooking(owner, online.booking.id);
        const deskSeen = await bookings.getBooking(owner, desk.id);
        expect(seen.paidWith).toBe(deskSeen.paidWith);
        expect(seen.packRedemption).toEqual(deskSeen.packRedemption);
        expect(seen.money).toEqual(deskSeen.money);
        expect(await left(sold.id)).toBe(3);

        await bookings.cancelBooking(owner, online.booking.id);
        expect(await left(sold.id)).toBe(4);
    });

    it("spends a membership's class for the month", async () => {
        const who = await customer();
        const sub = await membershipFor(who, 1);

        const { booking } = await bookWith(who, nextMonday(7), {
            subscriptionId: sub.id,
        });

        expect(booking).toMatchObject({
            status: "CONFIRMED",
            paidWith: "MEMBERSHIP",
            subscriptionId: sub.id,
        });
    });

    it("answers a retry with the same key with the booking it made, spending once", async () => {
        const who = await customer();
        const sold = await packFor(who, 5);
        const request = withCredit(nextMonday(7), { packPurchaseId: sold.id });

        const first = await publicBookings.bookOnline(
            hiit,
            request,
            undefined,
            new Date(),
            who,
        );
        const again = await publicBookings.bookOnline(
            hiit,
            request,
            undefined,
            new Date(),
            who,
        );

        expect(again.booking.id).toBe(first.booking.id);
        expect(await left(sold.id)).toBe(4);
    });

    it("refuses a pack that runs out before the class, and books nothing", async () => {
        const who = await customer();
        const sold = await packFor(who, 5, 7);

        await expect(
            bookWith(who, nextMonday(7, 2), { packPurchaseId: sold.id }),
        ).rejects.toMatchObject({
            response: {
                message: "Your class pack runs out before this class.",
                details: { reason: "credit-gone" },
            },
        });
        expect(
            await prisma.booking.count({
                where: { contactId: who.contactId },
            }),
        ).toBe(0);
    });

    it("treats another customer's pack as missing: 404, and nothing spent", async () => {
        const owner1 = await customer();
        const sold = await packFor(owner1, 5);
        const someoneElse = await customer();

        await expect(
            bookWith(someoneElse, nextMonday(7), { packPurchaseId: sold.id }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await left(sold.id)).toBe(5);
        expect(
            await prisma.booking.count({
                where: { contactId: someoneElse.contactId },
            }),
        ).toBe(0);
    });

    it("treats another customer's membership as missing: 404", async () => {
        const member = await customer();
        const sub = await membershipFor(member, 8);
        const someoneElse = await customer();

        await expect(
            bookWith(someoneElse, nextMonday(7), { subscriptionId: sub.id }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses a membership with no classes a month, and one for a one-to-one", async () => {
        const who = await customer();
        const open = await membershipFor(who, null);
        await expect(
            bookWith(who, nextMonday(7), { subscriptionId: open.id }),
        ).rejects.toMatchObject({
            response: { details: { reason: "credit-gone" } },
        });

        const member = await customer();
        const sub = await membershipFor(member, 8);
        await expect(
            bookWith(member, nextMonday(9), { subscriptionId: sub.id }, pt),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses CREDIT that names no credit, or two", async () => {
        const who = await customer();
        const sold = await packFor(who, 5);
        const sub = await membershipFor(who, 8);
        await expect(bookWith(who, nextMonday(7), {})).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            bookWith(who, nextMonday(7), {
                packPurchaseId: sold.id,
                subscriptionId: sub.id,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("never offers or spends a credit on a treatment, which is paid on its order (E9)", async () => {
        const who = await customer();
        const sold = await packFor(who, 5, 90, [course]);
        expect(
            (
                await publicBookings.creditFor(
                    who,
                    course,
                    nextMonday(11).toISOString(),
                )
            ).credit,
        ).toBeNull();

        await expect(
            bookWith(who, nextMonday(11), { packPurchaseId: sold.id }, course),
        ).rejects.toThrow(
            "A treatment is paid for on its order, not with a pack or a membership.",
        );
        expect(await left(sold.id)).toBe(5);
        expect(
            await prisma.booking.count({ where: { serviceId: course } }),
        ).toBe(0);
    });

    it("the last class spent from two tabs at once: one booking, and the other is refused", async () => {
        const who = await customer();
        const sold = await packFor(who, 1);

        const results = await Promise.allSettled([
            bookWith(who, nextMonday(7), { packPurchaseId: sold.id }),
            bookWith(who, nextMonday(7, 2), { packPurchaseId: sold.id }),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find((r) => r.status === "rejected");
        expect(refused?.status).toBe("rejected");
        expect(await left(sold.id)).toBe(0);
        expect(
            await prisma.booking.count({
                where: { contactId: who.contactId },
            }),
        ).toBe(1);
        expect(
            await prisma.packRedemption.count({
                where: { purchaseId: sold.id },
            }),
        ).toBe(1);
    });
});
