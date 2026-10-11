import { ensureCalendarOnlyRole } from "../calendar-only-role";
import { CALENDAR_ONLY_EMAIL, seedPassword } from "./data";
import type { Db } from "./helpers";
import { at, hashPassword, id } from "./helpers";

/** Tara's one booking, which the browser spec opens by its address. */
export const CALENDAR_ONLY_BOOKING = {
    key: "calendar-only",
    booker: "Meera Nair",
    /** Days after the seed ran: far enough that a cached dump still has it ahead. */
    dayOffset: 240,
    /** After the seeded services close (Mon to Fri, 9 to 5), so it takes no time anyone is offered. */
    hour: 18,
} as const;

/**
 * Someone on Northwind's diary with a login of their own (#868): Tara, on
 * the team as "Calendar only". Without her, the narrowest role that changes
 * anything could only be tried by writing the rows by hand, and no browser
 * spec could sign in as one (`role-calendar-only.spec.ts`).
 *
 * Her place on the diary is ARCHIVED on purpose. Northwind takes bookings
 * without a team, and every booking spec beside this one reads it that way:
 * an active person would give its calendar a column and its services
 * someone to be free. An archived person takes no new bookings and is on no
 * service, and the bookings she took are still hers to read
 * (`bookings/own-diary.ts`), which is all the spec asks.
 *
 * One booking is hers: `CALENDAR_ONLY_BOOKING`, on a seeded service, long
 * after the seed ran and after hours.
 */
export async function seedCalendarOnlyTeammate(
    prisma: Db,
    orgId: string,
    serviceId: string,
    now: Date,
): Promise<void> {
    const tara = await prisma.user.upsert({
        where: { email: CALENDAR_ONLY_EMAIL },
        update: { name: "Tara Menon", emailVerified: true },
        create: {
            id: id("user", "calendar"),
            email: CALENDAR_ONLY_EMAIL,
            name: "Tara Menon",
            emailVerified: true,
        },
    });
    // better-auth's own hasher, as for the owner and the reviewer.
    await prisma.account.upsert({
        where: { id: id("account", "calendar") },
        update: { password: await hashPassword(seedPassword()) },
        create: {
            id: id("account", "calendar"),
            accountId: tara.id,
            providerId: "credential",
            userId: tara.id,
            password: await hashPassword(seedPassword()),
        },
    });

    const role = await ensureCalendarOnlyRole(prisma, orgId);
    const membership = await prisma.membership.upsert({
        where: {
            organizationId_userId: { organizationId: orgId, userId: tara.id },
        },
        update: { role: role.key },
        create: {
            id: id("membership", "calendar"),
            organizationId: orgId,
            userId: tara.id,
            role: role.key,
        },
    });

    const person = {
        name: "Tara Menon",
        title: "Consultant",
        status: "ARCHIVED",
        membershipId: membership.id,
    };
    const staffId = id("staff", "calendar");
    await prisma.staffMember.upsert({
        where: { id: staffId },
        update: person,
        create: {
            id: staffId,
            organizationId: orgId,
            ...person,
            archivedAt: now,
        },
    });

    const service = await prisma.service.findUniqueOrThrow({
        where: { id: serviceId },
        select: {
            name: true,
            durationMinutes: true,
            priceCents: true,
            currency: true,
        },
    });
    const b = CALENDAR_ONLY_BOOKING;
    const startAt = at(now, b.dayOffset, b.hour);
    const endAt = new Date(
        startAt.getTime() + service.durationMinutes * 60_000,
    );
    const bookingId = id("booking", b.key);
    await prisma.booking.upsert({
        where: { id: bookingId },
        update: { startAt, endAt, status: "CONFIRMED", outcome: null, staffId },
        create: {
            id: bookingId,
            organizationId: orgId,
            serviceId,
            staffId,
            bookerName: b.booker,
            startAt,
            endAt,
            timezone: "Asia/Kolkata",
            status: "CONFIRMED",
            snapshot: {
                serviceName: service.name,
                durationMinutes: service.durationMinutes,
                priceCents: service.priceCents,
                currency: service.currency,
            },
        },
    });
    await prisma.bookingEvent.deleteMany({ where: { bookingId } });
    await prisma.bookingEvent.create({
        data: {
            bookingId,
            organizationId: orgId,
            type: "BOOKED",
            toStartAt: startAt,
        },
    });
}
