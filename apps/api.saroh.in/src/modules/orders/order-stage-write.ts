import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    cancelOrderStepNotice,
    enqueueOrderStepNotice,
} from "../site-accounts/customer-notify-queue";
import type { MoveStageDto, OrderStage } from "./dto";
import { applyInventoryTransition, phaseOf } from "./order-inventory";
import { planStageMove, planUndo } from "./order-stage";

/**
 * One order's stage move and its Undo, written on the caller's transaction
 * (ADR-008, U6). Split out of `OrderKitchenService` for bulk moves (round-2
 * B6): a batch line must write its move and its own result in ONE
 * transaction, so the kitchen's single move and every batch line share this
 * exact write — its stock, its event, and A14's customer notice queued once
 * per event — rather than a second copy of it.
 *
 * No authorization here: the callers check `order:stage` against the
 * request, and the batch's job writes in the name of whoever asked.
 */

/** Who a write is recorded against: the business, and the person. */
export type StageActor = Pick<OrganizationContext, "organizationId" | "userId">;

/** The courier's details: typed at the handover, or added after it. */
export const COURIER_FIELDS = [
    "courierName",
    "trackingNumber",
    "trackingUrl",
] as const;
export type CourierField = (typeof COURIER_FIELDS)[number];

export const COURIER_FIELD_WORDS: Record<CourierField, string> = {
    courierName: "A courier's name",
    trackingNumber: "A tracking number",
    trackingUrl: "A tracking link",
};

/** The handover step's words: the courier and number given with it, if any. */
function handoverNote(dto: MoveStageDto): string | null {
    const words = [dto.courierName, dto.trackingNumber].filter(
        (w): w is string => typeof w === "string" && w !== "",
    );
    return words.length > 0 ? words.join(" · ") : null;
}

/**
 * The order is no longer where the caller saw it (a bulk line's `from`):
 * someone else moved it meanwhile. Nothing was written.
 */
export class StageMovedOnError extends Error {
    constructor(readonly stage: OrderStage) {
        super("This order was moved by someone else.");
        this.name = "StageMovedOnError";
    }
}

/**
 * Take the order's row lock and load what every kitchen write needs. Scoped
 * to the caller's organization: another business's order is a 404.
 */
export async function lockOrder(
    tx: Prisma.TransactionClient,
    ctx: Pick<OrganizationContext, "organizationId">,
    orderId: string,
) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: ctx.organizationId },
        include: {
            items: {
                orderBy: { id: "asc" },
                include: {
                    product: {
                        select: {
                            name: true,
                            status: true,
                            fulfilmentTypes: true,
                        },
                    },
                    refundLines: {
                        where: {
                            paymentRefund: { status: { not: "FAILED" } },
                        },
                        select: { id: true },
                    },
                },
            },
        },
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
}

/**
 * Move the order to its next kitchen stage, and its status with it. Stock
 * follows the status (a collected or dispatched order commits what it
 * held); Ready and a handover queue the customer's notice ten seconds on
 * (A14). `expectFrom`, when given, is where the caller saw the order: an
 * order found anywhere else throws {@link StageMovedOnError} before
 * anything is written.
 */
export async function writeStageMove(
    tx: Prisma.TransactionClient,
    actor: StageActor,
    orderId: string,
    dto: MoveStageDto,
    expectFrom?: OrderStage,
): Promise<{ id: string; stage: string; status: string; eventId: string }> {
    const order = await lockOrder(tx, actor, orderId);
    if (expectFrom !== undefined && order.stage !== expectFrom) {
        throw new StageMovedOnError(order.stage);
    }
    const move = planStageMove(
        {
            stage: order.stage,
            status: order.status,
            paymentStatus: order.paymentStatus,
            fulfilment: order.fulfilment,
            payOnHandover: order.payOnHandover,
        },
        dto.to,
    );
    // The courier's details belong to the handover to one (DEC-045): all
    // optional there, and refused on any other step.
    if (move.to !== "HANDED_TO_COURIER") {
        const stray = COURIER_FIELDS.find((f) => dto[f]);
        if (stray) {
            throw new BadRequestException({
                message: `${COURIER_FIELD_WORDS[stray]} goes with handing the order to a courier.`,
                field: stray,
            });
        }
    }
    await applyInventoryTransition(
        tx,
        order.items,
        phaseOf(move.fromStatus),
        phaseOf(move.toStatus),
        actor.userId,
    );
    await tx.order.update({
        where: { id: order.id },
        data: {
            stage: move.to,
            status: move.toStatus,
            ...(dto.trackingUrl ? { trackingUrl: dto.trackingUrl } : {}),
            ...(dto.courierName ? { courierName: dto.courierName } : {}),
            ...(dto.trackingNumber
                ? { trackingNumber: dto.trackingNumber }
                : {}),
        },
    });
    const event = await tx.orderEvent.create({
        data: {
            organizationId: actor.organizationId,
            orderId: order.id,
            kind: "STAGE",
            actorUserId: actor.userId,
            fromStage: move.from,
            toStage: move.to,
            fromStatus: move.fromStatus,
            toStatus: move.toStatus,
            // The handover's step says who took it and their number
            // ("Delhivery · AWB4411"), as they were at the handover: the
            // order's own fields may be corrected later.
            note:
                dto.note ??
                (move.to === "HANDED_TO_COURIER" ? handoverNote(dto) : null),
        },
        select: { id: true },
    });
    // Ready and the handover tell the customer, 10 seconds later so an Undo
    // can take it back (A14, `customer.notify`).
    await enqueueOrderStepNotice(tx, {
        organizationId: actor.organizationId,
        orderId: order.id,
        orderEventId: event.id,
        stage: move.to,
        now: new Date(),
    });
    return {
        id: order.id,
        stage: move.to,
        status: move.toStatus,
        eventId: event.id,
    };
}

/**
 * Undo the last kitchen step, named by its event. Only the latest step,
 * only once, only within the window (order-stage.ts); its stock moves are
 * reversed on the rows the lines recorded, and the undo is itself a step on
 * the timeline.
 *
 * The step's notice to the customer (A14) is taken back if it hasn't gone;
 * `told` says it had, for "They've already been told" (B6).
 */
export async function writeStageUndo(
    tx: Prisma.TransactionClient,
    actor: StageActor,
    orderId: string,
    eventId: string,
): Promise<{
    id: string;
    stage: string;
    status: string;
    eventId: string;
    told: boolean;
}> {
    const order = await lockOrder(tx, actor, orderId);
    const event = await tx.orderEvent.findFirst({
        where: { id: eventId, orderId: order.id },
    });
    if (!event) throw new NotFoundException("That step is not on this order");
    const latest = await tx.orderEvent.findFirst({
        where: { orderId: order.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
    });
    const now = new Date();
    const back = planUndo(
        { stage: order.stage, status: order.status },
        { ...event, fromStage: event.fromStage, toStage: event.toStage },
        latest?.id ?? null,
        now,
    );
    await applyInventoryTransition(
        tx,
        order.items,
        phaseOf(order.status),
        phaseOf(back.status),
        actor.userId,
    );
    await tx.order.update({
        where: { id: order.id },
        data: { stage: back.stage, status: back.status },
    });
    await tx.orderEvent.update({
        where: { id: event.id },
        data: { undoneAt: now },
    });
    const undo = await tx.orderEvent.create({
        data: {
            organizationId: actor.organizationId,
            orderId: order.id,
            kind: "UNDO",
            actorUserId: actor.userId,
            fromStage: order.stage,
            toStage: back.stage,
            fromStatus: order.status,
            toStatus: back.status,
            undoesEventId: event.id,
        },
        select: { id: true },
    });
    const notice = await cancelOrderStepNotice(
        tx,
        actor.organizationId,
        event.id,
    );
    return {
        id: order.id,
        stage: back.stage,
        status: back.status,
        eventId: undo.id,
        told: notice.told,
    };
}
