"use server";

import type { StartResult } from "@/lib/invoice-pay";
import { startOrderPayment } from "@/lib/order-pay";

/**
 * The Pay button's submit, run on this server so the API is reached
 * server-to-server. It sends only the token and an idempotency key: the API
 * decides the amount from the order.
 */
export async function startPayment(
    token: string,
    idempotencyKey: string,
): Promise<StartResult> {
    return startOrderPayment(token, idempotencyKey);
}
