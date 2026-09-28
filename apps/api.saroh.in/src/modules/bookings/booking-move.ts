import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { isSerializationFailure } from "../../common/prisma-errors";
import { guarded, guardMinutes, isValidSlotStart } from "./availability";
import { BookingEventType } from "./booking-event-type";
import { holdsPlace } from "./booking-hold";
import {
    loadStaffing,
    refuseIfClosed,
    resolvePerson,
    toAvailabilityService,
} from "./booking-slots";
import { courseSeatsHeld } from "./course-seats";
import type { ReserveWith } from "./reservation";
import { assertPersonFreeInTx } from "./reservation";
import { useMembershipInTx } from "./use-membership";
import { refuseClosedTreatment } from "./visits";

/*
 * Moving a booking to another start (#121, U3), whoever moves it: the team
 * from the workspace (`BookingsService.rescheduleBooking`), or the customer
 * from their account on the business's site (A6). One write, so a move
 * reads the same whichever side makes it; the caller has found the booking
 * and the service, and checked who may and when.
 *
 * - The new time must be a real open slot, checked as the booking page
 *   checks it; a booking with a person moves within that person's diary.
 * - Capacity is re-counted inside a serializable transaction that excludes
 *   the booking itself, so a move and a booking racing for the last seat
 *   can't both win.
 * - A pack's class is paid only while the pack is good on the day; a
 *   membership's class needs a class left in the month it lands in.
 * - `Booking.snapshot` and `freeCancelUntil` are never rewritten: the
 *   terms and the free-cancel deadline are the ones agreed at booking
 *   (DEC-051), so moving later never makes a late cancel free.
 * - A visit of a treatment (E9) takes its order's lock first (order →
 *   booking, the documented order); the customer's move is refused once
 *   the treatment's order is cancelled or refunded (`refuseClosedTreatment`).
 */

/** Who is moving it, as the booking's history needs. */
export interface MoveActor {
    organizationId: string;
    /** The team member; null when the customer moves it themselves. */
    userId: string | null;
}

export interface MoveOptions {
    /**
     * Who hears why a person can't: the team is told (booked, not
     * working); a customer only that the time is not available.
     */
    audience: "team" | "public";
    /**
     * The sentence a customer hears when the time was taken meanwhile
     * ("That time just went"), in place of the team's.
     */
    slotTaken?: string;
    /** Refuse a visit of a treatment whose order is closed (E9). */
    refuseClosedTreatment?: boolean;
}

/** Move `booking` of `service` to `startAt`. See the file comment. */
export async function moveFoundBooking(
    booking: Booking,
    service: Service,
    startAt: Date,
    actor: MoveActor,
    options: MoveOptions,
): Promise<Booking> {
    const taken = (err: unknown): unknown =>
        options.slotTaken && err instanceof ConflictException
            ? new ConflictException({
                  message: options.slotTaken,
                  details: { reason: "slot-taken" },
              })
            : err;

    await refuseIfClosed(
        service.organizationId,
        startAt,
        new Date(startAt.getTime() + service.durationMinutes * 60_000),
    );
    const rules = await prisma.availabilityRule.findMany({
        where: { serviceId: service.id },
    });
    const availService = toAvailabilityService(service);
    // A booking with a person moves within that person's diary (U3):
    // one-to-one, to one of their free starts; a class, on the class's
    // own grid with its instructor checked for a clash.
    const staffing = booking.staffId
        ? await loadStaffing(service)
        : { people: [], perPerson: false, zone: null };
    let person: ReserveWith = { staffId: null, perPerson: false };
    if (booking.staffId && staffing.perPerson) {
        try {
            person = await resolvePerson(
                service,
                rules,
                staffing,
                startAt,
                booking.staffId,
                options.audience,
                booking.id,
            );
        } catch (err) {
            throw taken(err);
        }
    } else {
        if (!isValidSlotStart(availService, rules, startAt)) {
            throw new BadRequestException(
                "That is not a bookable slot for this service",
            );
        }
        if (booking.staffId) {
            const instructor = staffing.people.find(
                (p) => p.id === booking.staffId,
            );
            person = {
                staffId: booking.staffId,
                staffName: instructor?.name,
                perPerson: false,
            };
        }
    }
    const endAt = new Date(
        startAt.getTime() + service.durationMinutes * 60_000,
    );
    // The buffers either side stay clear (DEC-052), as the listing keeps.
    const clear = guarded({ startAt, endAt }, availService);

    try {
        return await prisma.$transaction(
            async (tx) => {
                // A visit's order first (E9): the documented lock order.
                // Closed since it was read, the treatment moves no more.
                if (booking.orderId) {
                    const [order] = await tx.$queryRaw<
                        { status: string; paymentStatus: string }[]
                    >`SELECT status::text AS status, "paymentStatus"::text AS "paymentStatus"
                      FROM "Order" WHERE id = ${booking.orderId} FOR UPDATE`;
                    if (options.refuseClosedTreatment) {
                        refuseClosedTreatment(order);
                    }
                }
                if (!person.perPerson) {
                    const count = await tx.booking.count({
                        where: {
                            serviceId: service.id,
                            ...holdsPlace(new Date()),
                            startAt: { lt: clear.endAt },
                            endAt: { gt: clear.startAt },
                            // Itself is not a competitor for its own seat.
                            id: { not: booking.id },
                        },
                    });
                    const held = await courseSeatsHeld(
                        tx,
                        service.id,
                        clear.startAt,
                        clear.endAt,
                    );
                    if (count + held >= service.capacity) {
                        throw taken(
                            new ConflictException("That slot is fully booked"),
                        );
                    }
                }
                try {
                    await assertPersonFreeInTx(
                        tx,
                        person,
                        service.id,
                        startAt,
                        endAt,
                        booking.id,
                        guardMinutes(availService),
                    );
                } catch (err) {
                    throw taken(err);
                }
                // A class paid with a pack is only paid while the pack
                // is good on the day (ADR-007): the same rule as spending.
                const paid = await tx.packRedemption.findFirst({
                    where: { bookingId: booking.id, reversedAt: null },
                    select: { purchase: { select: { expiresAt: true } } },
                });
                if (paid && paid.purchase.expiresAt <= startAt) {
                    throw new ConflictException(
                        options.audience === "public"
                            ? "The class pack that paid for this booking runs out before then. Pick an earlier time."
                            : "The class pack that paid for this booking expires before that time. Pick an earlier time, or take the pack off the booking first.",
                    );
                }
                // A membership's class is one of the month it lands in
                // (#508): moved into another month, it needs a class
                // left there, on a membership still active. The booking
                // itself is not counted, so a move within its month fits.
                if (
                    booking.paidWith === "MEMBERSHIP" &&
                    booking.subscriptionId
                ) {
                    await useMembershipInTx(tx, {
                        organizationId: actor.organizationId,
                        bookingId: booking.id,
                        contactId: booking.contactId ?? "",
                        subscriptionId: booking.subscriptionId,
                        startAt,
                    });
                }

                const moved = await tx.booking.update({
                    where: { id: booking.id },
                    data: { startAt, endAt },
                });
                // No actor is the customer themselves ("by the customer").
                const event = await tx.bookingEvent.create({
                    data: {
                        bookingId: booking.id,
                        organizationId: actor.organizationId,
                        type: BookingEventType.Rescheduled,
                        actorUserId: actor.userId,
                        fromStartAt: booking.startAt,
                        toStartAt: startAt,
                    },
                    select: { id: true },
                });
                // Same transactional outbox as booking: a committed move
                // always has its notice queued, so a failed send cannot
                // drop it. A14's `booking-notify.handler.ts` tells the
                // customer, and the team when the customer moved it.
                await tx.job.create({
                    data: {
                        organizationId: actor.organizationId,
                        type: "booking.notify",
                        payload: {
                            bookingId: booking.id,
                            serviceId: service.id,
                            contactId: booking.contactId,
                            reason: "rescheduled",
                            eventId: event.id,
                        },
                    },
                    select: { id: true },
                });
                return moved;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    } catch (err) {
        // Lost the race with a concurrent booking for the same seat.
        if (isSerializationFailure(err)) {
            throw taken(new ConflictException("That slot is fully booked"));
        }
        throw err;
    }
}
