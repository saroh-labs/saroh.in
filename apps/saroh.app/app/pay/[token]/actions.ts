"use server";

import type { StartResult } from "@/lib/invoice-pay";
import { startInvoicePayment } from "@/lib/invoice-pay";

/**
 * The Pay button's submit, run on this server so the API is reached
 * server-to-server. It sends only the token and an idempotency key: the API
 * decides the amount from the invoice.
 */
export async function startPayment(
    token: string,
    idempotencyKey: string,
): Promise<StartResult> {
    return startInvoicePayment(token, idempotencyKey);
}
