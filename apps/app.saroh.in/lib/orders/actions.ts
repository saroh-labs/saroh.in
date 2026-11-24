"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

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
 *
 * Each takes the tab's business last (`orgId`, from `useOrderSave`) and
 * writes through `writeAsOrg`, which refuses a moved tab and revalidates
 * nothing: the Orders screens and Home are on React Query and read their
 * queries again (DEC-259).
 */

/** The write, as the tab's business when the screen names it. */
function as<R>(orgId: string | undefined, write: () => Promise<R>) {
    return orgId ? writeAsOrg(orgId, write) : write();
}

export async function updateOrder(
    storeId: string,
    orderId: string,
    input: UpdateOrderInput,
    orgId?: string,
): Promise<OrderResult> {
    return as(orgId, () => updateOrderApi(storeId, orderId, input));
}

/* One order's kitchen flow (ADR-008) — org-scoped; the API authorizes each. */

export async function moveStage(
    orderId: string,
    input: MoveStageInput,
    orgId?: string,
) {
    return as(orgId, () => moveOrderStage(orderId, input));
}

export async function saveCourier(
    orderId: string,
    input: CourierFields,
    orgId?: string,
) {
    return as(orgId, () => saveOrderCourier(orderId, input));
}

/** "Mark visit N attended" on a treatment's order (B14). */
export async function markVisitAttended(
    orderId: string,
    visitNumber: number,
    orgId?: string,
) {
    return as(orgId, () => markOrderVisitAttended(orderId, visitNumber));
}

export async function undoStage(
    orderId: string,
    eventId: string,
    orgId?: string,
) {
    return as(orgId, () => undoOrderStage(orderId, eventId));
}

export async function editBeforePreparing(
    orderId: string,
    input: EditOrderInput,
    orgId?: string,
) {
    return as(orgId, () => editOrderBeforePreparing(orderId, input));
}

export async function recordPayment(
    orderId: string,
    kind: CounterPayment,
    orgId?: string,
) {
    return as(orgId, () => recordOrderPayment(orderId, kind));
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
    orgId?: string,
) {
    return as(orgId, () => refundOrderLines(orderId, input));
}

export async function retryRefund(
    orderId: string,
    refundId: string,
    orgId?: string,
) {
    return as(orgId, () => retryOrderRefund(orderId, refundId));
}

/** Make the order's payment link, or replace it (B11). */
export async function makeOrderPayLink(orderId: string, orgId?: string) {
    return as(orgId, () => createOrderPayLink(orderId));
}

/** "Change how it's fulfilled…" (B9). */
export async function changeFulfilment(
    orderId: string,
    input: ChangeFulfilmentInput,
    orgId?: string,
) {
    return as(orgId, () => changeOrderFulfilment(orderId, input));
}

/** "Cancel order…" — a refund in full, kept as cancelled (B9). */
export async function cancelOrder(
    orderId: string,
    input: { reason: string | null; idempotencyKey: string; tell?: boolean },
    orgId?: string,
) {
    return as(orgId, () => cancelOrderInFull(orderId, input));
}
