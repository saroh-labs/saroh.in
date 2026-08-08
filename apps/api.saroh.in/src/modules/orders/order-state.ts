import { BadRequestException } from "@nestjs/common";

import type { OrderStatus, PaymentStatus } from "./dto";

/**
 * Order lifecycle state machine (S5-001).
 *
 * The SINGLE source of truth for "which Order status/paymentStatus change is
 * legal". Deliberately pure (no Nest DI, no Prisma, no request) so it is
 * trivially unit-testable and so lifecycle rules are never scattered as ad-hoc
 * checks across handlers. The service loads the current order and asks
 * `assertStatusTransition(current, next)` BEFORE writing; an illegal move is
 * rejected with a 400 that names the from→to, and nothing is persisted.
 *
 * Commerce semantics:
 *  - PENDING    → PROCESSING | CANCELLED   (not yet worked or dropped)
 *  - PROCESSING → SHIPPED    | CANCELLED   (worked, then dispatched or dropped)
 *  - SHIPPED    → DELIVERED                (in the customer's hands — a shipped
 *                                           order can no longer be cancelled)
 *  - DELIVERED  → {}                        (terminal)
 *  - CANCELLED  → {}                        (terminal)
 *
 * Payment semantics:
 *  - UNPAID   → PAID | FAILED
 *  - FAILED   → PAID        (a retried charge succeeds)
 *  - PAID     → REFUNDED
 *  - REFUNDED → {}          (terminal)
 *
 * No-op policy: a same→same "transition" (e.g. SHIPPED→SHIPPED) is NOT a legal
 * transition and is deliberately absent from the maps. The service treats
 * same→same as a no-op and never asserts it (so re-PATCHing an unchanged status
 * stays idempotent); only an ACTUAL change is funnelled through the guard.
 */

/** Allowed order-status transitions. Terminal states map to an empty set. */
export const STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    PENDING: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
};

/** Allowed payment-status transitions. Terminal states map to an empty set. */
export const PAYMENT_TRANSITIONS: Record<
    PaymentStatus,
    readonly PaymentStatus[]
> = {
    UNPAID: ["PAID", "FAILED"],
    FAILED: ["PAID"],
    PAID: ["REFUNDED"],
    REFUNDED: [],
};

/** Pure predicate: is moving an order `from` → `to` status a legal transition? */
export function canTransitionStatus(
    from: OrderStatus,
    to: OrderStatus,
): boolean {
    return STATUS_TRANSITIONS[from].includes(to);
}

/** Pure predicate: is moving payment `from` → `to` a legal transition? */
export function canTransitionPayment(
    from: PaymentStatus,
    to: PaymentStatus,
): boolean {
    return PAYMENT_TRANSITIONS[from].includes(to);
}

/**
 * Enforce the order-status state machine. Throws `BadRequestException` (mapped
 * to 400 by the global filter) naming the illegal from→to; returns silently
 * when the transition is allowed.
 */
export function assertStatusTransition(
    from: OrderStatus,
    to: OrderStatus,
): void {
    if (!canTransitionStatus(from, to)) {
        throw new BadRequestException({
            message: `Illegal order status transition ${from} → ${to}`,
            field: "status",
        });
    }
}

/**
 * Enforce the payment-status state machine. Throws `BadRequestException`
 * (mapped to 400) naming the illegal from→to; returns silently when allowed.
 */
export function assertPaymentTransition(
    from: PaymentStatus,
    to: PaymentStatus,
): void {
    if (!canTransitionPayment(from, to)) {
        throw new BadRequestException({
            message: `Illegal payment status transition ${from} → ${to}`,
            field: "paymentStatus",
        });
    }
}
