import type { Booking, Prisma } from "@saroh/database";

import { settleTreatmentInTx } from "../orders/treatment-fulfil";
import { BookingEventType } from "./booking-event-type";
import type { BookingOutcome } from "./dto";

/*
 * Saying how an appointment went (#241), as one write shared by the booking
 * detail's Arrived / No-show and Order Detail's "Mark visit N attended"
 * (B14): the booking's outcome, its history line, and — for a visit of a
 * treatment (E9) — the order, which is fulfilled once its last visit is
 * attended.
 *
 * The caller holds the order's lock when the booking is a visit (the
 * documented order: order, then booking), and has already checked that the
 * outcome can be said now (`outcomeTooEarly`, or the card's stricter "once
 * it has started").
 */

type Tx = Prisma.TransactionClient;

/** Take a visit's order lock before its booking is written (E9's order). */
export async function lockVisitOrderInTx(
    tx: Tx,
    orderId: string | null,
): Promise<void> {
    if (!orderId) return;
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

/**
 * Write the outcome and its history line, then settle the treatment the
 * booking is a visit of. The slot it is about goes on the line, like
 * CANCELLED, so the history says which appointment.
 */
export async function writeOutcomeInTx(
    tx: Tx,
    actor: { organizationId: string; userId: string | null },
    booking: Pick<Booking, "id" | "startAt" | "orderId">,
    outcome: BookingOutcome,
): Promise<Booking> {
    const updated = await tx.booking.update({
        where: { id: booking.id },
        data: { outcome },
    });
    await tx.bookingEvent.create({
        data: {
            bookingId: booking.id,
            organizationId: actor.organizationId,
            type:
                outcome === "ATTENDED"
                    ? BookingEventType.Attended
                    : BookingEventType.NoShow,
            actorUserId: actor.userId,
            fromStartAt: booking.startAt,
        },
        select: { id: true },
    });
    if (booking.orderId) {
        await settleTreatmentInTx(tx, actor, booking.orderId);
    }
    return updated;
}
