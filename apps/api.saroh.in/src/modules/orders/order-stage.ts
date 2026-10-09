import { BadRequestException, ConflictException } from "@nestjs/common";

import type {
    FulfilmentType,
    OrderFulfilment,
    OrderStage,
    OrderStatus,
} from "./dto";
import type { StageMove } from "./fulfilment";
import {
    FULFILMENT_RULES,
    FULFILMENT_TYPES,
    movesFor,
    typeOf,
} from "./fulfilment";
import { assertStatusTransition } from "./order-state";

/**
 * The kitchen flow (ADR-008, U6) — the stage that sits UNDER an order's
 * status.
 *
 * Pure, like `order-state.ts`: no Nest DI, no Prisma. The service loads the
 * order under its row lock, asks this module what a move means, and writes
 * exactly that. Which steps each type of order takes, and the status each
 * step is, live in `fulfilment.ts` (DEC-045); this module applies them.
 *
 *   Pick-up         NEW ─► PREPARING ─► READY ─► COLLECTED
 *   Local delivery                       READY ─► OUT_FOR_DELIVERY ─► DELIVERED
 *                   (handed over before B2c's switch: HANDED_TO_COURIER ─► DELIVERED)
 *   Shipping                             READY ─► HANDED_TO_COURIER ─► DELIVERED
 *   Digital         NEW (paid) ─► SENT
 *   Appointments    no kitchen steps: their visits finish them
 *
 * Each move is also a status move (or none):
 *
 *   NEW → PREPARING               PENDING    → PROCESSING
 *   PREPARING → READY             PROCESSING   (unchanged)
 *   READY → COLLECTED             PROCESSING → DELIVERED   (ADR-008's one widening)
 *   READY → handed over           PROCESSING → SHIPPED
 *   handed over → DELIVERED       SHIPPED    → DELIVERED
 *   NEW → SENT (Digital)          PENDING    → DELIVERED   (the kitchen's own)
 *
 * Nothing moves backwards except an Undo of the LAST step, by its event,
 * within {@link UNDO_WINDOW_MS}. The status table stays forward-only; an
 * undo restores the exact from-state its event recorded instead.
 */

// The vocabularies live with the DTOs that validate them (dto.ts), so this
// module and dto.ts never import each other.
export { ORDER_FULFILMENTS, ORDER_STAGES } from "./dto";
export type { OrderFulfilment, OrderStage } from "./dto";
export type { StageMove } from "./fulfilment";

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

/**
 * Every legal forward move, per type. Terminal
 * stages have none; appointments have none at all.
 */
export const STAGE_MOVES: Readonly<
    Record<FulfilmentType, readonly StageMove[]>
> = Object.fromEntries(FULFILMENT_TYPES.map((t) => [t, movesFor(t)])) as Record<
    FulfilmentType,
    readonly StageMove[]
>;

/** A stage in the words of a sentence ("already collected", B6). */
export const STAGE_WORDS: Record<OrderStage, string> = {
    NEW: "new",
    PREPARING: "preparing",
    READY: "ready",
    COLLECTED: "collected",
    HANDED_TO_COURIER: "handed to the courier",
    DELIVERED: "delivered",
    OUT_FOR_DELIVERY: "out for delivery",
    SENT: "sent",
};

/** What the service knows about an order when it asks for a move. */
export interface StageSubject {
    stage: OrderStage;
    status: string;
    paymentStatus: string;
    /** As stored (read through `typeOf`). */
    fulfilment: OrderFulfilment;
    /**
     * Placed at the site's checkout to be paid at the handover ("Pay when
     * you collect", "Pay on delivery"). Absent reads as false.
     */
    payOnHandover?: boolean;
}

/**
 * Whether a move waits for the money. An order is made, or sent, only once
 * it is paid: its first step out of New needs the payment. An order the
 * customer pays at the handover is made and brought before the money, so
 * only the handover itself — collected, or delivered — waits for it.
 */
export function moveAwaitsPayment(
    move: Pick<StageMove, "from" | "toStatus">,
    order: Pick<StageSubject, "paymentStatus" | "payOnHandover">,
): boolean {
    if (order.paymentStatus === "PAID") return false;
    return order.payOnHandover
        ? move.toStatus === "DELIVERED"
        : move.from === "NEW";
}

/**
 * The next step(s) an order can take from where it is, for the screen. An
 * unpaid order has none until it is paid — the kitchen is blocked, and the
 * screen says why from `paymentStatus` — except one paid at the handover,
 * which goes as far as the handover.
 */
export function nextStages(order: StageSubject): OrderStage[] {
    if (order.status === "CANCELLED") return [];
    return STAGE_MOVES[typeOf(order.fulfilment)]
        .filter(
            (m) =>
                m.from === order.stage &&
                m.fromStatus === order.status &&
                !moveAwaitsPayment(m, order),
        )
        .map((m) => m.to);
}

/**
 * Work out a forward move, or refuse it. Throws 400 for a move the order's
 * type does not have, and 409 when the order's own state forbids it now
 * (cancelled, unpaid, out of step with its status). Returns the move to
 * write.
 */
export function planStageMove(order: StageSubject, to: OrderStage): StageMove {
    if (order.status === "CANCELLED") {
        throw new ConflictException({
            message: "This order was cancelled, so it does not move on.",
            field: "stage",
        });
    }
    const type = typeOf(order.fulfilment);
    const rule = FULFILMENT_RULES[type];
    if (rule.visits) {
        throw new BadRequestException({
            message: "A booking moves on by its visits, not by order steps.",
            field: "stage",
        });
    }
    const move = STAGE_MOVES[type].find(
        (m) => m.from === order.stage && m.to === to,
    );
    if (!move) throw new BadRequestException(wrongMove(type, order.stage, to));
    if (order.status !== move.fromStatus) {
        // A stage and a status that disagree — an order moved by the old
        // status PATCH. Refused rather than guessed at.
        throw new ConflictException({
            message: `This order's status (${order.status}) does not match its kitchen step. Reload it and try again.`,
            field: "stage",
        });
    }
    // Paid at the handover: it is made and brought first, and handed over
    // once the money is taken and marked.
    if (order.payOnHandover && moveAwaitsPayment(move, order)) {
        throw new ConflictException({
            message:
                type === "PICKUP"
                    ? "This order is paid when it's collected. Mark it paid first, then mark it collected."
                    : "This order is paid on delivery. Mark it paid first, then mark it delivered.",
            field: "paymentStatus",
        });
    }
    // The first step out of New needs the money: nothing is made, or sent,
    // for an order nobody paid for.
    if (moveAwaitsPayment(move, order)) {
        throw new ConflictException({
            message:
                move.to === "PREPARING"
                    ? "This order is not paid yet, so it cannot start preparing. Take the payment first."
                    : "This order is not paid yet, so it cannot be sent. Take the payment first.",
            field: "paymentStatus",
        });
    }
    if (move.fromStatus !== move.toStatus && !move.direct) {
        assertStatusTransition(move.fromStatus, move.toStatus);
    }
    return move;
}

/** Why a move isn't this order's, in the words today's screen knows. */
function wrongMove(
    type: FulfilmentType,
    stage: OrderStage,
    to: OrderStage,
): { message: string; field: string } {
    const courier = to === "HANDED_TO_COURIER" || to === "OUT_FOR_DELIVERY";
    // Where a ready order goes next, in the type's own words.
    const handover = STAGE_MOVES[type].find((m) => m.from === "READY")?.to;
    if (to === "COLLECTED" && type !== "PICKUP" && stage === "READY") {
        return {
            message:
                handover === "OUT_FOR_DELIVERY"
                    ? "This order is a local delivery, so it goes out for delivery, not collected."
                    : "This order is for delivery, so it is handed to a courier, not collected.",
            field: "stage",
        };
    }
    if (courier && type === "PICKUP" && stage === "READY") {
        return {
            message:
                "This order is collected at the counter, so it is not handed to a courier.",
            field: "stage",
        };
    }
    if (courier && stage === "READY" && handover && handover !== to) {
        return {
            message:
                handover === "OUT_FOR_DELIVERY"
                    ? "This order is a local delivery, so it goes out for delivery, not to a courier."
                    : "This order is a shipment, so it is handed to a courier, not sent out for delivery.",
            field: "stage",
        };
    }
    return {
        message: `An order that is ${STAGE_WORDS[stage]} cannot become ${STAGE_WORDS[to]}.`,
        field: "stage",
    };
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

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The kitchen step a status change made OUTSIDE the kitchen flow implies —
 * the store-scoped status PATCH that predates stages. Keeps the two in step
 * so the next kitchen move is not refused as out of step. A cancel leaves
 * the stage where it was.
 *
 * It never changes how the order is fulfilled (it used to turn anything
 * SHIPPED into a delivery). A status the order's type has no step for is
 * refused with 409 and a sentence, before anything is written.
 */
export function stageForStatus(
    status: OrderStatus,
    current: { stage: OrderStage; fulfilment: OrderFulfilment },
): { stage: OrderStage } {
    const type = typeOf(current.fulfilment);
    const rule = FULFILMENT_RULES[type];
    switch (status) {
        case "PENDING":
            return { stage: "NEW" };
        case "PROCESSING": {
            // A type with no Preparing step (Digital, appointments) stays
            // where it is.
            if (!rule.steps.some((s) => s.stage === "PREPARING")) {
                return { stage: current.stage };
            }
            return {
                stage: current.stage === "READY" ? "READY" : "PREPARING",
            };
        }
        case "SHIPPED": {
            if (type === "SHIPPING") return { stage: "HANDED_TO_COURIER" };
            if (type === "LOCAL_DELIVERY") {
                // Already with a courier the old way, it stays there.
                return {
                    stage:
                        current.stage === "HANDED_TO_COURIER"
                            ? "HANDED_TO_COURIER"
                            : "OUT_FOR_DELIVERY",
                };
            }
            throw new ConflictException({
                message: `${capital(rule.noun)} isn't shipped. Change how it's fulfilled first.`,
                field: "status",
            });
        }
        case "DELIVERED": {
            if (rule.visits) {
                throw new ConflictException({
                    message:
                        "A booking is finished by its visits, not marked delivered.",
                    field: "status",
                });
            }
            return { stage: rule.done };
        }
        case "CANCELLED":
        default:
            return { stage: current.stage };
    }
}
