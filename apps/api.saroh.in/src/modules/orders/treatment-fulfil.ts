import type { OrderStage, Prisma } from "@saroh/database";

import { treatmentProgressInTx } from "../bookings/visits";

/*
 * A treatment's order is fulfilled by its visits (B14, DEC-050, default 40):
 * it has no kitchen stages, and it reaches DELIVERED — stage and status —
 * when its last visit is attended. Called by every write of a visit's
 * outcome (`bookings/booking-outcome.ts`), on the caller's transaction and
 * under the order's lock.
 *
 * - The step is a STATUS event, not a STAGE one: the kitchen's Undo never
 *   offers it. A visit's attendance is corrected on the visit, and the order
 *   follows.
 * - Corrected afterwards (the last visit said No-show after all), the order
 *   goes back to where it was before it was fulfilled.
 * - A cancelled order is left alone: its visits no longer change it.
 */

type Tx = Prisma.TransactionClient;

/** The step's note on the timeline once every visit is attended. */
export function fulfilledNote(visits: number): string {
    return visits === 1
        ? "The visit was attended"
        : `All ${visits} visits attended`;
}

/** The note when a correction takes the order back from fulfilled. */
export const REOPENED_NOTE = "A visit's attendance was corrected";

export interface TreatmentSettled {
    visits: number;
    attended: number;
    /** Every visit attended: the order is fulfilled. */
    done: boolean;
}

/**
 * Bring the order in step with its visits. Null for an order that isn't a
 * treatment. Writes only when the order's standing changes.
 */
export async function settleTreatmentInTx(
    tx: Tx,
    actor: { organizationId: string; userId: string | null },
    orderId: string,
): Promise<TreatmentSettled | null> {
    const progress = await treatmentProgressInTx(tx, orderId);
    if (!progress) return null;
    const settled = {
        visits: progress.visits,
        attended: progress.attended,
        done: progress.done,
    };
    const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { stage: true, status: true },
    });
    if (!order || order.status === "CANCELLED") return settled;

    const fulfilled = order.stage === "DELIVERED";
    if (progress.done && !fulfilled) {
        await tx.order.update({
            where: { id: orderId },
            data: { stage: "DELIVERED", status: "DELIVERED" },
            select: { id: true },
        });
        await tx.orderEvent.create({
            data: {
                organizationId: actor.organizationId,
                orderId,
                kind: "STATUS",
                actorUserId: actor.userId,
                fromStage: order.stage,
                toStage: "DELIVERED",
                fromStatus: order.status,
                toStatus: "DELIVERED",
                note: fulfilledNote(progress.visits),
            },
            select: { id: true },
        });
    } else if (!progress.done && fulfilled) {
        // Back to where the step that fulfilled it found it.
        const step = await tx.orderEvent.findFirst({
            where: { orderId, kind: "STATUS", toStage: "DELIVERED" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { fromStage: true, fromStatus: true },
        });
        const stage: OrderStage = step?.fromStage ?? "NEW";
        const status =
            step?.fromStatus && step.fromStatus !== "DELIVERED"
                ? step.fromStatus
                : "PENDING";
        await tx.order.update({
            where: { id: orderId },
            data: { stage, status },
            select: { id: true },
        });
        await tx.orderEvent.create({
            data: {
                organizationId: actor.organizationId,
                orderId,
                kind: "STATUS",
                actorUserId: actor.userId,
                fromStage: order.stage,
                toStage: stage,
                fromStatus: order.status,
                toStatus: status,
                note: REOPENED_NOTE,
            },
            select: { id: true },
        });
    }
    return settled;
}
