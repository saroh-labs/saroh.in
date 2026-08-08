"use server";

import type {
    CreateOrderInput,
    OrderResult,
    UpdateOrderInput,
} from "./service";
import {
    createOrder as createOrderApi,
    updateOrder as updateOrderApi,
} from "./service";

/** Server Actions for orders — forward the cookie to api (write = owner/EDITOR+). */

export async function createOrder(
    storeId: string,
    input: CreateOrderInput,
): Promise<OrderResult> {
    return createOrderApi(storeId, input);
}

export async function updateOrder(
    storeId: string,
    orderId: string,
    input: UpdateOrderInput,
): Promise<OrderResult> {
    return updateOrderApi(storeId, orderId, input);
}
