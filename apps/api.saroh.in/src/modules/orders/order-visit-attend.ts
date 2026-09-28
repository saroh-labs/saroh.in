import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { writeOutcomeInTx } from "../bookings/booking-outcome";
import { authorize } from "../organizations/organization-policy";
import type { TreatmentSettled } from "./treatment-fulfil";
import { settleTreatmentInTx } from "./treatment-fulfil";

/*
 * "Mark visit N attended" on Order Detail's Visits card (B14, R16). The
 * outcome write the booking detail's Arrived makes (`booking-outcome.ts`),
 * reached from the order under `order:stage` — the action that moves an
 * order through its steps — and stricter on time: only once the visit has
 * started (DESIGN-NOTES), where the desk may check someone in an hour early.
 *
 * Under the order's lock, then the booking's row (the documented order), so
 * a visit booked, moved, cancelled or refunded on the same order waits its
 * turn. The last visit attended fulfils the order (`treatment-fulfil.ts`).
 */

/** Why a visit can't be marked yet: it hasn't started. */
export function visitNotStartedText(n: number): string {
    return `Visit ${n} hasn't started yet. You can mark it attended once it starts.`;
}

interface LockedOrder {
    id: string;
    status: string;
    paymentStatus: string;
}

export interface VisitAttended extends TreatmentSettled {
    orderId: string;
    visitNumber: number;
}

export async function markVisitAttended(
    ctx: OrganizationContext,
    orderId: string,
    visitNumber: number,
    now: Date = new Date(),
): Promise<VisitAttended> {
    authorize(ctx, "order:stage");
    if (!Number.isInteger(visitNumber) || visitNumber < 1) {
        throw new BadRequestException({
            message: "Choose which visit was attended.",
            field: "visitNumber",
        });
    }
    return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<LockedOrder[]>`
          SELECT id, status::text AS status, "paymentStatus"::text AS "paymentStatus"
          FROM "Order"
          WHERE id = ${orderId} AND "organizationId" = ${ctx.organizationId}
          FOR UPDATE`;
        if (locked.length === 0) {
            throw new NotFoundException("Order not found");
        }
        const order = locked[0];
        if (order.status === "CANCELLED") {
            throw new ConflictException(
                "This treatment's order was cancelled, so its visits can't be marked.",
            );
        }
        if (order.paymentStatus === "REFUNDED") {
            throw new ConflictException(
                "This treatment was refunded in full, so its visits can't be marked.",
            );
        }
        const visit = await tx.booking.findFirst({
            where: {
                orderId: order.id,
                visitNumber,
                status: { not: "CANCELLED" },
            },
            select: {
                id: true,
                startAt: true,
                orderId: true,
                outcome: true,
            },
        });
        if (!visit) {
            const treatment = await tx.orderItem.count({
                where: { orderId: order.id, serviceId: { not: null } },
            });
            throw new ConflictException(
                treatment === 0
                    ? "This order isn't a treatment."
                    : `Visit ${visitNumber} isn't booked yet.`,
            );
        }
        if (visit.startAt.getTime() > now.getTime()) {
            throw new ConflictException(visitNotStartedText(visitNumber));
        }
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${visit.id} FOR UPDATE`;
        if (visit.outcome !== "ATTENDED") {
            // Already said is not an error, and not a second history line.
            await writeOutcomeInTx(tx, ctx, visit, "ATTENDED");
        }
        // In step already after the write; read again for the answer.
        const settled = await settleTreatmentInTx(tx, ctx, order.id);
        return {
            orderId: order.id,
            visitNumber,
            visits: settled?.visits ?? visitNumber,
            attended: settled?.attended ?? 0,
            done: settled?.done ?? false,
        };
    });
}
