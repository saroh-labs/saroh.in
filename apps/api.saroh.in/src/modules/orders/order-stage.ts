import { BadRequestException, ConflictException } from "@nestjs/common";

import type { OrderFulfilment, OrderStage, OrderStatus } from "./dto";
import { assertStatusTransition } from "./order-state";

/**
 * The kitchen flow (ADR-008, U6) — the stage that sits UNDER an order's
 * status.
 *
 * Pure, like `order-state.ts`: no Nest DI, no Prisma. The service loads the
 * order under its row lock, asks this module what a move means, and writes
 * exactly that. Every rule about which kitchen step may follow which lives
 * here and nowhere else.
 *
 *   NEW ──► PREPARING ──► READY ──► COLLECTED                (collection)
 *                               └─► HANDED_TO_COURIER ──► DELIVERED (delivery)
 *
 * Each move is also a status move (or none):
 *
 *   NEW → PREPARING               PENDING    → PROCESSING
 *   PREPARING → READY             PROCESSING   (unchanged)
 *   READY → COLLECTED             PROCESSING → DELIVERED   (ADR-008's one widening)
 *   READY → HANDED_TO_COURIER     PROCESSING → SHIPPED
 *   HANDED_TO_COURIER → DELIVERED SHIPPED    → DELIVERED
 *
 * Nothing moves backwards except an Undo of the LAST step, by its event,
 * within {@link UNDO_WINDOW_MS}. The status table stays forward-only; an
 * undo restores the exact from-state its event recorded instead.
 */

// The vocabularies live with the DTOs that validate them (dto.ts), so this
// module and dto.ts never import each other.
export { ORDER_FULFILMENTS, ORDER_STAGES } from "./dto";
export type { OrderFulfilment, OrderStage } from "./dto";

/**
 * How long a kitchen step can be undone: ten minutes.
 *
 * The screen offers Undo for seconds (the toast), but a tab left open would
 * keep the button; this is the server's answer to "undo a delivered order an
 * hour later". Ten minutes covers a wrong tap noticed at the counter, and is
 * short enough that the step has not become something the customer relied
 * on. Chosen in U6 (the plan left the number to implementation).
 */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export interface StageMove {
    from: OrderStage;
    to: OrderStage;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    /** A move that only one kind of order makes. */
    only?: OrderFulfilment;
}

/** Every legal forward move. Terminal stages have none. */
export const STAGE_MOVES: readonly StageMove[] = [
    {
        from: "NEW",
        to: "PREPARING",
        fromStatus: "PENDING",
        toStatus: "PROCESSING",
    },
    {
        from: "PREPARING",
        to: "READY",
        fromStatus: "PROCESSING",
        toStatus: "PROCESSING",
    },
    {
        from: "READY",
        to: "COLLECTED",
        fromStatus: "PROCESSING",
        toStatus: "DELIVERED",
        only: "COLLECT",
    },
    {
        from: "READY",
        to: "HANDED_TO_COURIER",
        fromStatus: "PROCESSING",
        toStatus: "SHIPPED",
        only: "DELIVERY",
    },
    {
        from: "HANDED_TO_COURIER",
        to: "DELIVERED",
        fromStatus: "SHIPPED",
        toStatus: "DELIVERED",
        only: "DELIVERY",
    },
];

const STAGE_WORDS: Record<OrderStage, string> = {
    NEW: "new",
    PREPARING: "preparing",
    READY: "ready",
    COLLECTED: "collected",
    HANDED_TO_COURIER: "handed to the courier",
    DELIVERED: "delivered",
};

/** What the service knows about an order when it asks for a move. */
export interface StageSubject {
    stage: OrderStage;
    status: string;
    paymentStatus: string;
    fulfilment: OrderFulfilment;
}

/**
 * The next step(s) an order can take from where it is, for the screen. An
 * unpaid order has none until it is paid — the kitchen is blocked, and the
 * screen says why from `paymentStatus`.
 */
export function nextStages(order: StageSubject): OrderStage[] {
    if (order.status === "CANCELLED") return [];
    return STAGE_MOVES.filter(
        (m) =>
            m.from === order.stage &&
            m.fromStatus === order.status &&
            (!m.only || m.only === order.fulfilment) &&
            (m.to !== "PREPARING" || order.paymentStatus === "PAID"),
    ).map((m) => m.to);
}

/**
 * Work out a forward move, or refuse it. Throws 400 for a move the flow does
 * not have, and 409 when the order's own state forbids it now (cancelled,
 * unpaid, out of step with its status). Returns the move to write.
 */
export function planStageMove(order: StageSubject, to: OrderStage): StageMove {
    if (order.status === "CANCELLED") {
        throw new ConflictException({
            message: "This order was cancelled, so it does not move on.",
            field: "stage",
        });
    }
    const move = STAGE_MOVES.find((m) => m.from === order.stage && m.to === to);
    if (!move) {
        throw new BadRequestException({
            message: `An order that is ${STAGE_WORDS[order.stage]} cannot become ${STAGE_WORDS[to]}.`,
            field: "stage",
        });
    }
    if (move.only && move.only !== order.fulfilment) {
        throw new BadRequestException({
            message:
                move.only === "COLLECT"
                    ? "This order is for delivery, so it is handed to a courier, not collected."
                    : "This order is collected at the counter, so it is not handed to a courier.",
            field: "stage",
        });
    }
    if (order.status !== move.fromStatus) {
        // A stage and a status that disagree — an order moved by the old
        // status PATCH. Refused rather than guessed at.
        throw new ConflictException({
            message: `This order's status (${order.status}) does not match its kitchen step. Reload it and try again.`,
            field: "stage",
        });
    }
    if (move.to === "PREPARING" && order.paymentStatus !== "PAID") {
        throw new ConflictException({
            message:
                "This order is not paid yet, so it cannot start preparing. Take the payment first.",
            field: "paymentStatus",
        });
    }
    if (move.fromStatus !== move.toStatus) {
        assertStatusTransition(move.fromStatus, move.toStatus);
    }
    return move;
}

/** A recorded step, as far as undoing it needs to know. */
export interface StageEvent {
    id: string;
    kind: string;
    fromStage: OrderStage | null;
    toStage: OrderStage | null;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: Date;
    undoneAt: Date | null;
}

/**
 * Work out an Undo of `event`, or refuse it. Only the latest step on the
 * order, only a kitchen step, only once, only within the window, and only
 * while the order still stands where that step left it. Returns the state to
 * restore.
 */
export function planUndo(
    order: { stage: OrderStage; status: string },
    event: StageEvent,
    latestEventId: string | null,
    now: Date,
): { stage: OrderStage; status: OrderStatus } {
    if (event.kind !== "STAGE") {
        throw new BadRequestException({
            message: "Only a kitchen step can be undone.",
            field: "eventId",
        });
    }
    if (event.undoneAt) {
        throw new ConflictException({
            message: "That step was already undone.",
            field: "eventId",
        });
    }
    if (event.id !== latestEventId) {
        throw new ConflictException({
            message: "Only the last step on an order can be undone.",
            field: "eventId",
        });
    }
    if (now.getTime() - event.createdAt.getTime() > UNDO_WINDOW_MS) {
        throw new ConflictException({
            message: "It is too late to undo that step.",
            field: "eventId",
        });
    }
    if (
        !event.fromStage ||
        !event.fromStatus ||
        order.stage !== event.toStage ||
        order.status !== event.toStatus
    ) {
        throw new ConflictException({
            message: "This order has moved on since that step.",
            field: "eventId",
        });
    }
    return {
        stage: event.fromStage,
        status: event.fromStatus as OrderStatus,
    };
}

/**
 * Whether an order's items, address and fulfilment can still change: only
 * before anyone starts on it (ADR-008).
 */
export function canEditItems(order: {
    stage: OrderStage;
    status: string;
    paymentStatus: string;
}): boolean {
    return (
        order.stage === "NEW" &&
        order.status === "PENDING" &&
        order.paymentStatus !== "REFUNDED"
    );
}

/**
 * The kitchen step a status change made OUTSIDE the kitchen flow implies —
 * the store-scoped status PATCH that predates stages. Keeps the two in step
 * so the next kitchen move is not refused as out of step. A cancel leaves
 * the stage where it was.
 */
export function stageForStatus(
    status: OrderStatus,
    current: { stage: OrderStage; fulfilment: OrderFulfilment },
): { stage: OrderStage; fulfilment: OrderFulfilment } {
    switch (status) {
        case "PENDING":
            return { stage: "NEW", fulfilment: current.fulfilment };
        case "PROCESSING":
            return {
                stage: current.stage === "READY" ? "READY" : "PREPARING",
                fulfilment: current.fulfilment,
            };
        case "SHIPPED":
            return { stage: "HANDED_TO_COURIER", fulfilment: "DELIVERY" };
        case "DELIVERED":
            return current.fulfilment === "COLLECT" &&
                current.stage !== "HANDED_TO_COURIER"
                ? { stage: "COLLECTED", fulfilment: "COLLECT" }
                : { stage: "DELIVERED", fulfilment: "DELIVERY" };
        case "CANCELLED":
        default:
            return current;
    }
}
