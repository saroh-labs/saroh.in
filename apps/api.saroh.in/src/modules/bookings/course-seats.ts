import type { Prisma } from "@saroh/database";

import type { Interval } from "./availability";

/**
 * Seats a course still holds on a service's time (ADR-007).
 *
 * A course promises its seats: while it is OPEN, the seats nobody has taken
 * yet count as taken on each of its sessions, so a public booker cannot fill
 * a session the course is still selling. An enrolled person's seat is a real
 * booking and counts as that. A course that is closed, a draft or archived
 * holds nothing beyond its bookings, and neither does any course while its
 * business has Courses switched off.
 */

type Db = Pick<Prisma.TransactionClient, "courseSession">;

interface HeldSession {
    startAt: Date;
    endAt: Date;
    courseId: string;
    unfilled: number;
}

async function heldSessions(
    db: Db,
    serviceId: string,
    from: Date,
    to: Date,
): Promise<HeldSession[]> {
    const sessions = await db.courseSession.findMany({
        where: {
            startAt: { lt: to },
            endAt: { gt: from },
            course: {
                serviceId,
                status: "OPEN",
                // With Courses switched off nobody can enrol, so an open
                // course has nothing to hold seats for. A missing row counts
                // as on, as for Payments (enforcement ships dark).
                organization: {
                    organizationModules: {
                        none: {
                            moduleKey: "COURSES",
                            status: { not: "ENABLED" },
                        },
                    },
                },
            },
        },
        select: {
            startAt: true,
            endAt: true,
            course: {
                select: {
                    id: true,
                    seats: true,
                    _count: {
                        select: {
                            enrollments: { where: { status: "ACTIVE" } },
                        },
                    },
                },
            },
        },
    });
    return sessions.map((s) => ({
        startAt: s.startAt,
        endAt: s.endAt,
        courseId: s.course.id,
        unfilled: Math.max(0, s.course.seats - s.course._count.enrollments),
    }));
}

/**
 * Seats held by open courses on `[startAt, endAt)`, each course once. A
 * course's own booking passes its id: its unsold seats are the ones it is
 * filling, not something standing in its way.
 */
export async function courseSeatsHeld(
    db: Db,
    serviceId: string,
    startAt: Date,
    endAt: Date,
    exceptCourseId?: string,
): Promise<number> {
    const byCourse = new Map<string, number>();
    for (const s of await heldSessions(db, serviceId, startAt, endAt)) {
        if (s.courseId !== exceptCourseId) byCourse.set(s.courseId, s.unfilled);
    }
    let held = 0;
    for (const n of byCourse.values()) held += n;
    return held;
}

/**
 * The held seats as busy intervals, one per seat, for the availability
 * listing — which counts overlapping intervals against capacity — so a slot
 * the course still holds does not show as open.
 */
export async function courseSeatIntervals(
    db: Db,
    serviceId: string,
    from: Date,
    to: Date,
): Promise<Interval[]> {
    const busy: Interval[] = [];
    for (const s of await heldSessions(db, serviceId, from, to)) {
        for (let i = 0; i < s.unfilled; i += 1) {
            busy.push({ startAt: s.startAt, endAt: s.endAt });
        }
    }
    return busy;
}
