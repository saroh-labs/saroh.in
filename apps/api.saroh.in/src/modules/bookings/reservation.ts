import {
    ConflictException,
    GoneException,
    NotFoundException,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import type { ActivationEvents } from "../analytics/activation-events";
import { appointmentsOpen } from "./appointments-open";
import type { AvailabilityRuleWindow } from "./availability";
import { BookingEventType } from "./booking-event-type";
import { holdsPlace } from "./booking-hold";
import { courseSeatsHeld } from "./course-seats";
import type { PaidWith } from "./dto";

/*
 * The reservation both booking services share (#508): the booking page's
 * and a booking made by hand go through the same serializable write, so
 * neither can promise what the other could not.
 */

/** The validated public booking command input (see {@link BookServiceDto}). */
export interface BookInput {
    startAt: string;
    bookerName?: string;
    bookerEmail: string;
    bookerPhone?: string;
    idempotencyKey?: string;
    /** The person asked for (U3); absent means whoever is free. */
    staffId?: string;
    /**
     * How the booking page's booker pays (U19): NOW holds the place for
     * 15 minutes (`HOLD_MINUTES`) while they pay online, DESK books it to
     * pay on the day. Absent — the one-service booking block — books as before.
     */
    pay?: "NOW" | "DESK";
}

/** Who a booking is with and how it is paid, for {@link reserveInTx}. */
export interface ReserveWith {
    staffId: string | null;
    staffName?: string;
    perPerson: boolean;
    paidWith?: PaidWith | null;
    subscriptionId?: string | null;
    /** A pay-now hold (U19): PENDING, holding its place until then. */
    holdUntil?: Date | null;
}

/** Who a reservation is made by. */
export interface ReserveBy {
    /** `Contact.source` for someone new. */
    source: string;
    /** Who made it; `null` when the booker did it themselves. */
    actorUserId: string | null;
}

/**
 * Load an ACTIVE, non-deleted bookable service + its rules, or throw
 * (404/410). A service whose organization switched Appointments off is 410
 * like an archived one: the booking would otherwise land behind a module
 * the merchant can no longer open.
 */
export async function loadBookableService(
    serviceId: string,
): Promise<{ service: Service; rules: AvailabilityRuleWindow[] }> {
    const service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: { availabilityRules: true },
    });
    if (service?.deletedAt !== null) {
        throw new NotFoundException("Service not found");
    }
    if (service.status !== "ACTIVE") {
        throw new GoneException("This service is not accepting bookings");
    }
    if (!(await appointmentsOpen(service.organizationId))) {
        throw new GoneException(
            "This business isn't taking online bookings right now",
        );
    }
    const { availabilityRules, ...rest } = service;
    return { service: rest, rules: availabilityRules };
}

/** The booking an idempotency key already made for this service, if any. */
export async function bookingByKey(
    serviceId: string,
    input: BookInput,
): Promise<Booking | null> {
    if (!input.idempotencyKey) return null;
    return prisma.booking.findUnique({
        where: {
            serviceId_idempotencyKey: {
                serviceId,
                idempotencyKey: input.idempotencyKey,
            },
        },
    });
}

/**
 * The reservation itself, shared by the booking page and a booking made
 * by hand: re-count inside a Serializable transaction, upsert the contact,
 * write the CONFIRMED booking, its first history event and the notify job.
 * See `PublicBookingsService.book` for why the in-transaction re-count is
 * the guarantee.
 *
 * `also.inTx` runs on the same transaction after the booking is written —
 * spending a class pack on it, for one — so a refusal there takes the
 * booking back with it, and a booking never exists half-paid. Losing a
 * race then may be about what it touched rather than the slot, so the
 * caller says what to tell the booker (`also.onRace`).
 */
export async function reserve(
    activation: ActivationEvents | undefined,
    service: Service,
    startAt: Date,
    endAt: Date,
    input: BookInput,
    by: ReserveBy,
    also?: {
        inTx: (tx: Prisma.TransactionClient, booking: Booking) => Promise<void>;
        onRace: string;
    },
    person?: ReserveWith,
): Promise<Booking> {
    const serviceId = service.id;
    const organizationId = service.organizationId;

    let booked: Booking;
    try {
        booked = await prisma.$transaction(
            async (tx) => {
                const booking = await reserveInTx(
                    tx,
                    service,
                    startAt,
                    endAt,
                    input,
                    by,
                    undefined,
                    person,
                );
                if (also) await also.inTx(tx, booking);
                return booking;
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            },
        );
    } catch (err) {
        const code = (err as { code?: string }).code;
        // Idempotency race: two concurrent books with the same
        // (serviceId, idempotencyKey). The loser is refused one of three
        // ways — the unique index (P2002), a serialization failure
        // (P2034, both read the slot and its person), or the capacity or
        // person gate once the winner is visible. Whichever, when the
        // key's booking now exists, replay the winner instead of erroring.
        if (
            input.idempotencyKey &&
            (code === "P2002" ||
                code === "P2034" ||
                err instanceof ConflictException)
        ) {
            const existing = await bookingByKey(serviceId, input);
            if (existing) return existing;
        }
        // Serialization failure — Postgres aborted the loser of a race.
        // On its own, the only thing two bookings contend for is the slot.
        if (code === "P2034") {
            throw new ConflictException(
                also?.onRace ?? "This slot is fully booked",
            );
        }
        throw err;
    }

    // Instrumentation lives OUTSIDE the try, not merely after the commit.
    // Inside it, a throw from here would fall into the catch above and be
    // re-thrown as if the booking had failed — a committed booking
    // reported to the booker as an error. The catch is for database
    // outcomes only.
    //
    // Safe on every booking: the ledger keeps only the first
    // (deterministic dedupeKey), so there is no "is this their first?"
    // query and no race between two concurrent bookings.
    await activation?.firstBookingCreated(organizationId, booked.id);
    return booked;
}

/**
 * Write one booking on the caller's transaction: re-count capacity,
 * upsert the contact, create the CONFIRMED booking and its first history
 * event, and queue its notification.
 *
 * Public so a course can book every session in one transaction (ADR-007).
 * The caller owns the transaction and its isolation, and maps its errors.
 */
export async function reserveInTx(
    tx: Prisma.TransactionClient,
    service: Service,
    startAt: Date,
    endAt: Date,
    input: BookInput,
    by: ReserveBy,
    course?: { courseId: string; enrollmentId: string },
    person?: ReserveWith,
): Promise<Booking> {
    const serviceId = service.id;
    const organizationId = service.organizationId;
    const email = input.bookerEmail.trim().toLowerCase();
    const snapshot = buildSnapshot(service, input, startAt, endAt);

    // Authoritative capacity gate — re-counted INSIDE the tx. A
    // one-to-one somebody takes is capacity per person (U3), checked
    // below; everything else counts the service's seats as before.
    if (!(person?.perPerson && person.staffId)) {
        const confirmed = await tx.booking.count({
            where: {
                serviceId,
                ...holdsPlace(new Date()),
                startAt: { lt: endAt },
                endAt: { gt: startAt },
            },
        });
        // Seats an open course still holds count as taken (ADR-007) —
        // other courses' seats, for a course's own booking: its unsold
        // seats are the ones it is filling.
        const held = await courseSeatsHeld(
            tx,
            serviceId,
            startAt,
            endAt,
            course?.courseId,
        );
        if (confirmed + held >= service.capacity) {
            throw new ConflictException("This slot is fully booked");
        }
    }
    if (person) {
        await assertPersonFreeInTx(tx, person, serviceId, startAt, endAt);
    }

    const contact = await tx.contact.upsert({
        where: {
            organizationId_email: { organizationId, email },
        },
        update: contactUpdate(input),
        create: {
            organizationId,
            email,
            firstName: splitName(input.bookerName).first ?? null,
            lastName: splitName(input.bookerName).last ?? null,
            phone: input.bookerPhone ?? null,
            source: by.source,
        },
    });

    const booking = await tx.booking.create({
        data: {
            organizationId,
            serviceId,
            contactId: contact.id,
            startAt,
            endAt,
            timezone: service.timezone,
            // A pay-now booking holds its place until paid (U19).
            status: person?.holdUntil ? "PENDING" : "CONFIRMED",
            holdExpiresAt: person?.holdUntil ?? null,
            snapshot: snapshot as Prisma.InputJsonValue,
            bookerName: input.bookerName ?? null,
            bookerEmail: email,
            bookerPhone: input.bookerPhone ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            courseEnrollmentId: course?.enrollmentId ?? null,
            ...(person
                ? {
                      staffId: person.staffId,
                      paidWith: person.paidWith ?? null,
                      subscriptionId: person.subscriptionId ?? null,
                  }
                : {}),
        },
    });

    // Where the history starts. No `fromStartAt`: there was no before.
    // The actor is whoever made it by hand; a booker who did it
    // themselves leaves it empty.
    await tx.bookingEvent.create({
        data: {
            bookingId: booking.id,
            organizationId,
            type: BookingEventType.Booked,
            toStartAt: startAt,
            ...(by.actorUserId ? { actorUserId: by.actorUserId } : {}),
        },
        select: { id: true },
    });

    // A course session's booking is not notified: nothing sends these yet,
    // and one enrolment would queue a dead letter per session (ADR-007).
    if (course) return booking;

    // Transactional outbox: a committed booking always has a queued
    // notification job. The handler never landed: the worker dead-letters
    // booking.notify until one is registered (see
    // jobs/job-consumers.spec.ts).
    await tx.job.create({
        data: {
            organizationId,
            type: "booking.notify",
            payload: {
                bookingId: booking.id,
                serviceId,
                contactId: contact.id,
            },
        },
    });

    return booking;
}

/**
 * One person, one place at a time (U3): inside the booking transaction,
 * refuse when they already have a confirmed booking overlapping — on any
 * service. The person's row is locked first, so two bookings racing for
 * the same person queue on it and the second sees the first.
 *
 * For a class, the other places in the SAME session (same service, same
 * start) are not a clash — they are the class. `excludeBookingId` is a
 * booking being moved, which is not its own competitor.
 */
export async function assertPersonFreeInTx(
    tx: Prisma.TransactionClient,
    person: ReserveWith,
    serviceId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string,
): Promise<void> {
    if (!person.staffId) return;
    await tx.$queryRaw`SELECT id FROM "StaffMember" WHERE id = ${person.staffId} FOR UPDATE`;
    const clashes = await tx.booking.count({
        where: {
            staffId: person.staffId,
            ...holdsPlace(new Date()),
            startAt: { lt: endAt },
            endAt: { gt: startAt },
            ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
            ...(person.perPerson ? {} : { NOT: { serviceId, startAt } }),
        },
    });
    if (clashes > 0) {
        throw new ConflictException({
            message: `${person.staffName ?? "That person"} is already booked then.`,
            field: "staffId",
        });
    }
}

/** The immutable snapshot of Service terms + booker frozen onto a Booking. */
export function buildSnapshot(
    service: Service,
    input: BookInput,
    startAt: Date,
    endAt: Date,
): Record<string, unknown> {
    return {
        service: {
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            bufferBeforeMinutes: service.bufferBeforeMinutes,
            bufferAfterMinutes: service.bufferAfterMinutes,
            capacity: service.capacity,
            timezone: service.timezone,
            priceCents: service.priceCents,
            currency: service.currency,
            // Frozen like the rest: a link changed later reaches new
            // bookings, never the ones already made (ADR-007).
            locationType: service.locationType,
            meetingUrl: service.meetingUrl,
        },
        slot: {
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
        },
        booker: {
            name: input.bookerName ?? null,
            email: input.bookerEmail.trim().toLowerCase(),
            phone: input.bookerPhone ?? null,
        },
    };
}

/** Contact fields to update on a repeat booking (only supplied values). */
export function contactUpdate(input: BookInput): Prisma.ContactUpdateInput {
    const update: Prisma.ContactUpdateInput = {};
    const { first, last } = splitName(input.bookerName);
    if (first !== undefined) update.firstName = first;
    if (last !== undefined) update.lastName = last;
    if (input.bookerPhone !== undefined) update.phone = input.bookerPhone;
    return update;
}

/** Split a single "full name" into first / last parts. */
export function splitName(full: string | undefined): {
    first?: string;
    last?: string;
} {
    if (!full) return {};
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return {};
    if (parts.length === 1) return { first: parts[0] };
    return { first: parts[0], last: parts.slice(1).join(" ") };
}
