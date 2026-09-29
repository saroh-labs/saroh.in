import type { Prisma } from "@saroh/database";

import type { Interval } from "./availability";
import { courseSeatIntervals, courseSeatsHeld } from "./course-seats";

/**
 * Places held on a class's time beyond its bookings: the seats an open
 * course still sells (ADR-007, `course-seats.ts`), and a place freed and
 * held for the first person on the session's waitlist while their offer
 * lasts (round-2 A12, default 9).
 *
 * Every capacity count reads through here — a booking, a move, a hold paid
 * late, the booking page's places left — so the desk can't book a place
 * that is held for someone. An offer counts only until `offeredUntil`, as a
 * pay-now hold counts only until its time runs out (`holdsPlace`): no job
 * has to run first. The one booking it doesn't stand in the way of is the
 * offered person's own, which is how they take it.
 */

type Db = Pick<
    Prisma.TransactionClient,
    "courseSession" | "classWaitlistEntry"
>;

/** Offers still held on a service's time over `[from, to)`. */
export function liveOffersWhere(
    serviceId: string,
    from: Date,
    to: Date,
    now: Date,
): Prisma.ClassWaitlistEntryWhereInput {
    return {
        serviceId,
        status: "OFFERED",
        offeredUntil: { gt: now },
        startAt: { lt: to },
        endAt: { gt: from },
    };
}

/** Waitlist offers held on `[from, to)`, leaving out one person's own. */
export async function offerSeatsHeld(
    db: Pick<Prisma.TransactionClient, "classWaitlistEntry">,
    serviceId: string,
    from: Date,
    to: Date,
    options: { now?: Date; exceptContactId?: string | null } = {},
): Promise<number> {
    const now = options.now ?? new Date();
    return db.classWaitlistEntry.count({
        where: {
            ...liveOffersWhere(serviceId, from, to, now),
            ...(options.exceptContactId
                ? { contactId: { not: options.exceptContactId } }
                : {}),
        },
    });
}

/**
 * Every place held on `[from, to)` beyond bookings: courses' unsold seats
 * (other courses', for a course's own booking) and live waitlist offers
 * (other people's, for the offered person's own booking).
 */
export async function seatsHeld(
    db: Db,
    serviceId: string,
    from: Date,
    to: Date,
    options: {
        exceptCourseId?: string;
        exceptContactId?: string | null;
        now?: Date;
    } = {},
): Promise<number> {
    const [courses, offers] = await Promise.all([
        courseSeatsHeld(db, serviceId, from, to, options.exceptCourseId),
        offerSeatsHeld(db, serviceId, from, to, options),
    ]);
    return courses + offers;
}

/**
 * The held places as busy intervals, one per place, for the availability
 * listing — which counts overlapping intervals against capacity — so a
 * place held for someone doesn't show as free.
 */
export async function heldSeatIntervals(
    db: Db,
    serviceId: string,
    from: Date,
    to: Date,
    now: Date = new Date(),
): Promise<Interval[]> {
    const [courses, offers] = await Promise.all([
        courseSeatIntervals(db, serviceId, from, to),
        db.classWaitlistEntry.findMany({
            where: liveOffersWhere(serviceId, from, to, now),
            select: { startAt: true, endAt: true },
        }),
    ]);
    return [...courses, ...offers];
}
