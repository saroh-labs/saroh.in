import type { Prisma } from "@saroh/database";

import { BookingEventType } from "./booking-event-type";
import { lockBookingInTx } from "./booking-hold";
import { retirePayLinkInTx } from "./booking-pay-link";

/*
 * A treatment's order cancelled (round-2 B9, E9, DEC-050): its visits still
 * to come are cancelled with it, on the order's transaction and after the
 * order's lock (the documented order: Order → … → Invoice → Booking).
 *
 * A visit never refunds on its own: the order's cancel is a refund of the
 * whole treatment, through the order (`order-cancel.ts`), so nothing here
 * moves money. A visit already seen — attended or missed — stays as it
 * was; an attended one stops the cancel before it gets here (handover).
 */

type Tx = Prisma.TransactionClient;

/**
 * Cancel the order's visits that are still to come: every booking of it
 * not cancelled and with no outcome. Each is locked (its invoice, then
 * itself) and re-read, so a visit cancelled a moment ago is left alone.
 * Returns how many were cancelled.
 */
export async function cancelTreatmentVisitsInTx(
    tx: Tx,
    input: {
        organizationId: string;
        orderId: string;
        actorUserId: string | null;
        now: Date;
    },
): Promise<number> {
    const visits = await tx.booking.findMany({
        where: {
            orderId: input.orderId,
            organizationId: input.organizationId,
            status: { not: "CANCELLED" },
            outcome: null,
        },
        orderBy: { id: "asc" },
        select: { id: true },
    });
    let cancelled = 0;
    for (const visit of visits) {
        await lockBookingInTx(tx, visit.id);
        const booking = await tx.booking.findUnique({
            where: { id: visit.id },
            select: { id: true, status: true, outcome: true, startAt: true },
        });
        if (!booking || booking.status === "CANCELLED" || booking.outcome) {
            continue;
        }
        await tx.booking.update({
            where: { id: booking.id },
            data: {
                status: "CANCELLED",
                cancelledAt: input.now,
                cancelledLate: false,
            },
            select: { id: true },
        });
        // Visit 1's invoice is the order's (E9): no one should pay it now.
        await retirePayLinkInTx(tx, booking.id);
        await tx.bookingEvent.create({
            data: {
                bookingId: booking.id,
                organizationId: input.organizationId,
                type: BookingEventType.Cancelled,
                actorUserId: input.actorUserId,
                fromStartAt: booking.startAt,
            },
            select: { id: true },
        });
        cancelled += 1;
    }
    return cancelled;
}

/** Whether any visit of the treatment has been attended: it has begun. */
export async function treatmentBegunInTx(
    db: Pick<Tx, "booking">,
    orderId: string,
): Promise<boolean> {
    const attended = await db.booking.count({
        where: { orderId, outcome: "ATTENDED" },
    });
    return attended > 0;
}
