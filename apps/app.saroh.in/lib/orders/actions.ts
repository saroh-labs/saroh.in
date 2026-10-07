"use server";

import { revalidatePath } from "next/cache";

import type { CourierFields } from "./courier";
import type {
    ChangeFulfilmentInput,
    CounterPayment,
    EditOrderInput,
    MoveStageInput,
} from "./kitchen-service";
import {
    cancelOrderInFull,
    changeOrderFulfilment,
    createOrderPayLink,
    editOrderBeforePreparing,
    markOrderVisitAttended,
    moveOrderStage,
    recordOrderPayment,
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
    const res = await updateOrderApi(storeId, orderId, input);
    // Record as paid / refunded / cancelled: the order page and the list
    // read again in the same round trip, so the money panel isn't left
    // saying "Still due" until a reload (UX-063).
    if (res.ok) {
        revalidatePath(`/commerce/orders/${orderId}`);
        revalidatePath("/commerce/orders");
    }
    return res;
}

/** Same as updateOrder, for the kitchen's own writes. */
function refreshOrder(orderId: string) {
    revalidatePath(`/commerce/orders/${orderId}`);
}

/* One order's kitchen flow (ADR-008) — org-scoped; the API authorizes each. */

export async function moveStage(orderId: string, input: MoveStageInput) {
    return moveOrderStage(orderId, input);
}

export async function saveCourier(orderId: string, input: CourierFields) {
    return saveOrderCourier(orderId, input);
}

/** "Mark visit N attended" on a treatment's order (B14). */
export async function markVisitAttended(orderId: string, visitNumber: number) {
    return markOrderVisitAttended(orderId, visitNumber);
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

export async function recordPayment(orderId: string, kind: CounterPayment) {
    const res = await recordOrderPayment(orderId, kind);
    if (res.ok) refreshOrder(orderId);
    return res;
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
