import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Service } from "@saroh/database";
import { prisma } from "@saroh/database";

import type {
    AvailabilityRuleWindow,
    AvailabilityService,
    Interval,
    Slot,
    StaffSlot,
} from "./availability";
import {
    availableSlots,
    countOverlapping,
    intersectIntervals,
    isPersonSlotStart,
    staffSlots,
    weeklyIntervals,
    withinIntervals,
    workingIntervals,
} from "./availability";
import { holdsPlace } from "./booking-hold";
import { courseSeatIntervals } from "./course-seats";
import type { ReserveWith } from "./reservation";
import {
    businessTimezone,
    loadPeople,
    serviceStaff,
} from "./staff-availability";

/*
 * The slot and overlap primitives both booking services use (#508): which
 * starts are open, who a start is with, and what already fills a service's
 * time. No state of their own — the geometry is `availability.ts`; these
 * read what it needs.
 */

/**
 * A free time, and — when somebody takes the service — who (U3). For a
 * one-to-one it is everyone free for that start; for a class, its
 * instructor, shown beside it.
 */
export type AvailableSlot = Slot & { staffIds?: string[] };

/**
 * How a service is staffed (U3). `perPerson` is a one-to-one somebody takes:
 * each person is their own diary, so capacity is theirs rather than the
 * service's. A class keeps its own times and capacity; its people are its
 * instructors, for display and clash checks only.
 */
export interface Staffing {
    people: { id: string; name: string }[];
    perPerson: boolean;
    /** The business's zone — staff hours are wall-clock times in it. */
    zone: string | null;
}

/**
 * Open slots over `[from, to)`. A one-to-one somebody takes gets them per
 * person (U3); anything else from the service's own rules and capacity,
 * exactly as before — with its instructors named when it has any.
 */
export async function openSlots(
    service: Service,
    rules: AvailabilityRuleWindow[],
    from: Date,
    to: Date,
    staffId?: string,
): Promise<AvailableSlot[]> {
    const staffing = await loadStaffing(service);
    if (staffId && !staffing.people.some((p) => p.id === staffId)) {
        throw new BadRequestException({
            message: "That person doesn't take this service.",
            field: "staffId",
        });
    }
    const availService = toAvailabilityService(service);
    if (staffing.perPerson && staffing.zone) {
        const ids = staffId
            ? [staffId]
            : staffing.people.map((person) => person.id);
        const people = await loadPeople(prisma, ids, from, to);
        const slots: StaffSlot[] = staffSlots(
            availService,
            rules,
            people,
            staffing.zone,
            from,
            to,
        );
        return slots;
    }
    const busy = await busyOverlapping(service.id, from, to);
    const slots = availableSlots(availService, rules, from, to, busy);
    if (staffing.people.length === 0) return slots;
    const instructors = staffId
        ? [staffId]
        : staffing.people.map((person) => person.id);
    return slots.map((slot) => ({ ...slot, staffIds: instructors }));
}

/** How a service is staffed — see {@link Staffing}. */
export async function loadStaffing(service: Service): Promise<Staffing> {
    const people = await serviceStaff(prisma, service.id);
    const perPerson = service.capacity === 1 && people.length > 0;
    return {
        people,
        perPerson,
        zone: perPerson
            ? await businessTimezone(prisma, service.organizationId)
            : null,
    };
}

/**
 * Who a booking at `startAt` is with (U3), or null for a service nobody
 * takes. A one-to-one needs the start to be one of the person's free
 * starts — the named one, or the first person free; a class is taken by
 * the named instructor or its first. A merchant is told why a named
 * person cannot (booked or not working); a public booker only that the
 * time is not available, so time off never leaves the business.
 */
export async function resolvePerson(
    service: Service,
    rules: AvailabilityRuleWindow[],
    staffing: Staffing,
    startAt: Date,
    requested: string | undefined,
    audience: "public" | "team",
    excludeBookingId?: string,
): Promise<ReserveWith> {
    const named = requested
        ? staffing.people.find((p) => p.id === requested)
        : undefined;
    if (requested && !named) {
        throw new BadRequestException({
            message: "That person doesn't take this service.",
            field: "staffId",
        });
    }
    if (staffing.people.length === 0) {
        return { staffId: null, perPerson: false };
    }
    if (!staffing.perPerson || !staffing.zone) {
        const instructor = named ?? staffing.people[0];
        return {
            staffId: instructor.id,
            staffName: instructor.name,
            perPerson: false,
        };
    }

    const zone = staffing.zone;
    const availService = toAvailabilityService(service);
    const candidates = named ? [named] : staffing.people;
    const endAt = new Date(
        startAt.getTime() + service.durationMinutes * 60_000,
    );
    const people = await loadPeople(
        prisma,
        candidates.map((p) => p.id),
        startAt,
        endAt,
        excludeBookingId,
    );
    // loadPeople answers in the order asked, so each person is the
    // candidate at the same place.
    for (const [index, person] of people.entries()) {
        if (
            isPersonSlotStart(
                availService,
                rules,
                person,
                staffing.zone,
                startAt,
            )
        ) {
            const found = candidates[index];
            return {
                staffId: found.id,
                staffName: found.name,
                perPerson: true,
            };
        }
    }

    if (named && audience === "team") {
        const person = people[0];
        const slot = { startAt, endAt };
        if (countOverlapping(slot, person.busy) > 0) {
            throw new ConflictException({
                message: `${named.name} is already booked then.`,
                field: "staffId",
            });
        }
        let windows = workingIntervals(person, staffing.zone, startAt, endAt);
        if (rules.length > 0) {
            windows = intersectIntervals(
                windows,
                weeklyIntervals(rules, service.timezone, startAt, endAt),
            );
        }
        if (!withinIntervals(slot, windows)) {
            throw new BadRequestException({
                message: `${named.name} isn't working then.`,
                field: "staffId",
            });
        }
    }
    // A public booker whose start was a real one — inside somebody's
    // hours, but booked meanwhile, or off — hears it went, as a conflict:
    // the page then shows what is left, as it does for a full class.
    // Booked and off read alike, so time off never leaves the business.
    if (
        audience === "public" &&
        people.some((person) =>
            isPersonSlotStart(
                availService,
                rules,
                { ...person, busy: [], timeOff: [] },
                zone,
                startAt,
            ),
        )
    ) {
        throw new ConflictException({
            message: named
                ? `That time with ${named.name} is no longer available. Pick another time.`
                : "That time is no longer available. Pick another time.",
            field: "startAt",
        });
    }
    throw new BadRequestException({
        message: named
            ? `That time isn't available with ${named.name}. Pick another time.`
            : "That time is not an open slot for this service",
        field: "startAt",
    });
}

/**
 * What fills a service's time over `[from, to)`: its confirmed bookings,
 * and the seats open courses still hold on their sessions (ADR-007).
 */
export async function busyOverlapping(
    serviceId: string,
    from: Date,
    to: Date,
): Promise<Interval[]> {
    const [confirmed, held] = await Promise.all([
        confirmedOverlapping(serviceId, from, to),
        courseSeatIntervals(prisma, serviceId, from, to),
    ]);
    return [...confirmed, ...held];
}

/**
 * Bookings taking a place over `[from, to)` for a service (for capacity
 * checks): confirmed ones, and pay-now holds still inside their time.
 */
export async function confirmedOverlapping(
    serviceId: string,
    from: Date,
    to: Date,
): Promise<Interval[]> {
    return prisma.booking.findMany({
        where: {
            serviceId,
            ...holdsPlace(new Date()),
            startAt: { lt: to },
            endAt: { gt: from },
        },
        select: { startAt: true, endAt: true },
    });
}

/** Narrow a Prisma Service to the structural subset the pure module needs. */
export function toAvailabilityService(service: Service): AvailabilityService {
    return {
        durationMinutes: service.durationMinutes,
        bufferBeforeMinutes: service.bufferBeforeMinutes,
        bufferAfterMinutes: service.bufferAfterMinutes,
        capacity: service.capacity,
        timezone: service.timezone,
    };
}

export function parseRange(
    fromISO: string,
    toISO: string,
): { from: Date; to: Date } {
    const from = new Date(fromISO);
    const to = new Date(toISO);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new BadRequestException("from/to must be valid ISO instants");
    }
    if (from.getTime() >= to.getTime()) {
        throw new BadRequestException("from must be before to");
    }
    return { from, to };
}
