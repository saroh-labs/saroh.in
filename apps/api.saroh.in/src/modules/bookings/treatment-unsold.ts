import type { Prisma } from "@saroh/database";

/**
 * A treatment's order whose visit 1 was a pay-now hold that was let go
 * (#508, E9): nothing was paid and nothing else is booked, so the
 * treatment was never sold and its order is cancelled with it. Called by
 * `releaseHoldInTx` after the hold is released, on its transaction.
 *
 * It takes no lock of its own before the write: the hold's invoice and
 * booking locks are already held, and the lock order puts the Order before
 * them. The update's own row lock is the one it takes, and it re-checks
 * that the order is still unpaid with nothing booked.
 *
 * Its own file, with no imports from the booking module, so the hold code
 * can call it without a cycle through `visits.ts`.
 */
export async function cancelUnsoldTreatmentInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorUserId: string | null,
): Promise<boolean> {
    const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            organizationId: true,
            status: true,
            stage: true,
        },
    });
    if (!order || order.status === "CANCELLED") return false;
    const { count } = await tx.order.updateMany({
        where: {
            id: order.id,
            status: { not: "CANCELLED" },
            paymentStatus: "UNPAID",
            bookings: { none: { status: { not: "CANCELLED" } } },
        },
        data: { status: "CANCELLED" },
    });
    if (count === 0) return false;
    if (order.organizationId) {
        await tx.orderEvent.create({
            data: {
                organizationId: order.organizationId,
                orderId: order.id,
                kind: "STATUS",
                actorUserId,
                fromStage: order.stage,
                toStage: order.stage,
                fromStatus: order.status,
                toStatus: "CANCELLED",
                note: "Not paid at booking, so the treatment wasn't sold.",
            },
            select: { id: true },
        });
    }
    return true;
}
