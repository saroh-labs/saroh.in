"use server";

import type { CourierFields } from "./courier";
import type {
    ChangeFulfilmentInput,
    EditOrderInput,
    MoveStageInput,
} from "./kitchen-service";
import {
    cancelOrderInFull,
    changeOrderFulfilment,
    createOrderPayLink,
    editOrderBeforePreparing,
    moveOrderStage,
    refundOrderLines,
    retryOrderRefund,
    saveOrderCourier,
    undoOrderStage,
} from "./kitchen-service";
import type { OrderResult, UpdateOrderInput } from "./service";
import { updateOrder as updateOrderApi } from "./service";

/**
 * Server Actions for orders — forward the cookie to api (write =
 * owner/EDITOR+). Taking an order is New order's (`new-order-actions.ts`).
 */

export async function updateOrder(
    storeId: string,
    orderId: string,
    input: UpdateOrderInput,
): Promise<OrderResult> {
    return updateOrderApi(storeId, orderId, input);
}

/* One order's kitchen flow (ADR-008) — org-scoped; the API authorizes each. */

export async function moveStage(orderId: string, input: MoveStageInput) {
    return moveOrderStage(orderId, input);
}

export async function saveCourier(orderId: string, input: CourierFields) {
    return saveOrderCourier(orderId, input);
}

export async function undoStage(orderId: string, eventId: string) {
    return undoOrderStage(orderId, eventId);
}

export async function editBeforePreparing(
    orderId: string,
    input: EditOrderInput,
) {
    return editOrderBeforePreparing(orderId, input);
}

export async function refundLines(
    orderId: string,
    input: {
        lines: { itemId: string; quantity: number }[] | null;
        putBack?: { itemId: string; quantity: number }[];
        reason?: string | null;
        goodwill?: string | null;
        idempotencyKey: string;
    },
) {
    return refundOrderLines(orderId, input);
}

export async function retryRefund(orderId: string, refundId: string) {
    return retryOrderRefund(orderId, refundId);
}

/** Make the order's pay link, or replace it (B11). */
export async function makeOrderPayLink(orderId: string) {
    return createOrderPayLink(orderId);
}

/** "Change how it's fulfilled…" (B9). */
export async function changeFulfilment(
    orderId: string,
    input: ChangeFulfilmentInput,
) {
    return changeOrderFulfilment(orderId, input);
}

/** "Cancel order…" — a refund in full, kept as cancelled (B9). */
export async function cancelOrder(
    orderId: string,
    input: { reason: string | null; idempotencyKey: string; tell?: boolean },
) {
    return cancelOrderInFull(orderId, input);
}
